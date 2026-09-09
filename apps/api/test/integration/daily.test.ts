import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createApprovedClip } from '../support/factories.js';

describe('GET /api/daily', () => {
  it('returns the same clip for repeated calls within a day', async () => {
    const app = buildApp();
    await createApprovedClip('S');
    await createApprovedClip('X');
    await createApprovedClip('A');

    const client = guestClient(app);
    const first = await client.get('/api/daily');
    const second = await client.get('/api/daily');
    expect(first.status).toBe(200);
    expect(first.body.clip.clipId).toBe(second.body.clip.clipId);
    expect(first.body.date).toBe(second.body.date);
  });

  it('returns result:null for a guest', async () => {
    const app = buildApp();
    await createApprovedClip('S');
    const res = await guestClient(app).get('/api/daily');
    expect(res.body.result).toBeNull();
  });

  it('populates result after a signed-in guess', async () => {
    const app = buildApp();
    await createApprovedClip('S');
    const { agent } = await loginAs(app);

    const before = await agent.get('/api/daily');
    expect(before.body.result).toBeNull();

    const clipId = before.body.clip.clipId;
    const guessRes = await agent.post('/api/guesses').send({ clipId, rank: 'S', mode: 'daily' });
    expect(guessRes.status).toBe(201);

    const after = await agent.get('/api/daily');
    expect(after.body.result).not.toBeNull();
    expect(after.body.result.correct).toBe(true);
    expect(after.body.result.guessedRank).toBe('S');
    expect(after.body.result.streak).toEqual({ current: 1, best: 1 });
  });

  it('returns a 404-style error when there are no approved clips', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/daily');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});
