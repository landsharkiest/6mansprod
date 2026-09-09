import 'dotenv/config';
import { z } from 'zod';

const boolish = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Overrides the default pino level (info in prod, debug otherwise). Handy for 'silent' in tests. */
  LOG_LEVEL: z.string().optional(),
  /** Comma-separated list of allowed browser origins. The first one is used for OAuth redirects. */
  WEB_ORIGIN: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  API_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: boolish,
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  DISCORD_CLIENT_ID: z.string().optional().default(''),
  DISCORD_CLIENT_SECRET: z.string().optional().default(''),
  ADMIN_DISCORD_IDS: z
    .string()
    .optional()
    .default('')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  CDN_ORIGIN: z.string().url().optional(),
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
  isProd: parsed.data.NODE_ENV === 'production',
  discordEnabled: Boolean(parsed.data.DISCORD_CLIENT_ID && parsed.data.DISCORD_CLIENT_SECRET),
  maxUploadBytes: parsed.data.MAX_UPLOAD_MB * 1024 * 1024,
};
export type Config = typeof config;
