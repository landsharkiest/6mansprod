import type { ActivityDay, HistoryEntry, UserProfile } from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { toPublicUser, type UserRow } from '../auth/users.js';
import { effectiveStreak } from './daily.js';

const ACTIVITY_DAYS = 365;

const pct = (correct: number, total: number) => (total ? Math.round((correct / total) * 1000) / 10 : 0);

/** Everything a profile page shows. Safe to expose publicly: no email, no secrets. */
export async function buildProfile(user: UserRow & { created_at?: string }): Promise<UserProfile> {
  const userId = user.id;
  const [totals, daily, endless, recent, activity, created, achievements] = await Promise.all([
    pool.query<{ total: number; correct: number }>(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_correct)::int AS correct
         FROM guesses WHERE user_id = $1 AND counted`,
      [userId],
    ),
    pool.query<{ current_streak: number; best_streak: number; last_played: string | null; played: number; correct: number }>(
      `SELECT current_streak, best_streak, to_char(last_played, 'YYYY-MM-DD') AS last_played, played, correct
         FROM user_daily_stats WHERE user_id = $1`,
      [userId],
    ),
    pool.query<{ current_run: number; best_run: number; played: number; correct: number }>(
      'SELECT current_run, best_run, played, correct FROM user_endless_stats WHERE user_id = $1',
      [userId],
    ),
    pool.query<HistoryEntry & { created_at: string }>(
      `SELECT id, clip_id AS "clipId", mode, guessed_rank AS "guessedRank", actual_rank AS "actualRank",
              is_correct AS "isCorrect", created_at
         FROM guesses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`,
      [userId],
    ),
    pool.query<{ date: string; guesses: number; daily_correct: boolean | null }>(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
              COUNT(*) FILTER (WHERE counted)::int AS guesses,
              BOOL_OR(is_correct) FILTER (WHERE mode = 'daily') AS daily_correct
         FROM guesses
        WHERE user_id = $1 AND created_at >= now() - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY 1`,
      [userId, ACTIVITY_DAYS],
    ),
    pool.query<{ created_at: string }>('SELECT created_at FROM users WHERE id = $1', [userId]),
    pool.query<{ achievement_id: string; earned_at: string }>(
      'SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = $1 ORDER BY earned_at ASC',
      [userId],
    ),
  ]);

  const t = totals.rows[0]!;
  const d = daily.rows[0] ?? { current_streak: 0, best_streak: 0, last_played: null, played: 0, correct: 0 };
  const e = endless.rows[0] ?? { current_run: 0, best_run: 0, played: 0, correct: 0 };
  const streak = effectiveStreak(d);

  const activityDays: ActivityDay[] = activity.rows.map((r) => ({
    date: r.date,
    guesses: r.guesses,
    daily: r.daily_correct === null ? 'none' : r.daily_correct ? 'correct' : 'wrong',
  }));

  return {
    user: toPublicUser(user),
    memberSince: new Date(created.rows[0]!.created_at).toISOString(),
    activity: activityDays,
    totals: { guesses: t.total, correct: t.correct, accuracy: pct(t.correct, t.total) },
    daily: { played: d.played, correct: d.correct, currentStreak: streak.current, bestStreak: streak.best },
    endless: { played: e.played, correct: e.correct, currentRun: e.current_run, bestRun: e.best_run },
    recent: recent.rows.map(({ created_at, ...r }) => ({ ...r, createdAt: new Date(created_at).toISOString() })),
    achievements: achievements.rows.map((r) => ({ id: r.achievement_id, earnedAt: new Date(r.earned_at).toISOString() })),
  };
}
