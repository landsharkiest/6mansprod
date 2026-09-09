import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createApprovedClip, createUser } from '../support/factories.js';
import { pool } from '../../src/db/pool.js';

describe('POST /api/blitz/start', () => {
  it('creates a run and returns a runId, endsAt, and a clip', async () => {
    const app = buildApp();
    await createApprovedClip('S');

    const res = await guestClient(app).post('/api/blitz/start');
    expect(res.status).toBe(201);
    expect(typeof res.body.runId).toBe('number');
    expect(typeof res.body.endsAt).toBe('string');
    expect(res.body.clip).toBeTruthy();
    expect(typeof res.body.clip.clipId).toBe('string');
  });
});

describe('POST /api/blitz/:runId/guess', () => {
  it('400s when clipId does not match the run\'s current clip', async () => {
    const app = buildApp();
    // Only one approved clip exists, so the run's current clip is deterministic: whatever id
    // we send here is guaranteed to mismatch it.
    await createApprovedClip('S');
    const guest = guestClient(app);

    const start = await guest.post('/api/blitz/start');
    const res = await guest
      .post(`/api/blitz/${start.body.runId}/guess`)
      .send({ clipId: '00000000-0000-0000-0000-000000000000', rank: 'X' });
    expect(res.status).toBe(400);
  });

  it('scores a correct guess in the 100..150 range and advances to a new clip', async () => {
    const app = buildApp();
    const clip = await createApprovedClip('S');
    await createApprovedClip('X');
    const guest = guestClient(app);

    const start = await guest.post('/api/blitz/start');
    // The clip served might be either of the two approved clips; guess its actual rank via the DB.
    const { rows } = await pool.query('SELECT rank FROM clips WHERE id = $1', [start.body.clip.clipId]);
    const actualRank = rows[0].rank;

    const res = await guest.post(`/api/blitz/${start.body.runId}/guess`).send({ clipId: start.body.clip.clipId, rank: actualRank });
    expect(res.status).toBe(201);
    expect(res.body.correct).toBe(true);
    expect(res.body.points).toBeGreaterThanOrEqual(100);
    expect(res.body.points).toBeLessThanOrEqual(150);
    expect(res.body.score).toBe(res.body.points);
    expect(res.body.nextClip).toBeTruthy();
    expect(res.body.nextClip.clipId).not.toBe(start.body.clip.clipId);
    void clip;
  });

  it('scores a wrong guess as 0 and leaves score unchanged', async () => {
    const app = buildApp();
    await createApprovedClip('S');
    await createApprovedClip('X');
    const guest = guestClient(app);

    const start = await guest.post('/api/blitz/start');
    const { rows } = await pool.query('SELECT rank FROM clips WHERE id = $1', [start.body.clip.clipId]);
    const actualRank = rows[0].rank;
    const wrongRank = actualRank === 'S' ? 'H' : 'S';

    const res = await guest.post(`/api/blitz/${start.body.runId}/guess`).send({ clipId: start.body.clip.clipId, rank: wrongRank });
    expect(res.status).toBe(201);
    expect(res.body.correct).toBe(false);
    expect(res.body.points).toBe(0);
    expect(res.body.score).toBe(0);

    // The wrong-guess penalty pulls expires_at 3s earlier than the run's original 90s window.
    const { rows: runRows } = await pool.query('SELECT started_at, expires_at FROM blitz_runs WHERE id = $1', [start.body.runId]);
    const startedAt = new Date(runRows[0].started_at).getTime();
    const expiresAt = new Date(runRows[0].expires_at).getTime();
    expect(expiresAt - startedAt).toBeLessThan(90_000);
  });

  it('returns 410 with a final summary once the run has expired, and marks it finished', async () => {
    const app = buildApp();
    await createApprovedClip('S');
    const guest = guestClient(app);

    const start = await guest.post('/api/blitz/start');
    await pool.query("UPDATE blitz_runs SET expires_at = now() - interval '1 hour' WHERE id = $1", [start.body.runId]);

    const res = await guest.post(`/api/blitz/${start.body.runId}/guess`).send({ clipId: start.body.clip.clipId, rank: 'S' });
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ runId: start.body.runId, score: 0, correctCount: 0, totalCount: 0 });
    expect(typeof res.body.finishedAt).toBe('string');

    const { rows } = await pool.query('SELECT status FROM blitz_runs WHERE id = $1', [start.body.runId]);
    expect(rows[0].status).toBe('finished');
  });
});

