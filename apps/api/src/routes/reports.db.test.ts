import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Rank } from '@6mansdle/shared';

// Playback URLs normally come from S3; give every clip a fake one instead.
vi.mock('../services/storage.js', () => ({
  playbackUrl: async (key: string) => `https://example.test/${key}`,
  deleteObject: async () => {},
  presignUpload: async () => ({ url: 'https://example.test/upload', headers: {} }),
  headObject: async () => null,
  clipKey: (id: string) => `clips/${id}.mp4`,
  ALLOWED_VIDEO_TYPES: { 'video/mp4': 'mp4' },
}));

const { gameRouter } = await import('./game.js');
const { adminRouter } = await import('./admin.js');
const { pool } = await import('../db/pool.js');
const { HttpError } = await import('../lib/errors.js');
const { ZodError } = await import('zod');

interface TestUser {
  id: number;
  discord_id: string;
  username: string;
  avatar_hash: string | null;
  is_admin: boolean;
}

/** A tiny Express app wired the same as production, but with req.user forced to a fixed value. */
function appAs(user: TestUser | null) {
  const app = express();
  app.set('trust proxy', 1); // matches app.ts; lets a per-user X-Forwarded-For give each caller its own rate-limit bucket
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) req.user = user;
    next();
  });
  app.use('/api', gameRouter);
  app.use('/api/admin', adminRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    if (err instanceof ZodError) return void res.status(400).json({ error: 'Validation failed' });
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  });
  return app;
}

let nextIp = 1;
/**
 * express-rate-limit buckets by IP, and every request in this file otherwise shares one
 * (supertest always calls from the same loopback address). Give each caller a distinct fake
 * X-Forwarded-For so tests don't trip each other's report-endpoint limiter.
 */
function reqAs(user: TestUser | null) {
  nextIp += 1;
  const ip = `10.0.${(nextIp >> 8) & 0xff}.${nextIp & 0xff}`;
  const agent = request(appAs(user));
  return {
    get: (path: string) => agent.get(path).set('X-Forwarded-For', ip),
    post: (path: string) => agent.post(path).set('X-Forwarded-For', ip),
  };
}

let nextUserSeq = 0;
async function makeUser(isAdmin = false): Promise<TestUser> {
  nextUserSeq += 1;
  const { rows } = await pool.query<TestUser>(
    `INSERT INTO users (discord_id, username, is_admin) VALUES ($1, $2, $3)
     RETURNING id, discord_id, username, avatar_hash, is_admin`,
    [`disc-${nextUserSeq}-${randomUUID()}`, `user${nextUserSeq}`, isAdmin],
  );
  return rows[0]!;
}

