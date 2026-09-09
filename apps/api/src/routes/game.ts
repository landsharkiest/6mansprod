import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DailyResponse, GuessResponse, PlayableClip } from '@6mansdle/shared';
import { RANKS } from '@6mansdle/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseBody, parseQuery } from '../lib/validate.js';
import { pickRandomApprovedClip, toPlayable, clipStats, getClip } from '../services/clips.js';
import { getOrCreateDaily, effectiveStreak, getDailyNumber } from '../services/daily.js';
import { submitGuess } from '../services/guesses.js';
import { pool } from '../db/pool.js';
import { rankDistance } from '@6mansdle/shared';

export const gameRouter = Router();

/** Guess submissions only; reads elsewhere are unthrottled. */
const guessLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });

const uuid = z.string().uuid();

/** Endless mode: a random approved clip. */
gameRouter.get(
  '/clips/random',
  asyncHandler(async (req, res) => {
    const { exclude } = parseQuery(req, z.object({ exclude: uuid.optional() }));
    const clip = await pickRandomApprovedClip(exclude);
    const body: PlayableClip = await toPlayable(clip);
    res.json(body);
  }),
);

/** Daily mode: the same clip for everyone, plus the caller's result if they already played. */
gameRouter.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const daily = await getOrCreateDaily();
    let result: GuessResponse | null = null;

    if (req.user) {
      const { rows } = await pool.query<{ guessed_rank: GuessResponse['guessedRank']; is_correct: boolean }>(
        'SELECT guessed_rank, is_correct FROM guesses WHERE daily_id = $1 AND user_id = $2',
        [daily.id, req.user.id],
      );
      const prior = rows[0];
      if (prior) {
        const statsRow = await pool.query<{ current_streak: number; best_streak: number; last_played: string | null }>(
          `SELECT current_streak, best_streak, to_char(last_played, 'YYYY-MM-DD') AS last_played
             FROM user_daily_stats WHERE user_id = $1`,
          [req.user.id],
        );
        result = {
          correct: prior.is_correct,
          guessedRank: prior.guessed_rank,
          actualRank: daily.clip.rank,
          distance: rankDistance(prior.guessed_rank, daily.clip.rank),
          stats: await clipStats(pool, daily.clip),
          counted: true,
          // This is a replay of an already-recorded guess, not a fresh submission, so nothing
          // new unlocks here even if the underlying guess once triggered achievements.
          newAchievements: [],
          streak: statsRow.rows[0] ? effectiveStreak(statsRow.rows[0]) : { current: 0, best: 0 },
        };
      }
    }

    const number = await getDailyNumber(daily.day).catch(() => 1);
    const body: DailyResponse = { date: daily.day, number, clip: await toPlayable(daily.clip), result };
    res.json(body);
  }),
);

const guessSchema = z.object({
  clipId: uuid,
  rank: z.enum(RANKS),
  mode: z.enum(['endless', 'daily']),
});

gameRouter.post(
  '/guesses',
  guessLimiter,
  asyncHandler(async (req, res) => {
    const { clipId, rank, mode } = parseBody(req, guessSchema);
    const body = await submitGuess({ clipId, guessedRank: rank, mode, userId: req.user?.id ?? null });
    res.status(201).json(body);
  }),
);

/** Stats for a clip the caller has already been shown the answer to. */
gameRouter.get(
  '/clips/:id/stats',
  asyncHandler(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const clip = await getClip(pool, id);
    if (!clip || clip.status !== 'approved') return res.status(404).json({ error: 'Clip not found' });
    // Only reveal stats (which include the answer) to someone who has guessed this clip.
    const seen = await pool.query(
      'SELECT 1 FROM guesses WHERE clip_id = $1 AND user_id = $2 LIMIT 1',
      [id, req.user?.id ?? -1],
    );
    if (!seen.rowCount) return res.status(403).json({ error: 'Guess first' });
    res.json(await clipStats(pool, clip));
  }),
);
