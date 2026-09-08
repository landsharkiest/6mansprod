import { Router } from 'express';
import type { HistoryEntry, UserProfile } from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../auth/middleware.js';
import { toPublicUser } from '../auth/users.js';
import { effectiveStreak } from '../services/daily.js';

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [totals, daily, recent] = await Promise.all([
      pool.query<{ total: number; correct: number }>(
        'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_correct)::int AS correct FROM guesses WHERE user_id = $1',
        [userId],
      ),
      pool.query<{ current_streak: number; best_streak: number; last_played: string | null; played: number; correct: number }>(
        `SELECT current_streak, best_streak, to_char(last_played, 'YYYY-MM-DD') AS last_played, played, correct
           FROM user_daily_stats WHERE user_id = $1`,
        [userId],
      ),
      pool.query<HistoryEntry & { created_at: string }>(
        `SELECT id, clip_id AS "clipId", mode, guessed_rank AS "guessedRank", actual_rank AS "actualRank",
                is_correct AS "isCorrect", created_at
           FROM guesses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`,
        [userId],
      ),
    ]);
    const t = totals.rows[0]!;
    const d = daily.rows[0] ?? { current_streak: 0, best_streak: 0, last_played: null, played: 0, correct: 0 };
    const streak = effectiveStreak(d);
    const body: UserProfile = {
      user: toPublicUser(req.user!),
      totals: { guesses: t.total, correct: t.correct, accuracy: t.total ? Math.round((t.correct / t.total) * 1000) / 10 : 0 },
      daily: { played: d.played, correct: d.correct, currentStreak: streak.current, bestStreak: streak.best },
      recent: recent.rows.map(({ created_at, ...r }) => ({ ...r, createdAt: new Date(created_at).toISOString() })),
    };
    res.json(body);
  }),
);
