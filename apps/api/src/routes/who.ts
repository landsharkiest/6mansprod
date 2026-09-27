import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { PlayableClip } from '@6mansdle/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseBody, parseQuery } from '../lib/validate.js';
import { toPlayable } from '../services/clips.js';
import { listWhoPlayers, pickRandomWhoClip, submitWhoGuess } from '../services/players.js';

/** "Who's that player?" -- guess which known player is in the clip. */
export const whoRouter = Router();

const guessLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
const uuid = z.string().uuid();

whoRouter.get(
  '/clips/random',
  asyncHandler(async (req, res) => {
    const { exclude } = parseQuery(req, z.object({ exclude: uuid.optional() }));
    const body: PlayableClip = await toPlayable(await pickRandomWhoClip(exclude));
    res.json(body);
  }),
);

/** The full answer space. Identical for every clip, so it leaks nothing about any one of them. */
whoRouter.get(
  '/players',
  asyncHandler(async (_req, res) => {
    res.json(await listWhoPlayers());
  }),
);

const guessSchema = z.object({ clipId: uuid, playerId: z.number().int().positive() });

whoRouter.post(
  '/guesses',
  guessLimiter,
  asyncHandler(async (req, res) => {
    const { clipId, playerId } = parseBody(req, guessSchema);
    res.status(201).json(await submitWhoGuess({ clipId, playerId, userId: req.user?.id ?? null }));
  }),
);
