import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type {
  BlitzFinishResponse,
  BlitzLeaderboardResponse,
  BlitzMeBestResponse,
  BlitzStartResponse,
} from '@6mansdle/shared';
import { RANKS } from '@6mansdle/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseBody, parseParams, parseQuery } from '../lib/validate.js';
import { startBlitzRun, submitBlitzGuess, finishBlitzRun, blitzLeaderboard, blitzPersonalBest } from '../services/blitz.js';
import { requireAuth } from '../auth/middleware.js';

export const blitzRouter = Router();

/**
 * Starting a run is the only blitz endpoint worth throttling hard: it's the one that creates
 * rows and hands out a fresh 90s window, so 20/hour/IP caps how many runs one IP can grind
 * through without blocking normal replay.
 */
const startLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

const runIdParams = z.object({ runId: z.coerce.number().int().positive() });

blitzRouter.post(
  '/start',
  startLimiter,
  asyncHandler(async (req, res) => {
    const body: BlitzStartResponse = await startBlitzRun(req.user?.id ?? null);
    res.status(201).json(body);
  }),
);

const guessSchema = z.object({
  clipId: z.string().uuid(),
  rank: z.enum(RANKS),
});

blitzRouter.post(
  '/:runId/guess',
  asyncHandler(async (req, res) => {
    const { runId } = parseParams(req, runIdParams);
    const { clipId, rank } = parseBody(req, guessSchema);
    const result = await submitBlitzGuess({ runId, clipId, rank });
    if ('expired' in result) {
      const body: BlitzFinishResponse = result.expired;
      res.status(410).json(body);
      return;
    }
    res.status(201).json(result);
  }),
);

blitzRouter.post(
  '/:runId/finish',
  asyncHandler(async (req, res) => {
    const { runId } = parseParams(req, runIdParams);
    const body: BlitzFinishResponse = await finishBlitzRun(runId);
    res.json(body);
  }),
);

blitzRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const { period } = parseQuery(req, z.object({ period: z.enum(['today', 'week', 'all']).default('all') }));
    const entries = await blitzLeaderboard(period);
    const body: BlitzLeaderboardResponse = { period, entries };
    res.json(body);
  }),
);

/** The caller's personal best finished run. Requires auth -- guests have nothing durable to fetch. */
blitzRouter.get(
  '/me/best',
  requireAuth,
  asyncHandler(async (req, res) => {
    const best = await blitzPersonalBest(req.user!.id);
    const body: BlitzMeBestResponse = { best };
    res.json(body);
  }),
);