describe('GET /api/blitz/leaderboard', () => {
  async function insertFinishedRun(
    userId: number,
    opts: { score: number; correctCount?: number; totalCount?: number; bestStreak?: number; finishedAt?: Date },
  ) {
    const finishedAt = opts.finishedAt ?? new Date();
    await pool.query(
      `INSERT INTO blitz_runs (user_id, started_at, expires_at, status, score, correct_count, total_count, best_streak, finished_at)
       VALUES ($1, now(), now(), 'finished', $2, $3, $4, $5, $6)`,
      [userId, opts.score, opts.correctCount ?? 1, opts.totalCount ?? 1, opts.bestStreak ?? 1, finishedAt.toISOString()],
    );
  }

  it('shows only the best run per user, excludes guest runs, and respects the period filter', async () => {
    const app = buildApp();
    const alice = await createUser({ username: 'alice' });
    const bob = await createUser({ username: 'bob' });

    // Alice: two finished runs, only the higher score should surface.
    await insertFinishedRun(alice.id, { score: 500 });
    await insertFinishedRun(alice.id, { score: 900 });
    // Bob: one recent run, one very old run (excluded from 'today').
    await insertFinishedRun(bob.id, { score: 300 });
    const longAgo = new Date();
    longAgo.setFullYear(longAgo.getFullYear() - 2);
    await insertFinishedRun(bob.id, { score: 700, finishedAt: longAgo });
    // A guest run: no user_id, must never appear.
    await pool.query(
      `INSERT INTO blitz_runs (user_id, started_at, expires_at, status, score, correct_count, total_count, best_streak, finished_at)
       VALUES (NULL, now(), now(), 'finished', 9999, 5, 5, 5, now())`,
    );

    const all = await guestClient(app).get('/api/blitz/leaderboard?period=all');
    expect(all.status).toBe(200);
    const aliceEntries = all.body.entries.filter((e: { user: { id: number } }) => e.user.id === alice.id);
    expect(aliceEntries).toHaveLength(1);
    expect(aliceEntries[0].score).toBe(900);
    expect(all.body.entries.every((e: { user: { id: number } }) => e.user.id !== undefined)).toBe(true);
    expect(all.body.entries.some((e: { score: number }) => e.score === 9999)).toBe(false);

    const today = await guestClient(app).get('/api/blitz/leaderboard?period=today');
    const bobToday = today.body.entries.find((e: { user: { id: number } }) => e.user.id === bob.id);
    // Bob's best *today* is 300 -- the higher 700 score is 2 years old and excluded by the period filter.
    expect(bobToday?.score).toBe(300);
  });
});

describe('POST /api/blitz/:runId/finish', () => {
  it('is idempotent: calling twice returns the same summary and does not error', async () => {
    const app = buildApp();
    await createApprovedClip('S');
    const guest = guestClient(app);
    const start = await guest.post('/api/blitz/start');

    const first = await guest.post(`/api/blitz/${start.body.runId}/finish`);
    expect(first.status).toBe(200);

    const second = await guest.post(`/api/blitz/${start.body.runId}/finish`);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });
});

describe('GET /api/blitz/me/best', () => {
  it('requires auth', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/blitz/me/best');
    expect(res.status).toBe(401);
  });

  it('returns null when the signed-in user has no finished runs, and their best afterward', async () => {
    const app = buildApp();
    const { agent, userId } = await loginAs(app, 'player');

    const none = await agent.get('/api/blitz/me/best');
    expect(none.status).toBe(200);
    expect(none.body.best).toBeNull();

    await pool.query(
      `INSERT INTO blitz_runs (user_id, started_at, expires_at, status, score, correct_count, total_count, best_streak, finished_at)
       VALUES ($1, now(), now(), 'finished', 250, 2, 3, 2, now())`,
      [userId],
    );

    const some = await agent.get('/api/blitz/me/best');
    expect(some.status).toBe(200);
    expect(some.body.best.score).toBe(250);
  });
});
