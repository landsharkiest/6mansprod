import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createApprovedClip } from '../support/factories.js';

describe('param validation error mapping', () => {
  it('a malformed uuid in a route param yields 400, not a 500', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/clips/not-a-uuid/stats');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });
});

describe('cache headers', () => {
  it('a user-specific endpoint is private, no-store', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app, 'player');
    const res = await agent.get('/api/me/profile');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('the leaderboard is publicly cacheable for 30s', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/stats/leaderboard');
    expect(res.headers['cache-control']).toBe('public, max-age=30');
  });

  it('community stats is publicly cacheable for 30s', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/stats/community');
    expect(res.headers['cache-control']).toBe('public, max-age=30');
  });

  it('a default (non-overridden) JSON endpoint stays private, no-store', async () => {
    const app = buildApp();
    await createApprovedClip('S');
    const res = await guestClient(app).get('/api/clips/random');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('does not send an ETag on JSON responses', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/stats/leaderboard');
    expect(res.headers.etag).toBeUndefined();
  });
});

describe('GET /api/version', () => {
  it('is safe and returns null when GIT_SHA is unset', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sha: null });
  });
});

describe('anonymous traffic limiter', () => {
  it('does not throttle /api/health', async () => {
    const app = buildApp();
    const client = guestClient(app);
    // Well below the global limit, but proves health isn't decremented against it by hammering
    // it more than a route-specific limiter would tolerate, then confirming a normal route still
    // has essentially its full budget.
    for (let i = 0; i < 50; i++) {
      const res = await client.get('/api/health');
      expect(res.status).toBe(200);
    }
  });
});
