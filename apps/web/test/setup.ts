import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// @testing-library/react's auto-cleanup only self-registers when it detects global test hooks;
// this project doesn't enable vitest's `globals` option, so unmount explicitly between tests.
afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver. recharts' <ResponsiveContainer> (used by DistributionChart /
// ConfusionMatrix) reads it on mount, so any test that renders the post-guess result screen
// needs at least a no-op stand-in.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
