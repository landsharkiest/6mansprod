/**
 * Global setup for the DB-backed test config (vitest.db.config.ts).
 * Drops and recreates a scratch database, then runs every migration against it.
 * The connection string here must match `test.env.DATABASE_URL` in vitest.db.config.ts.
 */
import pg from 'pg';

const TEST_DB_NAME = 'sixmansdle_test_reports';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';

export default async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    // No other connections should be open at this point (this runs once, before any test file).
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }

  // vitest's `test.env` already exports DATABASE_URL etc. to the worker processes that run test
  // files, but globalSetup runs outside that, so mirror the values here before importing
  // anything that reads config at module-load time.
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:5173';
  process.env.API_ORIGIN = 'http://localhost:3001';
  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
  process.env.SESSION_SECRET = 'test-secret-test-secret';
  process.env.S3_BUCKET = 'test-bucket';

  const { runMigrations } = await import('./migrate.js');
  const { pool } = await import('./pool.js');
  await runMigrations();
  await pool.end();
}
