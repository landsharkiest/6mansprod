import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure unit tests only. Integration tests (against a real Postgres) live under test/integration
    // and run via vitest.integration.config.ts / `npm run test:integration`.
    include: ['src/**/*.test.ts'],
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
