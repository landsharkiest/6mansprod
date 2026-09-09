import { defineConfig } from 'vitest/config';

// Same DB-backed integration setup as vitest.integration.config.ts, isolated into its own config
// only so BOT_API_TOKEN can be set: the main integration suite deliberately runs with it unset
// (matching the real default-off deployment), and test/integration/bot.test.ts needs it set to
// exercise the *enabled* /api/bot/* routes. See test/integration/botDisabled.test.ts for the
// unconfigured (503) path, which runs under the main config.
export default defineConfig({
  test: {
    include: ['test/integration/bot.test.ts'],
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
      BOT_API_TOKEN: 'test-bot-token-32-chars-long-enough',
    },
  },
});
