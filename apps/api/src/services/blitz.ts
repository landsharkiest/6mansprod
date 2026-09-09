import type {
  BlitzFinishResponse,
  BlitzGuessResponse,
  BlitzLeaderboardEntry,
  BlitzLeaderboardPeriod,
  BlitzRunSummary,
  BlitzStartResponse,
  Rank,
} from '@6mansdle/shared';
import { BLITZ_DURATION_MS, BLITZ_GRACE_MS, BLITZ_WRONG_PENALTY_MS, blitzPoints } from '@6mansdle/shared';
import { pool, withTransaction, type Queryable } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';
import { avatarUrl } from '../auth/users.js';
import { pickRandomApprovedClip, pickRandomApprovedClipExcluding, toPlayable } from './clips.js';

interface BlitzRunRow {
  id: number;
  user_id: number | null;
  started_at: string;
  expires_at: string;
  status: 'active' | 'finished';
  current_clip_id: string | null;
  clip_served_at: string | null;
  score: number;
  correct_count: number;
  total_count: number;
  best_streak: number;
  current_streak: number;
  finished_at: string | null;
  seen_clip_ids: string[];
}

function toSummary(row: BlitzRunRow): BlitzRunSummary {
  return {
    runId: row.id,
    score: row.score,
    correctCount: row.correct_count,
    totalCount: row.total_count,
    bestStreak: row.best_streak,
  };
}

async function getRun(db: Queryable, runId: number): Promise<BlitzRunRow | null> {
  const { rows } = await db.query<BlitzRunRow>('SELECT * FROM blitz_runs WHERE id = $1', [runId]);
  return rows[0] ?? null;
}

/** Starts a new run for a user (or guest) and hands back the first clip. */
export async function startBlitzRun(userId: number | null): Promise<BlitzStartResponse> {
  const clip = await pickRandomApprovedClip();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BLITZ_DURATION_MS);

  const { rows } = await pool.query<BlitzRunRow>(
    `INSERT INTO blitz_runs (user_id, started_at, expires_at, status, current_clip_id, clip_served_at, seen_clip_ids)
     VALUES ($1, $2, $3, 'active', $4, $2, $5::jsonb)
     RETURNING *`,
    [userId, now.toISOString(), expiresAt.toISOString(), clip.id, JSON.stringify([clip.id])],
  );
  const run = rows[0]!;

  return { runId: run.id, endsAt: run.expires_at, clip: await toPlayable(clip) };
}

/** Marks an active run finished (idempotent) and returns the (possibly already-finished) row. */
async function finalizeRun(client: Queryable, run: BlitzRunRow): Promise<BlitzRunRow> {
  if (run.status === 'finished') return run;
  const { rows } = await client.query<BlitzRunRow>(
    `UPDATE blitz_runs SET status = 'finished', finished_at = now()
      WHERE id = $1 AND status = 'active'
      RETURNING *`,
    [run.id],
  );
  return rows[0] ?? (await getRun(client, run.id)) ?? run;
}

/** True when a run should still accept guesses: active, and not past its deadline plus grace. */
function isRunActive(run: BlitzRunRow, now: Date): boolean {
  return run.status === 'active' && now.getTime() <= new Date(run.expires_at).getTime() + BLITZ_GRACE_MS;
}

interface GuessArgs {
  runId: number;
  clipId: string;
  rank: Rank;
}

