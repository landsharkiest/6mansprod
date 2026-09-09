import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  /** Bot token from the Discord developer portal (Bot tab). */
  DISCORD_BOT_TOKEN: z.string().min(1),
  /** Application id, used to register slash commands. */
  DISCORD_CLIENT_ID: z.string().min(1),
  /** Guild id for instant, guild-scoped command registration. Omit for global registration. */
  GUILD_ID: z.string().optional(),
  API_ORIGIN: z.string().url().default('https://backend.6mansdle.com'),
  /** Shared secret sent as `Authorization: Bearer <token>` on every /api/bot/* request. */
  BOT_API_TOKEN: z.string().min(1),
  /** Channel the scheduled daily-post lands in. Omit to disable the scheduled post entirely. */
  DAILY_CHANNEL_ID: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(50),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  maxUploadBytes: parsed.data.MAX_UPLOAD_MB * 1024 * 1024,
};
export type Config = typeof config;
