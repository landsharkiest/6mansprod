import { describe, expect, it } from 'vitest';
import { buildApp, guestClient } from '../support/client.js';
import { createApprovedClip } from '../support/factories.js';

describe('GET /api/clips/random', () => {
  it('excludes the given id when an alternative exists', async () => {
    const app = buildApp();
    const a = await createApprovedClip('S');
    const b = await createApprovedClip('X');
    const client = guestClient(app);

    // Ask many times; with two clips and exclusion, it should always be the other one.
    for (let i = 0; i < 10; i++) {
      const res = await client.get(`/api/clips/random?exclude=${a.id}`);
      expect(res.status).toBe(200);
      expect(res.body.clipId).toBe(b.id);
    }
  });

  it('falls back to the same clip when it is the only one', async () => {
    const app = buildApp();
    const only = await createApprovedClip('S');
    const res = await guestClient(app).get(`/api/clips/random?exclude=${only.id}`);
    expect(res.status).toBe(200);
    expect(res.body.clipId).toBe(only.id);
  });

  it('404s when there are no approved clips', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/clips/random');
    expect(res.status).toBe(404);
  });
});
