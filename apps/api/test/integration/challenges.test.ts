import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createApprovedClip } from '../support/factories.js';
import { pool } from '../../src/db/pool.js';

describe('POST /api/challenges — creation', () => {
  it('requires auth', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('S');
    const res = await guestClient(app).post('/api/challenges').send({ clipId: clip.id });
    expect(res.status).toBe(401);
  });

  it('requires the caller to have already guessed the clip', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('S');
    const { agent } = await loginAs(app, 'player');
    const res = await agent.post('/api/challenges').send({ clipId: clip.id });
    expect(res.status).toBe(400);
  });

  it('uses the latest guess as the creator guess and returns a token + url', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('S');
    const { agent } = await loginAs(app, 'player');

    await agent.post('/api/guesses').send({ clipId: clip.id, rank: 'X', mode: 'endless' });
    // A repeat guess on the same clip is stored (counted:false) but is still the "latest" guess.
    await agent.post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });

    const res = await agent.post('/api/challenges').send({ clipId: clip.id });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(res.body.url).toContain(res.body.token);

    const { rows } = await pool.query('SELECT creator_guess FROM challenges WHERE token = $1', [res.body.token]);
    expect(rows[0].creator_guess).toBe('S');
  });

  it('is idempotent per (creator, clip): a second create returns the same token', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('S');
    const { agent } = await loginAs(app, 'player');
    await agent.post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });

    const first = await agent.post('/api/challenges').send({ clipId: clip.id });
    const second = await agent.post('/api/challenges').send({ clipId: clip.id });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.token).toBe(first.body.token);

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM challenges WHERE clip_id = $1', [clip.id]);
    expect(rows[0].count).toBe(1);
  });

  it('404s for an unknown clip', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app, 'player');
    const res = await agent.post('/api/challenges').send({ clipId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });
});

async function createChallengeFor(agent: ReturnType<typeof guestClient>, rank = 'S') {
  const clip = await createApprovedClip(rank as never);
  await agent.post('/api/guesses').send({ clipId: clip.id, rank, mode: 'endless' });
  const res = await agent.post('/api/challenges').send({ clipId: clip.id });
  return { clip, token: res.body.token as string };
}

describe('GET /api/challenges/:token', () => {
  it('404s for an unknown token', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/challenges/doesnotexist1');
    expect(res.status).toBe(404);
  });

  it('hides the rank and reveal before the caller has guessed', async () => {
    const app = buildApp();
    const creator = await loginAs(app, 'player');
    const { token } = await createChallengeFor(creator.agent, 'S');

    const viewer = guestClient(app);
    const res = await viewer.get(`/api/challenges/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.clip).toBeDefined();
    expect(res.body.clip.rank).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('"actualRank"');
    expect(res.body.myAttempt).toBeNull();
    expect(res.body.reveal).toBeNull();
    expect(res.body.creator.username).toBeDefined();
    expect(res.body.attempts).toBe(0);
    expect(res.body.expired).toBe(false);
  });

  it('includes the reveal once the signed-in caller has attempted (so a refresh still works)', async () => {
    const app = buildApp();
    const creator = await loginAs(app, 'player');
    const { token } = await createChallengeFor(creator.agent, 'S');

    const other = await loginAs(app, 'admin');
    await other.agent.post(`/api/challenges/${token}/guess`).send({ rank: 'X' });

    const res = await other.agent.get(`/api/challenges/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.myAttempt).toEqual({ guessedRank: 'X', isCorrect: false });
    expect(res.body.reveal).toEqual({
      actualRank: 'S',
      creatorGuess: 'S',
      creatorCorrect: true,
      distribution: expect.any(Array),
    });
  });
});

