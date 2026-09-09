import { afterAll, afterEach, beforeEach } from 'vitest';
import './storageMock.js';
import { resetDb, closePool } from './db.js';

beforeEach(async () => {
  await resetDb();
  // resetDb RESTART IDENTITYs every table, so user/clip ids are reused test to test. Aggregate
  // endpoints cache per id (community stats, per-user insights) for real wall-clock seconds,
  // which would otherwise leak one test's data into the next test that reuses the same id.
  const { resetCommunityStatsCacheForTests } = await import('../../src/services/communityStats.js');
  const { resetInsightsCacheForTests } = await import('../../src/services/insights.js');
  resetCommunityStatsCacheForTests();
  resetInsightsCacheForTests();
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
