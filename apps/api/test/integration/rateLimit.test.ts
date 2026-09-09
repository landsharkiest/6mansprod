import { describe, expect, it } from 'vitest';
import { buildApp, guestClient } from '../support/client.js';
import { createApprovedClip } from '../support/factories.js';

/**
 * Production defaults for the guess limiter (60 requests / 60s, see apps/api/src/routes/game.ts)
 * are exercised directly rather than lowered for the test — 61 local requests complete in well
 * under the window, so this stays a true test of the real limiter.
 */
describe('POST /api/guesses — rate limiting', () => {
  it('the 61st guess within a minute gets 429', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('S');
    const client = guestClient(app);

    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await client.post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });
      lastStatus = res.status;
      if (i < 60) expect(res.status).toBe(201);
    }
    expect(lastStatus).toBe(429);
  }, 20_000);
});
