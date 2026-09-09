import { randomUUID } from 'node:crypto';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

/**
 * Boots a throwaway API + web stack for the e2e suite, entirely separate from whatever a
 * developer might have running on 3001/5173 for manual testing:
 *   - API on API_PORT against its own Postgres database (created + migrated here).
 *   - Vite dev server on WEB_PORT, proxying /api to that API (see vite.config.ts's
 *     VITE_DEV_API_TARGET override).
 *
 * We spawn both processes ourselves (rather than using Playwright's `webServer` option) because
 * the API needs a database that exists *before* it starts — `webServer` entries start before
 * `globalSetup` runs, so there'd be no reliable place to create the database first. Doing it all
 * here gives full control over the order: create DB -> start API -> wait healthy -> seed clips
 * -> start web -> wait ready.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const API_PORT = 3101;
const WEB_PORT = 5273;
const DB_NAME = process.env.E2E_DB_NAME || 'sixmansdle_e2e';
const ADMIN_DB_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const APP_DB_URL = `postgres://postgres:postgres@localhost:5432/${DB_NAME}`;
// Public, CC0-licensed sample clips — real playable video with no rank leaked in the URL, since
// object keys never encode the answer anyway.
const CDN_ORIGIN = 'https://interactive-examples.mdn.mozilla.net';

const SEED_CLIPS = [
  { key: 'media/cc0-videos/flower.mp4', rank: 'S', contentType: 'video/mp4' },
  { key: 'media/cc0-videos/friday.mp4', rank: 'A', contentType: 'video/mp4' },
  { key: 'media/cc0-videos/flower.webm', rank: 'C', contentType: 'video/webm' },
];

async function createDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (rows.length === 0) await admin.query(`CREATE DATABASE ${DB_NAME}`);
  } finally {
    await admin.end();
  }
}

async function seedClips(): Promise<void> {
  const pool = new pg.Pool({ connectionString: APP_DB_URL });
  try {
    // Idempotent: reruns against a database that already has these clips (e.g. reuseExistingServer
    // during local dev of the suite itself) just no-op via ON CONFLICT.
    for (const clip of SEED_CLIPS) {
      await pool.query(
        `INSERT INTO clips (id, s3_key, rank, status, original_filename, content_type, size_bytes, upload_completed)
         VALUES ($1, $2, $3, 'approved', $4, $5, 1000000, true)
         ON CONFLICT (s3_key) DO NOTHING`,
        [randomUUID(), clip.key, clip.rank, clip.key.split('/').pop(), clip.contentType],
      );
    }
  } finally {
    await pool.end();
  }
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = new Error(`${url} -> HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastErr)}`);
}

function killTree(proc: ChildProcess): void {
  if (!proc.pid) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* already dead */
    }
  } else {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      /* already dead */
    }
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  // This machine's C: drive is nearly full, so `npx playwright install chromium` was pointed at
  // D:/pw-browsers instead of the default (C:-drive) cache. Worker processes inherit process.env
  // as it stands when Playwright spawns them, and that happens after globalSetup finishes, so
  // setting it here (rather than requiring every shell to export it before `npm run e2e`) is
  // enough — as long as nobody has already overridden it themselves.
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= 'D:/pw-browsers';

  await createDatabase();

  const apiEnv = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
    API_ORIGIN: `http://localhost:${API_PORT}`,
    DATABASE_URL: APP_DB_URL,
    DATABASE_SSL: 'false',
    SESSION_SECRET: 'e2e-session-secret-at-least-32-chars',
    // Empty Discord credentials keep discordEnabled false, which is what unlocks /api/auth/dev-login.
    DISCORD_CLIENT_ID: '',
    DISCORD_CLIENT_SECRET: '',
    ADMIN_DISCORD_IDS: '',
    AWS_REGION: 'us-east-1',
    S3_BUCKET: 'e2e-bucket-unused',
    CDN_ORIGIN,
    LOG_LEVEL: 'silent',
  };

  const apiProc = spawn('npm', ['run', 'start', '-w', 'apps/api'], {
    cwd: ROOT,
    env: apiEnv,
    shell: true,
    stdio: 'pipe',
  });
  let apiOutput = '';
  apiProc.stdout?.on('data', (d) => (apiOutput += d.toString()));
  apiProc.stderr?.on('data', (d) => (apiOutput += d.toString()));

  try {
    await waitForHttp(`http://localhost:${API_PORT}/api/health`, 30_000);
  } catch (err) {
    killTree(apiProc);
    throw new Error(`API failed to become healthy.\n--- API output ---\n${apiOutput}\n${String(err)}`);
  }

  // Migrations already ran as part of API startup (src/index.ts awaits runMigrations() before
  // listening), so the clips table exists by the time /api/health responds.
  await seedClips();

  const webEnv = {
    ...process.env,
    VITE_DEV_API_TARGET: `http://localhost:${API_PORT}`,
  };
  const webProc = spawn('npm', ['run', 'dev', '-w', 'apps/web', '--', '--port', String(WEB_PORT), '--strictPort'], {
    cwd: ROOT,
    env: webEnv,
    shell: true,
    stdio: 'pipe',
  });
  let webOutput = '';
  webProc.stdout?.on('data', (d) => (webOutput += d.toString()));
  webProc.stderr?.on('data', (d) => (webOutput += d.toString()));

  try {
    await waitForHttp(`http://localhost:${WEB_PORT}/`, 30_000);
  } catch (err) {
    killTree(apiProc);
    killTree(webProc);
    throw new Error(`Web dev server failed to become ready.\n--- web output ---\n${webOutput}\n${String(err)}`);
  }

  return async () => {
    killTree(webProc);
    killTree(apiProc);
  };
}
