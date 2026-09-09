import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PresignUploadResponse } from '@6mansdle/shared';
import { RANKS } from '@6mansdle/shared';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';
import { ALLOWED_VIDEO_TYPES, clipKey, headObject, presignUpload } from './storage.js';

/**
 * The shape of a presign request, independent of who's asking (a signed-in browser session in
 * routes/uploads.ts, or the Discord bot acting on a Discord user's behalf in routes/bot.ts).
 */
export const presignInputSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().refine((t) => t in ALLOWED_VIDEO_TYPES, 'Unsupported video type'),
  sizeBytes: z.number().int().positive(),
  rank: z.enum(RANKS),
});
export type PresignInput = z.output<typeof presignInputSchema>;

/**
 * Step 1: reserve a clip row for `uploaderId` and hand back a presigned PUT.
 * The caller never receives AWS credentials; the signature covers exactly one key, type and size.
 */
export async function createPresignedUpload(uploaderId: number, input: PresignInput): Promise<PresignUploadResponse> {
  if (input.sizeBytes > config.maxUploadBytes) {
    throw badRequest(`File exceeds the ${config.MAX_UPLOAD_MB} MB limit`);
  }
  const clipId = randomUUID();
  const key = clipKey(clipId, input.contentType);
  await pool.query(
    `INSERT INTO clips (id, s3_key, rank, original_filename, content_type, size_bytes, uploader_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [clipId, key, input.rank, input.filename, input.contentType, input.sizeBytes, uploaderId],
  );
  const { url, headers } = await presignUpload(key, input.contentType, input.sizeBytes);
  return { clipId, uploadUrl: url, headers };
}

export interface CompleteUploadResult {
  clipId: string;
  status: 'pending';
}

/**
 * Step 2: after the PUT succeeds, confirm the object exists so the clip enters the review queue.
 * Only the clip's own uploader may complete it — the row lookup is scoped to `uploaderId`, so a
 * mismatched caller sees the same 404 as a clip that doesn't exist.
 */
export async function completeUpload(uploaderId: number, clipId: string): Promise<CompleteUploadResult> {
  const { rows } = await pool.query<{ s3_key: string; upload_completed: boolean }>(
    'SELECT s3_key, upload_completed FROM clips WHERE id = $1 AND uploader_id = $2',
    [clipId, uploaderId],
  );
  const clip = rows[0];
  if (!clip) throw notFound('Upload not found');
  if (!clip.upload_completed) {
    const head = await headObject(clip.s3_key);
    if (!head) throw badRequest('File has not been uploaded yet');
    await pool.query('UPDATE clips SET upload_completed = TRUE, size_bytes = $2 WHERE id = $1', [clipId, head.size]);
  }
  return { clipId, status: 'pending' };
}

export interface UploadSummary {
  id: string;
  rank: string;
  status: string;
  originalFilename: string;
  createdAt: string;
}

/** The given uploader's own uploads and their review state, newest first. */
export async function listUploadsForUser(uploaderId: number): Promise<UploadSummary[]> {
  const { rows } = await pool.query<UploadSummary>(
    `SELECT id, rank, status, original_filename AS "originalFilename", created_at AS "createdAt"
       FROM clips WHERE uploader_id = $1 AND upload_completed ORDER BY created_at DESC LIMIT 50`,
    [uploaderId],
  );
  return rows;
}
