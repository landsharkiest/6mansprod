import type { ClipDifficulty, CommunityStats, Rank } from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { buildConfusionMatrix, perRankAccuracyFromPairs, type RankPairCount } from './confusionMatrix.js';
import { computeRankBias, pickRankBiasExtremes } from './rankBias.js';
import { topClipsByAccuracy, type ClipGuessAgg } from './clipDifficulty.js';
import { TtlCache } from './ttlCache.js';

const MIN_GUESSES_FOR_CLIP_RANKING = 10;
const CLIP_RANKING_LIMIT = 5;

const pct = (correct: number, total: number) => (total ? Math.round((correct / total) * 1000) / 10 : 0);

/**
 * Builds the full community stats payload from the database. Pure aggregation/ranking logic
 * lives in confusionMatrix.ts, rankBias.ts and clipDifficulty.ts so it can be unit tested
 * without a database; this function only runs the SQL and wires the results together.
 */
export async function loadCommunityStats(): Promise<CommunityStats> {
  const [totalsRow, pairRows, clipRows, approvedClipsRow] = await Promise.all([
    pool.query<{
      total: number;
      correct: number;
      players: number;
      today: number;
      this_week: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE counted)::int AS total,
         COUNT(*) FILTER (WHERE counted AND is_correct)::int AS correct,
         COUNT(DISTINCT user_id) FILTER (WHERE counted AND user_id IS NOT NULL)::int AS players,
         COUNT(*) FILTER (
           WHERE counted AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')
         )::int AS today,
         COUNT(*) FILTER (
           WHERE counted AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc') - interval '6 days'
         )::int AS this_week
       FROM guesses`,
    ),
    pool.query<{ actual_rank: Rank; guessed_rank: Rank; count: number }>(
      `SELECT actual_rank, guessed_rank, COUNT(*)::int AS count
         FROM guesses WHERE counted GROUP BY actual_rank, guessed_rank`,
    ),
    pool.query<{ clip_id: string; actual_rank: Rank; total: number; correct: number }>(
      `SELECT clip_id, actual_rank, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_correct)::int AS correct
         FROM guesses WHERE counted GROUP BY clip_id, actual_rank
        HAVING COUNT(*) >= $1`,
      [MIN_GUESSES_FOR_CLIP_RANKING],
    ),
    pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM clips WHERE status = 'approved' AND upload_completed"),
  ]);

  const t = totalsRow.rows[0]!;
  const pairs: RankPairCount[] = pairRows.rows.map((r) => ({ actualRank: r.actual_rank, guessedRank: r.guessed_rank, count: r.count }));
  const clipAggs: ClipGuessAgg[] = clipRows.rows.map((r) => ({
    clipId: r.clip_id,
    actualRank: r.actual_rank,
    totalGuesses: r.total,
    correctGuesses: r.correct,
  }));
  const { mostOverratedRank, mostUnderratedRank } = pickRankBiasExtremes(computeRankBias(pairs));

  const hardestClips: ClipDifficulty[] = topClipsByAccuracy(clipAggs, 'hardest', MIN_GUESSES_FOR_CLIP_RANKING, CLIP_RANKING_LIMIT);
  const easiestClips: ClipDifficulty[] = topClipsByAccuracy(clipAggs, 'easiest', MIN_GUESSES_FOR_CLIP_RANKING, CLIP_RANKING_LIMIT);

  return {
    totals: {
      totalGuesses: t.total,
      correctGuesses: t.correct,
      accuracy: pct(t.correct, t.total),
      players: t.players,
      approvedClips: approvedClipsRow.rows[0]!.n,
      guessesToday: t.today,
      guessesThisWeek: t.this_week,
    },
    perRank: perRankAccuracyFromPairs(pairs),
    confusionMatrix: buildConfusionMatrix(pairs),
    hardestClips,
    easiestClips,
    mostOverratedRank,
    mostUnderratedRank,
  };
}

// Community stats are aggregate-heavy (confusion matrix, per-clip rankings), so cache the
// computed response for a minute rather than rebuilding it on every caller — both the community
// stats route and the per-user insights endpoint (which needs community accuracy per rank to
// compare against) share this one cache.
const COMMUNITY_STATS_TTL_MS = 60_000;
const communityStatsCache = new TtlCache<CommunityStats>(COMMUNITY_STATS_TTL_MS);

export async function getCommunityStats(): Promise<CommunityStats> {
  let stats = communityStatsCache.get();
  if (!stats) {
    stats = await loadCommunityStats();
    communityStatsCache.set(stats);
  }
  return stats;
}

/** Test-only: clears the cache so integration tests see fresh aggregates after seeding data. */
export function resetCommunityStatsCacheForTests(): void {
  communityStatsCache.clear();
}
