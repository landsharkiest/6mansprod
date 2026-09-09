import { Router } from 'express';
import { z } from 'zod';
import { RANKS } from '@6mansdle/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseBody, parseQuery } from '../lib/validate.js';
import { listReports, resolveReport } from '../services/reports.js';

/**
 * Mounted under `/api/admin` (see routes/admin.ts), which already applies `requireAdmin`.
 * Kept in its own file since it's a distinct resource (reports, not clips).
 */
export const reportsRouter = Router();

reportsRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { status } = parseQuery(req, z.object({ status: z.enum(['open', 'resolved', 'dismissed']).default('open') }));
    res.json(await listReports(status));
  }),
);

const resolveSchema = z
  .object({
    action: z.enum(['fix_rank', 'reject_clip', 'dismiss']),
    rank: z.enum(RANKS).optional(),
  })
  .refine((v) => v.action !== 'fix_rank' || v.rank !== undefined, {
    message: 'rank is required for fix_rank',
    path: ['rank'],
  });

reportsRouter.post(
  '/reports/:id/resolve',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { action, rank } = parseBody(req, resolveSchema);
    const result = await resolveReport({ reportId: id, action, rank: rank ?? null, adminId: req.user!.id });
    res.json(result);
  }),
);
