import { defineConfig, devices } from '@playwright/test';

/**
 * Chromium-only smoke suite against a throwaway API (port 3101, its own Postgres database) and
 * web dev server (port 5273) — see support/global-setup.ts for how those get started and torn
 * down. Kept deliberately small (see e2e/tests/) so the whole run stays under ~90s.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  globalSetup: './support/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5273',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
