import { vi } from 'vitest';

/**
 * Replaces the S3-backed storage module so integration tests never make AWS calls.
 * Imported once for its side effect (vi.mock) from test/support/setup.ts; individual tests can
 * import the named exports and override them per-test with mockResolvedValueOnce / mockReturnValueOnce.
 */
vi.mock('../../src/services/storage.js', () => ({
  ALLOWED_VIDEO_TYPES: {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  } as Record<string, string>,
  clipKey: vi.fn((clipId: string, contentType: string) => {
    const ext = contentType === 'video/webm' ? 'webm' : contentType === 'video/quicktime' ? 'mov' : 'mp4';
    return `clips/${clipId}.${ext}`;
  }),
  playbackUrl: vi.fn(async (key: string) => `https://fake-cdn.test/${key}`),
  presignUpload: vi.fn(async (key: string, contentType: string) => ({
    url: `https://fake-s3.test/${key}`,
    headers: { 'Content-Type': contentType },
  })),
  headObject: vi.fn(async () => ({ size: 1234, contentType: 'video/mp4' })),
  deleteObject: vi.fn(async () => {}),
}));
