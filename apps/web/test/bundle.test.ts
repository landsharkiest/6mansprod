import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the payoff of the route-level code splitting in src/App.tsx and the manualChunks split
 * in vite.config.ts: the entry chunk (the JS every visitor downloads before anything renders)
 * stays small, and no single chunk — including the recharts/framer-motion vendor chunks — grows
 * large enough to become its own loading-time problem.
 *
 * This test reads dist/, so it only makes sense after a fresh `vite build` — run it via
 * `npm run test:bundle`, not the regular `npm test` (see the vitest.config.ts exclude for why
 * plain `vitest run` skips this file).
 */
const ENTRY_BUDGET_BYTES = 250 * 1024;
const CHUNK_BUDGET_BYTES = 450 * 1024;

describe('production bundle size', () => {
  const assetsDir = join(__dirname, '..', 'dist', 'assets');

  it('has a dist/assets directory to check (run `vite build` first)', () => {
    expect(statSync(assetsDir).isDirectory()).toBe(true);
  });

  const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));

  it('produced at least one JS chunk', () => {
    expect(jsFiles.length).toBeGreaterThan(0);
  });

  // The entry chunk is the one Vite names "index-<hash>.js" — everything else (page chunks,
  // vendor-recharts, vendor-framer-motion, ...) is lazy-loaded on demand.
  const entryFiles = jsFiles.filter((f) => /^index-.*\.js$/.test(f));

  it('has exactly one entry chunk named index-<hash>.js', () => {
    expect(entryFiles).toHaveLength(1);
  });

  it(`keeps the entry chunk under ${ENTRY_BUDGET_BYTES / 1024} KB minified`, () => {
    const entry = entryFiles[0];
    if (!entry) throw new Error('no entry chunk found (see the previous test)');
    const size = statSync(join(assetsDir, entry)).size;
    expect(size, `${entry} is ${(size / 1024).toFixed(1)} KB`).toBeLessThan(ENTRY_BUDGET_BYTES);
  });

  it(`keeps every chunk under ${CHUNK_BUDGET_BYTES / 1024} KB minified`, () => {
    const oversized = jsFiles
      .map((f) => ({ file: f, size: statSync(join(assetsDir, f)).size }))
      .filter(({ size }) => size >= CHUNK_BUDGET_BYTES);
    expect(oversized, JSON.stringify(oversized)).toHaveLength(0);
  });
});
