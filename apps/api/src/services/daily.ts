import { pool, withTransaction } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { previousDay, utcToday } from '../lib/dates.js';
import type { ClipRow } from './clips.js';

export interface DailyRow {
  id: number;
  day: string;
  clip: ClipRow;
}

const RECENT_DAYS_TO_AVOID = 30;

/**
 * Returns today's challenge, creating it on first request.
 * Selection prefers clips not used as a daily in the last month; falls back to any approved clip.
 * The unique index on `day` makes concurrent first requests safe.
 */
export async function getOrCreateDaily(day = utcToday()): Promise<DailyRow> {
  const existing = await loadDaily(day);
  if (existing) return existing;

  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT c.id
         FROM clips c
        WHERE c.status = 'approved' AND c.upload_completed
        ORDER BY (
          EXISTS (SELECT 1 FROM daily_challenges d
                   WHERE d.clip_id = c.id AND d.day > CURRENT_DATE - $1::int)
        ) ASC, random()
        LIMIT 1`,
      [RECENT_DAYS_TO_AVOID],
    );
    const clipId = rows[0]?.id;
    if (!clipId) throw notFound('No approved clips available for a daily challenge');
    await client.query(
      'INSERT INTO daily_challenges (day, clip_id) VALUES ($1, $2) ON CONFLICT (day) DO NOTHING',
      [day, clipId],
    );
  });

  const created = await loadDaily(day);
  if (!created) throw new Error('daily challenge vanished after insert');
  return created;
}

async function loadDaily(day: string): Promise<DailyRow | null> {
  const { rows } = await pool.query<{
    id: number;
    day: string;
    clip_id: string;
    s3_key: string;
    rank: ClipRow['rank'];
    status: ClipRow['status'];
    content_type: string;
  }>(
    `SELECT d.id, to_char(d.day, 'YYYY-MM-DD') AS day,
            c.id AS clip_id, c.s3_key, c.rank, c.status, c.content_type
       FROM daily_challenges d JOIN clips c ON c.id = d.clip_id
      WHERE d.day = $1`,
    [day],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    day: r.day,
    clip: { id: r.clip_id, s3_key: r.s3_key, rank: r.rank, status: r.status, content_type: r.content_type },
  };
}

/**
 * The daily's ordinal number: days since the first daily_challenges row, first day = #1.
 * Falls back to 1 if there's no row to anchor against (shouldn't happen once a daily exists).
 */
export async function getDailyNumber(day: string): Promise<number> {
  const { rows } = await pool.query<{ number: number | null }>(
    `SELECT (($1::date - MIN(day)) + 1)::int AS number FROM daily_challenges`,
    [day],
  );
  return rows[0]?.number ?? 1;
}

/**
 * Lightweight daily info for a UI chip: the date and its ordinal number, without the side effect
 * of creating today's challenge (unlike {@link getOrCreateDaily}). Numbering counts calendar days
 * since the first daily, so it matches the number shown in share text even when today's row
 * doesn't exist yet or earlier days were skipped.
 */
export async function getDailyMeta(day = utcToday()): Promise<{ date: string; number: number }> {
  return { date: day, number: await getDailyNumber(day) };
}

export interface StreakState {
  current: number;
  best: number;
}

/**
 * Applies one daily result to a user's streak. Must be called inside the same transaction
 * as the guess insert so a failed insert never bumps the streak.
 */
export async function applyDailyResult(
  client: import('pg').PoolClient,
  userId: number,
  day: string,
  correct: boolean,
): Promise<StreakState> {
  const { rows } = await client.query<{
    current_streak: number;
    best_streak: number;
    last_played: string | null;
  }>(
    `SELECT current_streak, best_streak, to_char(last_played, 'YYYY-MM-DD') AS last_played
       FROM user_daily_stats WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  const prev = rows[0] ?? { current_streak: 0, best_streak: 0, last_played: null };

  // A streak continues only when yesterday was played and today's answer is right.
  const continues = prev.last_played === previousDay(day);
  const current = correct ? (continues ? prev.current_streak + 1 : 1) : 0;
  const best = Math.max(prev.best_streak, current);

  await client.query(
    `INSERT INTO user_daily_stats (user_id, current_streak, best_streak, last_played, played, correct)
     VALUES ($1, $2, $3, $4, 1, $5)
     ON CONFLICT (user_id) DO UPDATE
       SET current_streak = EXCLUDED.current_streak,
           best_streak = EXCLUDED.best_streak,
           last_played = EXCLUDED.last_played,
           played = user_daily_stats.played + 1,
           correct = user_daily_stats.correct + EXCLUDED.correct`,
    [userId, current, best, day, correct ? 1 : 0],
  );
  return { current, best };
}

/** Streak as it stands today: a streak whose last play was before yesterday has lapsed. */
export function effectiveStreak(
  stats: { current_streak: number; best_streak: number; last_played: string | null },
  today = utcToday(),
): StreakState {
  const alive = stats.last_played === today || stats.last_played === previousDay(today);
  return { current: alive ? stats.current_streak : 0, best: stats.best_streak };
}
