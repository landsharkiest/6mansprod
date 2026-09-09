import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createApprovedClip } from '../support/factories.js';

describe('smoke', () => {
  it('answers health check', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('logs in via dev-login and creates a clip via the factory', async () => {
    const app = buildApp();
    const { agent, userId } = await loginAs(app, 'player');
    expect(userId).toBeGreaterThan(0);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.id).toBe(userId);

    const clip = await createApprovedClip('S');
    const random = await agent.get('/api/clips/random');
    expect(random.status).toBe(200);
    expect(random.body.clipId).toBe(clip.id);
    expect(random.body.videoUrl).toContain('fake-cdn.test');
  });
});
