import { pool } from '../../src/db/pool.js';

// Every table with rows a test might create. `session` is included so leftover supertest
// sessions from one test never bleed into the next.
const TABLES = [
  'guesses',
  'blitz_runs',
  'daily_challenges',
  'user_daily_stats',
  'user_endless_stats',
  'clips',
  'users',
  'session',
];

/** Wipes all app data between tests. RESTART IDENTITY keeps generated ids deterministic. */
export async function resetDb(): Promise<void> {
  await pool.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

export async function closePool(): Promise<void> {
  await pool.end();
}
