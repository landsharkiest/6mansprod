import { defineConfig } from 'vitest/config';

// Pure unit tests only — attachment validation, the daily-post scheduler's time math, and
// message formatting. None of it talks to Discord or the network, so no setup/env is needed.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
