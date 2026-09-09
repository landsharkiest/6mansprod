import { defineConfig } from 'vitest/config';

/**
 * Separate config for `npm run test:bundle`, which reads dist/ produced by a fresh `vite build`
 * — it needs neither jsdom nor React's plugin, and it's deliberately not run by plain `vitest
 * run` (see the exclude in vitest.config.ts), so it gets its own minimal config rather than
 * fighting that exclude with CLI flags.
 */
export default defineConfig({
  test: {
    include: ['test/bundle.test.ts'],
  },
});
