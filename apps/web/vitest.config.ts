import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: false,
    // bundle.test.ts reads dist/ from a production `vite build` and has no use for jsdom; it
    // runs only via `npm run test:bundle`, never as part of the regular unit-test run.
    exclude: ['**/node_modules/**', 'test/bundle.test.ts'],
  },
});
