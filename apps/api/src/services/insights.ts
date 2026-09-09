import {
  INSIGHTS_MIN_GUESSES,
  INSIGHTS_WEEKS,
  RANKS,
  type AccuracyWeekBucket,
  type BlindSpot,
  type ProfileInsights,
  type ProfileInsightsUnlocked,
  type Rank,
  type RankStrength,
  type VsCommunityRank,
} from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { buildConfusionMatrix, perRankAccuracyFromPairs, type RankPairCount } from './confusionMatrix.js';
import { computeRankBias, signedDistance } from './rankBias.js';
import { getCommunityStats } from './communityStats.js';
import { TtlCache } from './ttlCache.js';

const pct = (correct: number, total: number) => (total ? Math.round((correct / total) * 1000) / 10 : 0);

// ---------------------------------------------------------------------------------------------
// Pure aggregation helpers — no database access, unit tested directly. Only computeUserInsights
// at the bottom of this file touches SQL.
// ---------------------------------------------------------------------------------------------

export interface WeekAgg {
  /** ISO date (UTC) of the Monday starting this week. */
  weekStart: string;
  guesses: number;
  correct: number;
}

/** The UTC Monday (00:00) of the ISO week containing `d`. */
export function mondayOf(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fills a full sequence of `numWeeks` Monday-starting weeks ending on the week containing `now`,
 * oldest first, using sparse per-week aggregates (weeks with no guesses come back zero-filled).
 */
export function buildWeeklyAccuracy(weekAggs: WeekAgg[], numWeeks: number, now: Date): AccuracyWeekBucket[] {
  const byWeek = new Map(weekAggs.map((w) => [w.weekStart, w]));
  const thisMonday = mondayOf(now);

  const buckets: AccuracyWeekBucket[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekDate = new Date(thisMonday);
    weekDate.setUTCDate(weekDate.getUTCDate() - i * 7);
    const weekStart = isoDate(weekDate);
    const agg = byWeek.get(weekStart);
    const guesses = agg?.guesses ?? 0;
    const correct = agg?.correct ?? 0;
    buckets.push({ weekStart, guesses, correct, accuracy: pct(correct, guesses) });
  }
  return buckets;
}

const MIN_STRENGTH_GUESSES = 5;

/** Top ranks by accuracy, restricted to ranks with at least MIN_STRENGTH_GUESSES guesses. */
export function pickStrengths(pairs: RankPairCount[], limit = 3): RankStrength[] {
  return perRankAccuracyFromPairs(pairs)
    .filter((r) => r.totalGuesses >= MIN_STRENGTH_GUESSES)
    .sort((a, b) => b.accuracy - a.accuracy || b.totalGuesses - a.totalGuesses)
    .slice(0, limit)
    .map((r) => ({ rank: r.rank, totalGuesses: r.totalGuesses, correctGuesses: r.correctGuesses, accuracy: r.accuracy }));
}

/**
 * Top actual ranks the player most often gets wrong (by wrong-guess count), each paired with
 * their most common incorrect guess for that rank. Ranks with zero wrong guesses are excluded.
 */
export function pickBlindSpots(pairs: RankPairCount[], limit = 3): BlindSpot[] {
  const totals = new Map<Rank, number>();
  const correct = new Map<Rank, number>();
  const wrongByActual = new Map<Rank, Map<Rank, number>>();

  for (const p of pairs) {
    totals.set(p.actualRank, (totals.get(p.actualRank) ?? 0) + p.count);
    if (p.actualRank === p.guessedRank) {
      correct.set(p.actualRank, (correct.get(p.actualRank) ?? 0) + p.count);
    } else {
      const byGuess = wrongByActual.get(p.actualRank) ?? new Map<Rank, number>();
      byGuess.set(p.guessedRank, (byGuess.get(p.guessedRank) ?? 0) + p.count);
      wrongByActual.set(p.actualRank, byGuess);
    }
  }

  const spots: BlindSpot[] = [];
  for (const rank of RANKS) {
    const total = totals.get(rank) ?? 0;
    const correctCount = correct.get(rank) ?? 0;
    const wrongCount = total - correctCount;
    if (wrongCount <= 0) continue;

    let mostCommonWrongGuess: Rank | null = null;
    let mostCommonWrongGuessCount = 0;
    for (const [guessed, count] of wrongByActual.get(rank) ?? []) {
      if (count > mostCommonWrongGuessCount) {
        mostCommonWrongGuess = guessed;
        mostCommonWrongGuessCount = count;
      }
    }

    spots.push({
      actualRank: rank,
      totalGuesses: total,
      correctGuesses: correctCount,
      accuracy: pct(correctCount, total),
      mostCommonWrongGuess,
      mostCommonWrongGuessCount,
    });
  }

  spots.sort((a, b) => b.totalGuesses - b.correctGuesses - (a.totalGuesses - a.correctGuesses));
  return spots.slice(0, limit);
}

/** Average signed rank distance across every pair, weighted by count. Null with no data. */
export function computeOverallBias(pairs: RankPairCount[]): number | null {
  let sum = 0;
  let total = 0;
  for (const p of pairs) {
    sum += signedDistance(p.actualRank, p.guessedRank) * p.count;
    total += p.count;
  }
  return total ? Math.round((sum / total) * 100) / 100 : null;
}

/** Per-rank user accuracy next to the community's, so the profile can show "you vs everyone". */
export function buildVsCommunity(
  userPerRank: Array<{ rank: Rank; totalGuesses: number; accuracy: number }>,
  communityPerRank: Array<{ rank: Rank; accuracy: number }>,
): VsCommunityRank[] {
  const communityByRank = new Map(communityPerRank.map((r) => [r.rank, r.accuracy]));
  return userPerRank.map((u) => ({
    rank: u.rank,
    userAccuracy: u.totalGuesses > 0 ? u.accuracy : null,
    userGuesses: u.totalGuesses,
    communityAccuracy: communityByRank.get(u.rank) ?? 0,
  }));
}

// ---------------------------------------------------------------------------------------------
// Database-facing: runs the SQL and wires the pure helpers above together, then caches the
// result per user for a minute (recomputing the full payload on every profile view is wasteful,
// and a stale-by-a-minute insights panel is fine).
// ---------------------------------------------------------------------------------------------

const INSIGHTS_TTL_MS = 60_000;
const MAX_CACHED_USERS = 500;
const userCaches = new Map<number, TtlCache<ProfileInsights>>();

function getUserCache(userId: number): TtlCache<ProfileInsights> {
  let cache = userCaches.get(userId);
  if (!cache) {
    if (userCaches.size >= MAX_CACHED_USERS) {
      // Bound the map's size with simple FIFO eviction — insertion order is preserved by Map,
      // and an occasional early eviction under heavy traffic just costs one extra recompute.
      const oldestKey = userCaches.keys().next().value;
      if (oldestKey !== undefined) userCaches.delete(oldestKey);
    }
    cache = new TtlCache<ProfileInsights>(INSIGHTS_TTL_MS);
    userCaches.set(userId, cache);
  }
  return cache;
}

async function computeUserInsights(userId: number): Promise<ProfileInsights> {
  const totalsRow = await pool.query<{ total: number; correct: number }>(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_correct)::int AS correct
       FROM guesses WHERE user_id = $1 AND counted`,
    [userId],
  );
  const t = totalsRow.rows[0]!;

  if (t.total < INSIGHTS_MIN_GUESSES) {
    return { locked: true, needed: INSIGHTS_MIN_GUESSES - t.total };
  }

  const [pairRows, weekRows, community] = await Promise.all([
    pool.query<{ actual_rank: Rank; guessed_rank: Rank; count: number }>(
      `SELECT actual_rank, guessed_rank, COUNT(*)::int AS count
         FROM guesses WHERE user_id = $1 AND counted GROUP BY actual_rank, guessed_rank`,
      [userId],
    ),
    pool.query<{ week_start: string; guesses: number; correct: number }>(
      `SELECT to_char(date_trunc('week', created_at AT TIME ZONE 'utc'), 'YYYY-MM-DD') AS week_start,
              COUNT(*)::int AS guesses, COUNT(*) FILTER (WHERE is_correct)::int AS correct
         FROM guesses
        WHERE user_id = $1 AND counted
          AND created_at >= now() - ($2 || ' weeks')::interval
        GROUP BY 1`,
      [userId, INSIGHTS_WEEKS],
    ),
    getCommunityStats(),
  ]);

  const pairs: RankPairCount[] = pairRows.rows.map((r) => ({ actualRank: r.actual_rank, guessedRank: r.guessed_rank, count: r.count }));
  const weekAggs: WeekAgg[] = weekRows.rows.map((r) => ({ weekStart: r.week_start, guesses: r.guesses, correct: r.correct }));
  const userPerRank = perRankAccuracyFromPairs(pairs);

  const result: ProfileInsightsUnlocked = {
    locked: false,
    totals: { guesses: t.total, correct: t.correct, accuracy: pct(t.correct, t.total) },
    accuracyOverTime: buildWeeklyAccuracy(weekAggs, INSIGHTS_WEEKS, new Date()),
    personalConfusion: buildConfusionMatrix(pairs),
    blindSpots: pickBlindSpots(pairs),
    strengths: pickStrengths(pairs),
    bias: { overall: computeOverallBias(pairs), perRank: computeRankBias(pairs) },
    vsCommunity: buildVsCommunity(userPerRank, community.perRank),
    communityAccuracy: community.totals.accuracy,
  };
  return result;
}

export async function loadUserInsights(userId: number): Promise<ProfileInsights> {
  const cache = getUserCache(userId);
  const cached = cache.get();
  if (cached) return cached;
  const result = await computeUserInsights(userId);
  cache.set(result);
  return result;
}

/** Test-only: clears every cached user's insights so integration tests see fresh aggregates. */
export function resetInsightsCacheForTests(): void {
  userCaches.clear();
}
