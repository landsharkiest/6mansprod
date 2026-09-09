import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound } from '../lib/errors.js';
import { requireAuth } from '../auth/middleware.js';
import { findUserById } from '../auth/users.js';
import { buildProfile } from '../services/profiles.js';
import { loadUserInsights } from '../services/insights.js';

export const meRouter = Router();
meRouter.get('/profile', requireAuth, asyncHandler(async (req, res) => res.json(await buildProfile(req.user!))));

/** Public profiles, linked from the leaderboard. */
export const usersRouter = Router();
usersRouter.get(
  '/:id/profile',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = await findUserById(id);
    if (!user) throw notFound('User not found');
    res.json(await buildProfile(user));
  }),
);

/** Same visibility as the profile itself: public, gated only by having enough counted guesses. */
usersRouter.get(
  '/:id/insights',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = await findUserById(id);
    if (!user) throw notFound('User not found');
    res.json(await loadUserInsights(id));
  }),
);
