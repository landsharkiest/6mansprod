import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DB-backed integration tests live in vitest.db.config.ts (needs a local Postgres).
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