export async function submitBlitzGuess(
  { runId, clipId, rank }: GuessArgs,
): Promise<BlitzGuessResponse | { expired: BlitzFinishResponse }> {
  return withTransaction(async (client) => {
    const { rows: locked } = await client.query<BlitzRunRow>('SELECT * FROM blitz_runs WHERE id = $1 FOR UPDATE', [runId]);
    const run = locked[0];
    if (!run) throw notFound('Blitz run not found');

    const now = new Date();

    if (!isRunActive(run, now)) {
      const finished = await finalizeRun(client, run);
      return { expired: { ...toSummary(finished), finishedAt: finished.finished_at ?? now.toISOString() } };
    }

    if (run.current_clip_id !== clipId) throw badRequest('That is not this run\'s current clip');

    const { rows: clipRows } = await client.query<{ id: string; rank: Rank }>(
      'SELECT id, rank FROM clips WHERE id = $1',
      [run.current_clip_id],
    );
    const clip = clipRows[0];
    if (!clip) throw notFound('Clip not found');

    const servedAt = run.clip_served_at ? new Date(run.clip_served_at).getTime() : now.getTime();
    const elapsedMs = Math.max(0, now.getTime() - servedAt);
    const correct = clip.rank === rank;
    const points = blitzPoints(correct, elapsedMs);

    const nextExpiresAt = correct
      ? new Date(run.expires_at)
      : new Date(new Date(run.expires_at).getTime() - BLITZ_WRONG_PENALTY_MS);

    const newScore = run.score + points;
    const newCorrect = run.correct_count + (correct ? 1 : 0);
    const newTotal = run.total_count + 1;
    const newCurrentStreak = correct ? run.current_streak + 1 : 0;
    const newBestStreak = Math.max(run.best_streak, newCurrentStreak);

    // Blitz guesses are recorded like any other mode (for the clip's guess distribution), but
    // deliberately never touch user_endless_stats/user_daily_stats or achievement totals --
    // see routes/blitz.ts for the full rationale.
    await client.query(
      `INSERT INTO guesses (clip_id, user_id, daily_id, mode, guessed_rank, actual_rank, is_correct, counted)
       VALUES ($1, $2, NULL, 'blitz', $3, $4, $5, TRUE)`,
      [clip.id, run.user_id, rank, clip.rank, correct],
    );

    const stillActive = now.getTime() < nextExpiresAt.getTime();

    let nextClip: Awaited<ReturnType<typeof toPlayable>> | null = null;
    let nextClipId: string | null = null;
    let nextServedAt: string | null = null;
    let seenIds: string[] = Array.isArray(run.seen_clip_ids) ? run.seen_clip_ids : [];

    if (stillActive) {
      const picked = await pickRandomApprovedClipExcluding(seenIds);
      nextClip = await toPlayable(picked);
      nextClipId = picked.id;
      nextServedAt = now.toISOString();
      seenIds = [...seenIds, picked.id];
    }

    const { rows: updated } = await client.query<BlitzRunRow>(
      `UPDATE blitz_runs
          SET score = $2, correct_count = $3, total_count = $4,
              current_streak = $5, best_streak = $6, expires_at = $7,
              current_clip_id = $8, clip_served_at = $9, seen_clip_ids = $10::jsonb,
              status = CASE WHEN $11 THEN status ELSE 'finished' END,
              finished_at = CASE WHEN $11 THEN finished_at ELSE now() END
        WHERE id = $1
        RETURNING *`,
      [
        run.id,
        newScore,
        newCorrect,
        newTotal,
        newCurrentStreak,
        newBestStreak,
        nextExpiresAt.toISOString(),
        nextClipId,
        nextServedAt,
        JSON.stringify(seenIds),
        stillActive,
      ],
    );
    const finalRun = updated[0]!;

    return {
      correct,
      actualRank: clip.rank,
      points,
      score: finalRun.score,
      correctCount: finalRun.correct_count,
      totalCount: finalRun.total_count,
      currentStreak: finalRun.current_streak,
      bestStreak: finalRun.best_streak,
      endsAt: finalRun.expires_at,
      nextClip,
      finished: !stillActive,
    };
  });
}

export async function finishBlitzRun(runId: number): Promise<BlitzFinishResponse> {
  return withTransaction(async (client) => {
    const { rows: locked } = await client.query<BlitzRunRow>('SELECT * FROM blitz_runs WHERE id = $1 FOR UPDATE', [runId]);
    const run = locked[0];
    if (!run) throw notFound('Blitz run not found');
    const finished = await finalizeRun(client, run);
    return { ...toSummary(finished), finishedAt: finished.finished_at ?? new Date().toISOString() };
  });
}

const PERIOD_FILTER: Record<BlitzLeaderboardPeriod, string> = {
  today: "finished_at >= date_trunc('day', now())",
  week: "finished_at >= date_trunc('week', now())",
  all: 'TRUE',
};

/** Top 50 by score, one (best) finished run per signed-in user. Guests never appear. */
export async function blitzLeaderboard(period: BlitzLeaderboardPeriod): Promise<BlitzLeaderboardEntry[]> {
  const { rows } = await pool.query<{
    user_id: number;
    username: string;
    discord_id: string;
    avatar_hash: string | null;
    score: number;
    correct_count: number;
    total_count: number;
    best_streak: number;
    finished_at: string;
  }>(
    `SELECT DISTINCT ON (b.user_id)
            b.user_id, u.username, u.discord_id, u.avatar_hash,
            b.score, b.correct_count, b.total_count, b.best_streak, b.finished_at
       FROM blitz_runs b
       JOIN users u ON u.id = b.user_id
      WHERE b.status = 'finished' AND b.user_id IS NOT NULL AND ${PERIOD_FILTER[period]}
      ORDER BY b.user_id, b.score DESC, b.finished_at ASC`,
  );

  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((r) => ({
      user: { id: r.user_id, username: r.username, avatarUrl: avatarUrl(r.discord_id, r.avatar_hash) },
      score: r.score,
      correctCount: r.correct_count,
      totalCount: r.total_count,
      bestStreak: r.best_streak,
      finishedAt: new Date(r.finished_at).toISOString(),
    }));
}

/** The signed-in user's best (highest-score) finished run, or null if they've never finished one. */
export async function blitzPersonalBest(userId: number): Promise<BlitzRunSummary | null> {
  const { rows } = await pool.query<BlitzRunRow>(
    `SELECT * FROM blitz_runs
      WHERE user_id = $1 AND status = 'finished'
      ORDER BY score DESC, finished_at ASC
      LIMIT 1`,
    [userId],
  );
  return rows[0] ? toSummary(rows[0]) : null;
}