describe('POST /api/challenges/:token/guess', () => {
  it('404s for an unknown token', async () => {
    const app = buildApp();
    const res = await guestClient(app).post('/api/challenges/doesnotexist1/guess').send({ rank: 'S' });
    expect(res.status).toBe(404);
  });

  it('records a normal endless guess plus a challenge attempt', async () => {
    const app = buildApp();
    const creator = await loginAs(app, 'player');
    const { clip, token } = await createChallengeFor(creator.agent, 'S');

    const taker = await loginAs(app, 'admin');
    const res = await taker.agent.post(`/api/challenges/${token}/guess`).send({ rank: 'S' });
    expect(res.status).toBe(201);
    expect(res.body.correct).toBe(true);
    expect(res.body.actualRank).toBe('S');
    expect(res.body.creatorGuess).toBe('S');
    expect(res.body.creatorCorrect).toBe(true);
    expect(res.body.stats).toBeDefined();

    const guessRows = await pool.query(
      "SELECT * FROM guesses WHERE clip_id = $1 AND user_id = $2 AND mode = 'endless'",
      [clip.id, taker.userId],
    );
    expect(guessRows.rowCount).toBe(1);

    const attemptRows = await pool.query(
      'SELECT * FROM challenge_attempts WHERE challenge_id = (SELECT id FROM challenges WHERE token = $1) AND user_id = $2',
      [token, taker.userId],
    );
    expect(attemptRows.rowCount).toBe(1);
    expect(attemptRows.rows[0].is_correct).toBe(true);
  });

  it('409s on a second attempt by the same signed-in user', async () => {
    const app = buildApp();
    const creator = await loginAs(app, 'player');
    const { token } = await createChallengeFor(creator.agent, 'S');

    const taker = await loginAs(app, 'admin');
    const first = await taker.agent.post(`/api/challenges/${token}/guess`).send({ rank: 'S' });
    expect(first.status).toBe(201);

    const second = await taker.agent.post(`/api/challenges/${token}/guess`).send({ rank: 'X' });
    expect(second.status).toBe(409);
  });

  it('allows guests to attempt without a uniqueness restriction', async () => {
    const app = buildApp();
    const creator = await loginAs(app, 'player');
    const { token } = await createChallengeFor(creator.agent, 'S');

    const guest = guestClient(app);
    const first = await guest.post(`/api/challenges/${token}/guess`).send({ rank: 'S' });
    expect(first.status).toBe(201);
    const second = await guest.post(`/api/challenges/${token}/guess`).send({ rank: 'X' });
    expect(second.status).toBe(201);
  });

  it('410s for an expired challenge', async () => {
    const app = buildApp();
    const creator = await loginAs(app, 'player');
    const { token } = await createChallengeFor(creator.agent, 'S');
    await pool.query("UPDATE challenges SET expires_at = now() - interval '1 day' WHERE token = $1", [token]);

    const taker = guestClient(app);
    const res = await taker.post(`/api/challenges/${token}/guess`).send({ rank: 'S' });
    expect(res.status).toBe(410);
  });

  describe('youBeatCreator', () => {
    it('is true when the taker is correct and the creator was wrong', async () => {
      const app = buildApp();
      const creator = await loginAs(app, 'player');
      // Creator guesses X on an S clip — wrong.
      const clip = await createApprovedClip('S');
      await creator.agent.post('/api/guesses').send({ clipId: clip.id, rank: 'X', mode: 'endless' });
      const createRes = await creator.agent.post('/api/challenges').send({ clipId: clip.id });
      const token = createRes.body.token;

      const taker = await loginAs(app, 'admin');
      const res = await taker.agent.post(`/api/challenges/${token}/guess`).send({ rank: 'S' });
      expect(res.body.correct).toBe(true);
      expect(res.body.creatorCorrect).toBe(false);
      expect(res.body.youBeatCreator).toBe(true);
    });

    it('is false (tie) when both the taker and creator are correct', async () => {
      const app = buildApp();
      const creator = await loginAs(app, 'player');
      const { token } = await createChallengeFor(creator.agent, 'S');

      const taker = await loginAs(app, 'admin');
      const res = await taker.agent.post(`/api/challenges/${token}/guess`).send({ rank: 'S' });
      expect(res.body.correct).toBe(true);
      expect(res.body.creatorCorrect).toBe(true);
      expect(res.body.youBeatCreator).toBe(false);
    });

    it('is false (tie) when both the taker and creator are wrong', async () => {
      const app = buildApp();
      const creator = await loginAs(app, 'player');
      const clip = await createApprovedClip('S');
      await creator.agent.post('/api/guesses').send({ clipId: clip.id, rank: 'X', mode: 'endless' });
      const createRes = await creator.agent.post('/api/challenges').send({ clipId: clip.id });
      const token = createRes.body.token;

      const taker = await loginAs(app, 'admin');
      const res = await taker.agent.post(`/api/challenges/${token}/guess`).send({ rank: 'A' });
      expect(res.body.correct).toBe(false);
      expect(res.body.creatorCorrect).toBe(false);
      expect(res.body.youBeatCreator).toBe(false);
    });

    it('is false when the taker is wrong and the creator was correct', async () => {
      const app = buildApp();
      const creator = await loginAs(app, 'player');
      const { token } = await createChallengeFor(creator.agent, 'S');

      const taker = await loginAs(app, 'admin');
      const res = await taker.agent.post(`/api/challenges/${token}/guess`).send({ rank: 'A' });
      expect(res.body.correct).toBe(false);
      expect(res.body.creatorCorrect).toBe(true);
      expect(res.body.youBeatCreator).toBe(false);
    });
  });
});
