import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createApprovedClip } from '../support/factories.js';

describe('GET /api/me/profile', () => {
  it('401s for a guest', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/me/profile');
    expect(res.status).toBe(401);
  });

  it('returns the signed-in user\'s profile', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app);
    const res = await agent.get('/api/me/profile');
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('Dev Player');
    expect(res.body.totals).toEqual({ guesses: 0, correct: 0, accuracy: 0 });
  });
});

describe('GET /api/users/:id/profile', () => {
  it('404s for an unknown id', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/users/999999/profile');
    expect(res.status).toBe(404);
  });

  it('aggregates activity days per UTC day with daily correct/wrong/none', async () => {
    const app = buildApp();
    const { agent, userId } = await loginAs(app);

    // Daily: play today, correct.
    const dailyClip = await createApprovedClip('S');
    const dailyRes = await agent.get('/api/daily');
    await agent.post('/api/guesses').send({ clipId: dailyRes.body.clip.clipId, rank: 'S', mode: 'daily' });
    expect(dailyRes.body.clip.clipId).toBe(dailyClip.id);

    // Endless: an extra counted guess on the same UTC day, wrong.
    const endlessClip = await createApprovedClip('H');
    await agent.post('/api/guesses').send({ clipId: endlessClip.id, rank: 'S', mode: 'endless' });

    const res = await guestClient(app).get(`/api/users/${userId}/profile`);
    expect(res.status).toBe(200);
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = res.body.activity.find((a: { date: string }) => a.date === today);
    expect(todayEntry).toBeTruthy();
    expect(todayEntry.guesses).toBe(2);
    expect(todayEntry.daily).toBe('correct');
    expect(res.body.totals.guesses).toBe(2);
    expect(res.body.totals.correct).toBe(1);
  });

  it('marks the day "wrong" when the daily guess was wrong', async () => {
    const app = buildApp();
    const { agent, userId } = await loginAs(app);
    await createApprovedClip('S');
    const dailyRes = await agent.get('/api/daily');
    await agent.post('/api/guesses').send({ clipId: dailyRes.body.clip.clipId, rank: 'H', mode: 'daily' });

    const res = await guestClient(app).get(`/api/users/${userId}/profile`);
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = res.body.activity.find((a: { date: string }) => a.date === today);
    expect(todayEntry.daily).toBe('wrong');
  });
});
