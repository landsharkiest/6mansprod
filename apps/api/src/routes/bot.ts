import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound } from '../lib/errors.js';
import { parseBody, parseParams, parseQuery } from '../lib/validate.js';
import { requireBotToken } from '../auth/botToken.js';
import { findUserByDiscordId, upsertDiscordUser } from '../auth/users.js';
import { completeUpload, createPresignedUpload, listUploadsForUser, presignInputSchema } from '../services/uploads.js';
import { getDailyMeta, getDailyPlayedCount } from '../services/daily.js';

export const botRouter = Router();
botRouter.use(requireBotToken);

const discordIdSchema = z.object({ discordId: z.string().min(1).max(32) });

const botPresignSchema = presignInputSchema.extend({
  discordId: z.string().min(1).max(32),
  username: z.string().min(1).max(100),
  avatar: z.string().max(64).nullable().optional(),
});

/**
 * Same two-step flow as routes/uploads.ts (`services/uploads.ts` backs both), except the caller
 * is the bot acting on behalf of a Discord user rather than a signed-in browser session: the
 * user is upserted from the Discord profile fields the bot supplies before the clip is reserved.
 */
botRouter.post(
  '/uploads/presign',
  asyncHandler(async (req, res) => {
    const { discordId, username, avatar, ...input } = parseBody(req, botPresignSchema);
    const user = await upsertDiscordUser({ id: discordId, username, avatar: avatar ?? null });
    const body = await createPresignedUpload(user.id, input);
    res.status(201).json(body);
  }),
);

/** Step 2, scoped the same way as the browser flow: only the clip's own uploader may complete it. */
botRouter.post(
  '/uploads/:clipId/complete',
  asyncHandler(async (req, res) => {
    const { clipId } = parseParams(req, z.object({ clipId: z.string().uuid() }));
    const { discordId } = parseBody(req, discordIdSchema);
    const user = await findUserByDiscordId(discordId);
    if (!user) throw notFound('Upload not found');
    res.json(await completeUpload(user.id, clipId));
  }),
);

/** A Discord user's own uploads and their review state — backs the /myuploads command. */
botRouter.get(
  '/uploads',
  asyncHandler(async (req, res) => {
    const { discordId } = parseQuery(req, discordIdSchema);
    const user = await findUserByDiscordId(discordId);
    res.json(user ? await listUploadsForUser(user.id) : []);
  }),
);

/**
 * Deliberately minimal: no clip, no rank, nothing that would let the bot's /daily command leak
 * the answer. Just enough for a "today's daily is #N, N people have played, here's the link" post.
 */
botRouter.get(
  '/daily',
  asyncHandler(async (_req, res) => {
    const meta = await getDailyMeta();
    const playedCount = await getDailyPlayedCount(meta.date);
    res.json({ ...meta, playedCount, url: `${config.WEB_ORIGIN[0]}/daily` });
  }),
);
