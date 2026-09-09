import { afterAll, afterEach, beforeEach } from 'vitest';
import './storageMock.js';
import { resetDb, closePool } from './db.js';

beforeEach(async () => {
  await resetDb();
});

afterEach(async () => {
  const { headObject, playbackUrl, presignUpload, deleteObject, clipKey } = await import('../../src/services/storage.js');
  const { vi } = await import('vitest');
  // Clear call history between tests; the default resolved values set in storageMock.ts stay intact.
  for (const fn of [headObject, playbackUrl, presignUpload, deleteObject, clipKey]) {
    vi.mocked(fn).mockClear();
  }
});

afterAll(async () => {
  await closePool();
});
