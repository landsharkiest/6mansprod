import { Router } from 'express';
import { z } from 'zod';
import { RANKS } from '@6mansdle/shared';
import { pool, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound } from '../lib/errors.js';
import { parseBody, parseQuery } from '../lib/validate.js';
import { requireAdmin } from '../auth/middleware.js';
import { deleteObject } from '../services/storage.js';
import { ADMIN_CLIP_SELECT as selectClip, toAdminClip, type AdminClipRow } from '../services/clips.js';
import { reportsRouter } from './reports.js';
import { awardContributor } from '../services/achievements.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.use(reportsRouter);

adminRouter.get(
  '/clips',
  asyncHandler(async (req, res) => {
    const { status, limit } = parseQuery(
      req,
      z.object({
        status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    );
    const { rows } = await pool.query<AdminClipRow>(
      `${selectClip} WHERE c.status = $1 AND c.upload_completed ORDER BY c.created_at ASC LIMIT $2`,
      [status, limit],
    );
    res.json(await Promise.all(rows.map(toAdminClip)));
  }),
);

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  /** Admins may correct the rank while approving. */
  rank: z.enum(RANKS).optional(),
});

adminRouter.post(
  '/clips/:id/review',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status, rank } = parseBody(req, reviewSchema);

    const full = await withTransaction(async (client) => {
      const { rows } = await client.query<AdminClipRow>(
        `UPDATE clips
            SET status = $2, rank = COALESCE($3, rank), reviewed_by = $4, reviewed_at = now()
          WHERE id = $1 AND upload_completed
          RETURNING id, uploader_id`,
        [id, status, rank ?? null, req.user!.id],
      );
      if (!rows[0]) throw notFound('Clip not found');
      if (status === 'approved' && rows[0].uploader_id !== null) {
        await awardContributor(client, rows[0].uploader_id);
      }
      const { rows: fullRows } = await client.query<AdminClipRow>(`${selectClip} WHERE c.id = $1`, [id]);
      return fullRows[0]!;
    });
    res.json(await toAdminClip(full));
  }),
);

/** Permanently removes a rejected clip and its object. Approved clips are kept for guess history. */
adminRouter.delete(
  '/clips/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { rows } = await pool.query<{ s3_key: string }>(
      "DELETE FROM clips WHERE id = $1 AND status = 'rejected' RETURNING s3_key",
      [id],
    );
    if (!rows[0]) throw notFound('Rejected clip not found');
    await deleteObject(rows[0].s3_key);
    res.status(204).end();
  }),
);
