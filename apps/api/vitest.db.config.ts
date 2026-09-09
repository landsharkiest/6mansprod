import { defineConfig } from 'vitest/config';

/**
 * DB-backed integration tests, kept out of the default `npm test` run since they need a local
 * Postgres. Run with `npm run test:db`. Database name/creds must match src/db/testGlobalSetup.ts.
 */
export default defineConfig({
  test: {
    include: ['**/*.db.test.ts'],
    globalSetup: ['./src/db/testGlobalSetup.ts'],
    // Real, shared Postgres state -- keep test files from stepping on each other.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      WEB_ORIGIN: 'http://localhost:5173',
      API_ORIGIN: 'http://localhost:3001',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/sixmansdle_test_reports',
      SESSION_SECRET: 'test-secret-test-secret',
      S3_BUCKET: 'test-bucket',
    },
  },
});
