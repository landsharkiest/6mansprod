/**
 * Runs once before the whole integration suite (in a separate process from the test workers).
 * Creates the sixmansdle_test database if it doesn't exist yet, then applies migrations.
 *
 * The env vars set here mirror `vitest.integration.config.ts`'s `test.env` block. They only need
 * to be correct for this process; the actual test workers get theirs from that config.
 */
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:5173';
  process.env.API_ORIGIN = 'http://localhost:3001';
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/sixmansdle_test';
  process.env.DATABASE_SSL = 'false';
  process.env.SESSION_SECRET = 'test-secret-test-secret-32-chars-long';
  process.env.S3_BUCKET = 'test-bucket';
  process.env.ADMIN_DISCORD_IDS = process.env.ADMIN_DISCORD_IDS ?? '';
  process.env.LOG_LEVEL = 'silent';

  const pg = await import('pg');
  const admin = new pg.default.Client({
    connectionString: 'postgres://postgres:postgres@localhost:5432/postgres',
  });
  await admin.connect();
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', ['sixmansdle_test']);
    if (rows.length === 0) {
      await admin.query('CREATE DATABASE sixmansdle_test');
    }
  } finally {
    await admin.end();
  }

  const { runMigrations } = await import('../../src/db/migrate.js');
  await runMigrations();
  const { pool } = await import('../../src/db/pool.js');
  await pool.end();
}
