/**
 * Minimal forward-only SQL migration runner.
 * Files in ./migrations are applied in lexical order and recorded in schema_migrations.
 * Run with `npm run db:migrate` or automatically on API startup.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { logger } from '../logger.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info({ file }, 'applied migration');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, file }, 'migration failed');
      throw err;
    } finally {
      client.release();
    }
  }
}

// Allow `tsx src/db/migrate.ts` as a standalone command.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then(() => pool.end())
    .then(() => logger.info('migrations complete'))
    .catch(() => process.exit(1));
}
