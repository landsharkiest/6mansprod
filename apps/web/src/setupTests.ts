import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Vitest doesn't auto-run RTL's cleanup between tests the way Jest's testEnvironment does.
afterEach(() => {
  cleanup();
});
