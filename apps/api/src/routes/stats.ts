import { Router } from 'express';
import { z } from 'zod';
import type { LeaderboardEntry, OverallStats, Rank } from '@6mansdle/shared';
import { RANKS } from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseQuery } from '../lib/validate.js';
import { avatarUrl } from '../auth/users.js';
import { effectiveStreak } from '../services/daily.js';

export const statsRouter = Router();

statsRouter.get(
  '/overall',
  asyncHandler(async (_req, res) => {
    const [totals, perRank, clips] = await Promise.all([
      pool.query<{ total: number; correct: number }>(
        'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_correct)::int AS correct FROM guesses',
      ),
      pool.query<{ actual_rank: Rank; total: number; correct: number }>(
        `SELECT actual_rank, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_correct)::int AS correct
           FROM guesses GROUP BY actual_rank`,
      ),
      pool.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM clips WHERE status = 'approved' AND upload_completed",
      ),
    ]);
    const t = totals.rows[0]!;
    const byRank = new Map(perRank.rows.map((r) => [r.actual_rank, r]));
    const body: OverallStats = {
      totalGuesses: t.total,
      correctGuesses: t.correct,
      accuracy: t.total ? Math.round((t.correct / t.total) * 1000) / 10 : 0,
      approvedClips: clips.rows[0]!.n,
      perRank: RANKS.map((rank) => ({
        rank,
        totalGuesses: byRank.get(rank)?.total ?? 0,
        correctGuesses: byRank.get(rank)?.correct ?? 0,
      })),
    };
    res.json(body);
  }),
);

statsRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const { sort, limit } = parseQuery(
      req,
      z.object({
        sort: z.enum(['streak', 'best', 'accuracy', 'played']).default('streak'),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    );
    const orderBy = {
      streak: 'live_streak DESC, best_streak DESC, correct DESC',
      best: 'best_streak DESC, live_streak DESC, correct DESC',
      accuracy: 'accuracy DESC, played DESC',
      played: 'played DESC, correct DESC',
    }[sort];

    const { rows } = await pool.query<{
      id: number;
      username: string;
      discord_id: string;
      avatar_hash: string | null;
      current_streak: number;
      best_streak: number;
      last_played: string | null;
      played: number;
      correct: number;
    }>(
      `SELECT u.id, u.username, u.discord_id, u.avatar_hash,
              s.current_streak, s.best_streak, to_char(s.last_played, 'YYYY-MM-DD') AS last_played,
              s.played, s.correct,
              CASE WHEN s.last_played >= CURRENT_DATE - 1 THEN s.current_streak ELSE 0 END AS live_streak,
              CASE WHEN s.played > 0 THEN s.correct::float / s.played ELSE 0 END AS accuracy
         FROM user_daily_stats s JOIN users u ON u.id = s.user_id
        WHERE s.played > 0
        ORDER BY ${orderBy}, u.id ASC
        LIMIT $1`,
      [limit],
    );

    const body: LeaderboardEntry[] = rows.map((r) => ({
      user: { id: r.id, username: r.username, avatarUrl: avatarUrl(r.discord_id, r.avatar_hash) },
      currentStreak: effectiveStreak(r).current,
      bestStreak: r.best_streak,
      dailyPlayed: r.played,
      dailyCorrect: r.correct,
      accuracy: r.played ? Math.round((r.correct / r.played) * 1000) / 10 : 0,
    }));
    res.json(body);
  }),
);
