import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// @testing-library/react's auto-cleanup only self-registers when it detects global test hooks;
// this project doesn't enable vitest's `globals` option, so unmount explicitly between tests.
afterEach(() => {
  cleanup();
});