async function makeClip(rank: Rank = 'A'): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO clips (id, s3_key, rank, status, original_filename, content_type, size_bytes, upload_completed)
     VALUES ($1, $2, $3, 'approved', 'clip.mp4', 'video/mp4', 1000, TRUE)`,
    [id, `clips/${id}.mp4`, rank],
  );
  return id;
}

async function recordGuess(clipId: string, userId: number): Promise<void> {
  await pool.query(
    `INSERT INTO guesses (clip_id, user_id, mode, guessed_rank, actual_rank, is_correct)
     VALUES ($1, $2, 'endless', 'A', 'A', TRUE)`,
    [clipId, userId],
  );
}

async function clipRow(id: string): Promise<{ rank: Rank; status: string; hidden: boolean }> {
  const { rows } = await pool.query('SELECT rank, status, hidden FROM clips WHERE id = $1', [id]);
  return rows[0];
}

afterAll(async () => {
  await pool.end();
});

describe('POST /api/clips/:id/report', () => {
  let clip: string;
  let reporter: TestUser;

  beforeAll(async () => {
    clip = await makeClip();
    reporter = await makeUser();
  });

  it('requires auth', async () => {
    const res = await reqAs(null).post(`/api/clips/${clip}/report`).send({ reason: 'wrong_rank' });
    expect(res.status).toBe(401);
  });

  it('requires a prior guess on the clip', async () => {
    const res = await reqAs(reporter).post(`/api/clips/${clip}/report`).send({ reason: 'wrong_rank' });
    expect(res.status).toBe(403);
  });

  it('succeeds once the user has guessed, and rejects a second open report as a duplicate', async () => {
    await recordGuess(clip, reporter.id);

    const first = await reqAs(reporter).post(`/api/clips/${clip}/report`).send({ reason: 'wrong_rank', suggestedRank: 'B' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ clipId: clip, reason: 'wrong_rank', suggestedRank: 'B', status: 'open' });

    const dup = await reqAs(reporter).post(`/api/clips/${clip}/report`).send({ reason: 'other' });
    expect(dup.status).toBe(409);
  });
});

describe('auto-hide safeguard', () => {
  it('hides a clip once 3 distinct users have an open report, and random selection then excludes it', async () => {
    const hiddenTarget = await makeClip('B');
    const alwaysVisible = await makeClip('C');
    const reporters = await Promise.all([makeUser(), makeUser(), makeUser()]);

    for (const [i, user] of reporters.entries()) {
      await recordGuess(hiddenTarget, user.id);
      const res = await reqAs(user)
        .post(`/api/clips/${hiddenTarget}/report`)
        .send({ reason: 'bad_quality' });
      expect(res.status).toBe(201);
      const row = await clipRow(hiddenTarget);
      // Hidden only once the 3rd distinct reporter lands.
      expect(row.hidden).toBe(i === reporters.length - 1);
    }

    // Other approved clips exist from earlier tests in this file, so just assert the hidden one
    // is never returned -- and, excluding it, confirm the still-visible one remains pickable.
    const { pickRandomApprovedClip } = await import('../services/clips.js');
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const picked = await pickRandomApprovedClip();
      expect(picked.id).not.toBe(hiddenTarget);
      seen.add(picked.id);
    }
    expect(seen.has(alwaysVisible)).toBe(true);
  });
});

describe('GET /api/admin/reports and resolve', () => {
  it('rejects a non-admin caller', async () => {
    const user = await makeUser(false);
    const res = await reqAs(user).get('/api/admin/reports?status=open');
    expect(res.status).toBe(403);
  });

  it('fix_rank changes the clip rank and closes every open report on that clip', async () => {
    const admin = await makeUser(true);
    const clip = await makeClip('D');
    const [u1, u2] = await Promise.all([makeUser(), makeUser()]);
    await recordGuess(clip, u1.id);
    await recordGuess(clip, u2.id);

    const r1 = await reqAs(u1).post(`/api/clips/${clip}/report`).send({ reason: 'wrong_rank', suggestedRank: 'E' });
    const r2 = await reqAs(u2).post(`/api/clips/${clip}/report`).send({ reason: 'other' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    const list = await reqAs(admin).get('/api/admin/reports?status=open');
    expect(list.status).toBe(200);
    const clipReports = list.body.filter((r: { clip: { id: string } }) => r.clip.id === clip);
    expect(clipReports).toHaveLength(2);

    const resolve = await reqAs(admin)
      .post(`/api/admin/reports/${r1.body.id}/resolve`)
      .send({ action: 'fix_rank', rank: 'E' });
    expect(resolve.status).toBe(200);
    expect(resolve.body).toMatchObject({ clipId: clip, resolvedCount: 2 });

    const row = await clipRow(clip);
    expect(row.rank).toBe('E');

    const remaining = await reqAs(admin).get('/api/admin/reports?status=open');
    expect(remaining.body.some((r: { clip: { id: string } }) => r.clip.id === clip)).toBe(false);
  });

  it('dismiss clears the hidden flag', async () => {
    const admin = await makeUser(true);
    const clip = await makeClip('S');
    const reporters = await Promise.all([makeUser(), makeUser(), makeUser()]);
    let reportId = -1;
    for (const user of reporters) {
      await recordGuess(clip, user.id);
      const res = await reqAs(user).post(`/api/clips/${clip}/report`).send({ reason: 'not_6mans' });
      reportId = res.body.id;
    }
    expect((await clipRow(clip)).hidden).toBe(true);

    const resolve = await reqAs(admin).post(`/api/admin/reports/${reportId}/resolve`).send({ action: 'dismiss' });
    expect(resolve.status).toBe(200);
    expect(resolve.body.resolvedCount).toBe(3);
    expect((await clipRow(clip)).hidden).toBe(false);
  });
});
