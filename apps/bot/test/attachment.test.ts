import { describe, expect, it } from 'vitest';
import { validateAttachment } from '../src/lib/attachment.js';

const maxBytes = 50 * 1024 * 1024;

describe('validateAttachment', () => {
  it('accepts an mp4 under the size limit', () => {
    expect(validateAttachment({ contentType: 'video/mp4', size: 1000 }, maxBytes)).toBeNull();
  });

  it('accepts webm and quicktime too', () => {
    expect(validateAttachment({ contentType: 'video/webm', size: 1000 }, maxBytes)).toBeNull();
    expect(validateAttachment({ contentType: 'video/quicktime', size: 1000 }, maxBytes)).toBeNull();
  });

  it('rejects an unsupported content type', () => {
    expect(validateAttachment({ contentType: 'image/png', size: 1000 }, maxBytes)).toMatch(/mp4, webm, or mov/);
  });

  it('rejects a missing content type', () => {
    expect(validateAttachment({ contentType: null, size: 1000 }, maxBytes)).toMatch(/mp4, webm, or mov/);
    expect(validateAttachment({ contentType: undefined, size: 1000 }, maxBytes)).toMatch(/mp4, webm, or mov/);
  });

  it('rejects a file over the size limit', () => {
    const error = validateAttachment({ contentType: 'video/mp4', size: maxBytes + 1 }, maxBytes);
    expect(error).toMatch(/too large/);
    expect(error).toContain('50 MB');
  });

  it('accepts a file exactly at the size limit', () => {
    expect(validateAttachment({ contentType: 'video/mp4', size: maxBytes }, maxBytes)).toBeNull();
  });

  it('rejects a zero or negative size', () => {
    expect(validateAttachment({ contentType: 'video/mp4', size: 0 }, maxBytes)).toMatch(/no readable size/);
    expect(validateAttachment({ contentType: 'video/mp4', size: -5 }, maxBytes)).toMatch(/no readable size/);
  });
});
