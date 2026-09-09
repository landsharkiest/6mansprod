import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure unit tests only. DB-backed suites live in test/integration (vitest.integration.config.ts)
    // and src/**/*.db.test.ts (vitest.db.config.ts); both need a local Postgres.
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
    // Unit tests never touch the network; these values only satisfy config validation.
    env: {
      NODE_ENV: 'test',
      WEB_ORIGIN: 'http://localhost:5173',
      API_ORIGIN: 'http://localhost:3001',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      SESSION_SECRET: 'test-secret-test-secret',
      S3_BUCKET: 'test-bucket',
    },
  },
});
