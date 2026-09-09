import { Router } from 'express';
import { z } from 'zod';
import type { LeaderboardEntry, LeaderboardResponse, OverallStats, Rank } from '@6mansdle/shared';
import { RANKS } from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseQuery } from '../lib/validate.js';
import { avatarUrl } from '../auth/users.js';
import { getCommunityStats } from '../services/communityStats.js';

export const statsRouter = Router();

statsRouter.get(
  '/community',
  asyncHandler(async (_req, res) => {
    const body = await getCommunityStats();
    // Already server-cached for a minute upstream, so a shared/browser cache holding it for 30s
    // costs nothing extra in staleness.
    res.set('Cache-Control', 'public, max-age=30');
    res.json(body);
  }),
);

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
      pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM clips WHERE status = 'approved' AND upload_completed"),
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

/** Minimum plays before a user appears on the accuracy sort, so 1/1 = 100% can't top the board. */
const MIN_PLAYS_FOR_ACCURACY = { daily: 5, endless: 20 } as const;

const ORDER = {
  streak: 'current DESC, best DESC, correct DESC',
  best: 'best DESC, current DESC, correct DESC',
  accuracy: 'accuracy DESC, correct DESC',
  played: 'played DESC, correct DESC',
} as const;

// Both stat tables are projected to the same column names so one query template serves both modes.
const SOURCE = {
  daily: `SELECT user_id,
                 CASE WHEN last_played >= CURRENT_DATE - 1 THEN current_streak ELSE 0 END AS current,
                 best_streak AS best, played, correct
            FROM user_daily_stats`,
  endless: `SELECT user_id, current_run AS current, best_run AS best, played, correct FROM user_endless_stats`,
} as const;

statsRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const { mode, sort, limit } = parseQuery(
      req,
      z.object({
        mode: z.enum(['daily', 'endless']).default('daily'),
        sort: z.enum(['streak', 'best', 'accuracy', 'played']).default('streak'),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    );
    const minPlays = sort === 'accuracy' ? MIN_PLAYS_FOR_ACCURACY[mode] : 1;

    const { rows } = await pool.query<{
      id: number;
      username: string;
      discord_id: string;
      avatar_hash: string | null;
      current: number;
      best: number;
      played: number;
      correct: number;
    }>(
      `SELECT u.id, u.username, u.discord_id, u.avatar_hash,
              s.current, s.best, s.played, s.correct,
              s.correct::float / s.played AS accuracy
         FROM (${SOURCE[mode]}) s JOIN users u ON u.id = s.user_id
        WHERE s.played >= $1
        ORDER BY ${ORDER[sort]}, u.id ASC
        LIMIT $2`,
      [minPlays, limit],
    );

    // Public, identical for every caller for a given query string — safe to cache briefly.
    res.set('Cache-Control', 'public, max-age=30');
    const entries: LeaderboardEntry[] = rows.map((r) => ({
      user: { id: r.id, username: r.username, avatarUrl: avatarUrl(r.discord_id, r.avatar_hash) },
      currentStreak: r.current,
      bestStreak: r.best,
      played: r.played,
      correct: r.correct,
      accuracy: Math.round((r.correct / r.played) * 1000) / 10,
    }));
    const body: LeaderboardResponse = { mode, sort, minPlaysForAccuracy: MIN_PLAYS_FOR_ACCURACY[mode], entries };
    res.json(body);
  }),
);
