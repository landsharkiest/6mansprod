import { defineConfig } from 'vitest/config';

// Integration tests hit a real local Postgres (sixmansdle_test) and exercise the Express app
// end-to-end through supertest. They share the database, so files must not run in parallel.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/support/globalSetup.ts'],
    setupFiles: ['test/support/setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      WEB_ORIGIN: 'http://localhost:5173',
      API_ORIGIN: 'http://localhost:3001',
      DATABASE_URL: `postgres://postgres:postgres@localhost:5432/${process.env.TEST_DB_NAME || 'sixmansdle_test'}`,
      DATABASE_SSL: 'false',
      SESSION_SECRET: 'test-secret-test-secret-32-chars-long',
      S3_BUCKET: 'test-bucket',
      ADMIN_DISCORD_IDS: '',
      LOG_LEVEL: 'silent',
    },
  },
});
