import { Router } from 'express';
import { z } from 'zod';
import { parseBody } from '../lib/validate.js';
import { requireAuth } from '../auth/middleware.js';
import { completeUpload, createPresignedUpload, listUploadsForUser, presignInputSchema } from '../services/uploads.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

/**
 * Step 1: reserve a clip row and hand back a presigned PUT.
 * The browser never receives AWS credentials; the signature covers exactly one key, type and size.
 */
uploadsRouter.post(
  '/presign',
  asyncHandler(async (req, res) => {
    const input = parseBody(req, presignInputSchema);
    const body = await createPresignedUpload(req.user!.id, input);
    res.status(201).json(body);
  }),
);

/** Step 2: after the PUT succeeds, confirm the object exists so the clip enters the review queue. */
uploadsRouter.post(
  '/:clipId/complete',
  asyncHandler(async (req, res) => {
    const clipId = z.string().uuid().parse(req.params.clipId);
    const body = await completeUpload(req.user!.id, clipId);
    res.json(body);
  }),
);

/** The caller's own uploads and their review state. */
uploadsRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    res.json(await listUploadsForUser(req.user!.id));
  }),
);
