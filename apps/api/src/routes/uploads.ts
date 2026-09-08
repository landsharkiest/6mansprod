import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { PresignUploadResponse } from '@6mansdle/shared';
import { RANKS } from '@6mansdle/shared';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseBody } from '../lib/validate.js';
import { requireAuth } from '../auth/middleware.js';
import { ALLOWED_VIDEO_TYPES, clipKey, headObject, presignUpload } from '../services/storage.js';

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const presignSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().refine((t) => t in ALLOWED_VIDEO_TYPES, 'Unsupported video type'),
  sizeBytes: z.number().int().positive(),
  rank: z.enum(RANKS),
});

/**
 * Step 1: reserve a clip row and hand back a presigned PUT.
 * The browser never receives AWS credentials; the signature covers exactly one key, type and size.
 */
uploadsRouter.post(
  '/presign',
  asyncHandler(async (req, res) => {
    const { filename, contentType, sizeBytes, rank } = parseBody(req, presignSchema);
    if (sizeBytes > config.maxUploadBytes) {
      throw badRequest(`File exceeds the ${config.MAX_UPLOAD_MB} MB limit`);
    }
    const clipId = randomUUID();
    const key = clipKey(clipId, contentType);
    await pool.query(
      `INSERT INTO clips (id, s3_key, rank, original_filename, content_type, size_bytes, uploader_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clipId, key, rank, filename, contentType, sizeBytes, req.user!.id],
    );
    const { url, headers } = await presignUpload(key, contentType, sizeBytes);
    const body: PresignUploadResponse = { clipId, uploadUrl: url, headers };
    res.status(201).json(body);
  }),
);

/** Step 2: after the PUT succeeds, confirm the object exists so the clip enters the review queue. */
uploadsRouter.post(
  '/:clipId/complete',
  asyncHandler(async (req, res) => {
    const clipId = z.string().uuid().parse(req.params.clipId);
    const { rows } = await pool.query<{ s3_key: string; upload_completed: boolean }>(
      'SELECT s3_key, upload_completed FROM clips WHERE id = $1 AND uploader_id = $2',
      [clipId, req.user!.id],
    );
    const clip = rows[0];
    if (!clip) throw notFound('Upload not found');
    if (!clip.upload_completed) {
      const head = await headObject(clip.s3_key);
      if (!head) throw badRequest('File has not been uploaded yet');
      await pool.query('UPDATE clips SET upload_completed = TRUE, size_bytes = $2 WHERE id = $1', [clipId, head.size]);
    }
    res.json({ clipId, status: 'pending' });
  }),
);

/** The caller's own uploads and their review state. */
uploadsRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, rank, status, original_filename AS "originalFilename", created_at AS "createdAt"
         FROM clips WHERE uploader_id = $1 AND upload_completed ORDER BY created_at DESC LIMIT 50`,
      [req.user!.id],
    );
    res.json(rows);
  }),
);
