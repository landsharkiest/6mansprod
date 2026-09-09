import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { RANKS } from '@6mansdle/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseBody, parseParams } from '../lib/validate.js';
import { requireAuth } from '../auth/middleware.js';
import { createChallenge, getChallenge, submitChallengeGuess } from '../services/challenges.js';

export const challengesRouter = Router();

/** Creating challenge links is cheap to spam, so throttle like uploads. */
const createLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
/** Same window/budget as the normal guess limiter. */
const guessLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });

const uuid = z.string().uuid();
const tokenParams = z.object({ token: z.string().min(1).max(64) });

/** Create (or re-fetch) a challenge link for a clip the caller has already guessed. */
challengesRouter.post(
  '/',
  requireAuth,
  createLimiter,
  asyncHandler(async (req, res) => {
    const { clipId } = parseBody(req, z.object({ clipId: uuid }));
    const body = await createChallenge({ clipId, userId: req.user!.id });
    res.status(201).json(body);
  }),
);

/** Fetch a challenge by its share token. Never reveals the rank before the caller has guessed. */
challengesRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const { token } = parseParams(req, tokenParams);
    const body = await getChallenge({ token, userId: req.user?.id ?? null });
    res.json(body);
  }),
);

const guessSchema = z.object({ rank: z.enum(RANKS) });

/** Take a challenge: records a real endless guess plus a challenge_attempts row. */
challengesRouter.post(
  '/:token/guess',
  guessLimiter,
  asyncHandler(async (req, res) => {
    const { token } = parseParams(req, tokenParams);
    const { rank } = parseBody(req, guessSchema);
    const body = await submitChallengeGuess({ token, guessedRank: rank, userId: req.user?.id ?? null });
    res.status(201).json(body);
  }),
);
