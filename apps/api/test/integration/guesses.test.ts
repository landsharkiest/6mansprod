import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createApprovedClip, createClip } from '../support/factories.js';
import { pool } from '../../src/db/pool.js';

describe('POST /api/guesses — validation', () => {
  it('rejects a bad uuid', async () => {
    const app = buildApp();
    const res = await guestClient(app).post('/api/guesses').send({ clipId: 'not-a-uuid', rank: 'S', mode: 'endless' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad rank', async () => {
    const app = buildApp();
    const clip = await createApprovedClip();
    const res = await guestClient(app)
      .post('/api/guesses')
      .send({ clipId: clip.id, rank: 'GOD', mode: 'endless' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad mode', async () => {
    const app = buildApp();
    const clip = await createApprovedClip();
    const res = await guestClient(app)
      .post('/api/guesses')
      .send({ clipId: clip.id, rank: 'S', mode: 'ranked' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/guesses — unknown / unapproved clips', () => {
  it('404s for an unknown clip id', async () => {
    const app = buildApp();
    const res = await guestClient(app)
      .post('/api/guesses')
      .send({ clipId: '00000000-0000-0000-0000-000000000000', rank: 'S', mode: 'endless' });
    expect(res.status).toBe(404);
  });

  it('404s for a pending (unapproved) clip', async () => {
    const app = buildApp();
    const clip = await createClip({ status: 'pending' });
    const res = await guestClient(app).post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/guesses — verdict', () => {
  it('returns correct=true and distance 0 for the right rank', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('S');
    const res = await guestClient(app).post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });
    expect(res.status).toBe(201);
    expect(res.body.correct).toBe(true);
    expect(res.body.distance).toBe(0);
    expect(res.body.actualRank).toBe('S');
  });

  it('returns correct=false and the rank distance for a wrong guess', async () => {
    const app = buildApp();
    // RANKS = ['S','X','A','B+','B','C','D','E','H'] — X is one away from S.
    const clip = await createApprovedClip('S');
    const res = await guestClient(app).post('/api/guesses').send({ clipId: clip.id, rank: 'X', mode: 'endless' });
    expect(res.status).toBe(201);
    expect(res.body.correct).toBe(false);
    expect(res.body.distance).toBe(1);
  });

  it('records guest guesses (no user_id) without error', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('B');
    const res = await guestClient(app).post('/api/guesses').send({ clipId: clip.id, rank: 'B', mode: 'endless' });
    expect(res.status).toBe(201);
    const { rows } = await pool.query('SELECT user_id, counted FROM guesses WHERE clip_id = $1', [clip.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeNull();
    expect(rows[0].counted).toBe(true);
  });
});

describe('POST /api/guesses — daily mode', () => {
  it('400s when the clipId is not today\'s daily clip', async () => {
    const app = buildApp();
    await createApprovedClip('S'); // becomes today's daily on first /api/daily fetch
    const dailyRes = await guestClient(app).get('/api/daily');
    expect(dailyRes.status).toBe(200);
    const otherClip = await createApprovedClip('X');
    const res = await guestClient(app)
      .post('/api/guesses')
      .send({ clipId: otherClip.id, rank: 'X', mode: 'daily' });
    expect(res.status).toBe(400);
  });

  it('409s when a signed-in user guesses the daily twice', async () => {
    const app = buildApp();
    await createApprovedClip('S');
    const { agent } = await loginAs(app, 'player');
    const dailyRes = await agent.get('/api/daily');
    const clipId = dailyRes.body.clip.clipId;

    const first = await agent.post('/api/guesses').send({ clipId, rank: 'S', mode: 'daily' });
    expect(first.status).toBe(201);

    const second = await agent.post('/api/guesses').send({ clipId, rank: 'S', mode: 'daily' });
    expect(second.status).toBe(409);
  });

  it('lets a guest guess the daily repeatedly', async () => {
    const app = buildApp();
    await createApprovedClip('S');
    const guest = guestClient(app);
    const dailyRes = await guest.get('/api/daily');
    const clipId = dailyRes.body.clip.clipId;

    const first = await guest.post('/api/guesses').send({ clipId, rank: 'S', mode: 'daily' });
    expect(first.status).toBe(201);
    const second = await guest.post('/api/guesses').send({ clipId, rank: 'X', mode: 'daily' });
    expect(second.status).toBe(201);
  });
});

describe('POST /api/guesses — endless mode repeats', () => {
  it('a repeat clip by the same user is counted:false and leaves the run unchanged', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('S');
    const { agent } = await loginAs(app, 'player');

    const first = await agent.post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });
    expect(first.status).toBe(201);
    expect(first.body.counted).toBe(true);
    expect(first.body.run).toEqual({ current: 1, best: 1 });

    const second = await agent.post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });
    expect(second.status).toBe(201);
    expect(second.body.counted).toBe(false);
    // Run is read back unchanged, not re-incremented.
    expect(second.body.run).toEqual({ current: 1, best: 1 });
  });

  it('run increments on consecutive correct guesses and resets on a wrong one', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app, 'player');

    const clip1 = await createApprovedClip('S');
    const r1 = await agent.post('/api/guesses').send({ clipId: clip1.id, rank: 'S', mode: 'endless' });
    expect(r1.body.run).toEqual({ current: 1, best: 1 });

    const clip2 = await createApprovedClip('X');
    const r2 = await agent.post('/api/guesses').send({ clipId: clip2.id, rank: 'X', mode: 'endless' });
    expect(r2.body.run).toEqual({ current: 2, best: 2 });

    const clip3 = await createApprovedClip('A');
    const r3 = await agent.post('/api/guesses').send({ clipId: clip3.id, rank: 'H', mode: 'endless' }); // wrong
    expect(r3.body.correct).toBe(false);
    expect(r3.body.run).toEqual({ current: 0, best: 2 });
  });

  it('retains the best run after a subsequent shorter run', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app, 'player');

    for (const rank of ['S', 'X'] as const) {
      const clip = await createApprovedClip(rank);
      await agent.post('/api/guesses').send({ clipId: clip.id, rank, mode: 'endless' });
    }
    const wrongClip = await createApprovedClip('A');
    await agent.post('/api/guesses').send({ clipId: wrongClip.id, rank: 'H', mode: 'endless' });

    const goodClip = await createApprovedClip('B');
    const res = await agent.post('/api/guesses').send({ clipId: goodClip.id, rank: 'B', mode: 'endless' });
    expect(res.body.run).toEqual({ current: 1, best: 2 });
  });
});

describe('POST /api/guesses — cross-user isolation', () => {
  it('one user\'s repeat does not affect another user\'s first guess on the same clip', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('S');
    const { agent: alice } = await loginAs(app);

    const a1 = await alice.post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });
    expect(a1.body.counted).toBe(true);

    const bob = guestClient(app);
    const b1 = await bob.post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });
    expect(b1.status).toBe(201);
    expect(b1.body.counted).toBe(true);
  });
});
