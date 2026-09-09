import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../support/client.js';
import { createClip, createUser } from '../support/factories.js';
import { pool } from '../../src/db/pool.js';

// This whole suite runs with the integration config's fixed BOT_API_TOKEN (see
// vitest.integration.config.ts). The "disabled" (unset-token) path is covered separately in
// botDisabled.test.ts, which needs to reconfigure the app before importing it.
const TOKEN = process.env.BOT_API_TOKEN!;
const authed = (req: request.Test) => req.set('Authorization', `Bearer ${TOKEN}`);

describe('bot auth', () => {
  it('401s with no Authorization header', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/bot/daily');
    expect(res.status).toBe(401);
  });

  it('401s with the wrong token', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/bot/daily').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/bot/uploads/presign', () => {
  it('upserts the Discord user and reserves a clip row', async () => {
    const app = buildApp();
    const res = await authed(
      request(app)
        .post('/api/bot/uploads/presign')
        .send({
          discordId: 'discord-123',
          username: 'Zed',
          avatar: null,
          filename: 'clip.mp4',
          contentType: 'video/mp4',
          sizeBytes: 1000,
          rank: 'S',
        }),
    );
    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toContain('fake-s3.test');

    const { rows: users } = await pool.query('SELECT id FROM users WHERE discord_id = $1', ['discord-123']);
    expect(users).toHaveLength(1);

    const { rows: clips } = await pool.query('SELECT uploader_id, status FROM clips WHERE id = $1', [res.body.clipId]);
    expect(clips[0]).toEqual({ uploader_id: users[0].id, status: 'pending' });
  });

  it('re-presigning the same Discord user updates their profile, not a duplicate row', async () => {
    const app = buildApp();
    const send = (username: string) =>
      authed(
        request(app)
          .post('/api/bot/uploads/presign')
          .send({
            discordId: 'discord-repeat',
            username,
            avatar: null,
            filename: 'clip.mp4',
            contentType: 'video/mp4',
            sizeBytes: 1000,
            rank: 'A',
          }),
      );
    await send('First Name');
    await send('Second Name');

    const { rows } = await pool.query('SELECT username FROM users WHERE discord_id = $1', ['discord-repeat']);
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe('Second Name');
  });

  it('400s on an oversize file', async () => {
    const app = buildApp();
    const res = await authed(
      request(app)
        .post('/api/bot/uploads/presign')
        .send({
          discordId: 'discord-big',
          username: 'Big',
          filename: 'clip.mp4',
          contentType: 'video/mp4',
          sizeBytes: 51 * 1024 * 1024,
          rank: 'S',
        }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bot/uploads/:clipId/complete', () => {
  it('completes the clip when discordId matches the uploader', async () => {
    const app = buildApp();
    const user = await createUser({ discordId: 'discord-owner' });
    const clip = await createClip({ status: 'pending', uploadCompleted: false, uploaderId: user.id });

    const res = await authed(
      request(app).post(`/api/bot/uploads/${clip.id}/complete`).send({ discordId: 'discord-owner' }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clipId: clip.id, status: 'pending' });

    const { rows } = await pool.query('SELECT upload_completed FROM clips WHERE id = $1', [clip.id]);
    expect(rows[0].upload_completed).toBe(true);
  });

  it("404s when discordId is not the clip's uploader", async () => {
    const app = buildApp();
    const owner = await createUser({ discordId: 'discord-owner-2' });
    await createUser({ discordId: 'discord-stranger' });
    const clip = await createClip({ status: 'pending', uploadCompleted: false, uploaderId: owner.id });

    const res = await authed(
      request(app).post(`/api/bot/uploads/${clip.id}/complete`).send({ discordId: 'discord-stranger' }),
    );
    expect(res.status).toBe(404);
  });

  it('404s for a Discord id with no user row at all', async () => {
    const app = buildApp();
    const owner = await createUser({ discordId: 'discord-owner-3' });
    const clip = await createClip({ status: 'pending', uploadCompleted: false, uploaderId: owner.id });

    const res = await authed(
      request(app).post(`/api/bot/uploads/${clip.id}/complete`).send({ discordId: 'discord-unknown' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/bot/uploads', () => {
  it("returns the Discord user's own uploads", async () => {
    const app = buildApp();
    const user = await createUser({ discordId: 'discord-lister' });
    await createClip({ status: 'pending', uploaderId: user.id, uploadCompleted: true });
    await createClip({ status: 'approved', uploaderId: user.id, uploadCompleted: true });

    const res = await authed(request(app).get('/api/bot/uploads').query({ discordId: 'discord-lister' }));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns an empty list for a Discord id that has never submitted', async () => {
    const app = buildApp();
    const res = await authed(request(app).get('/api/bot/uploads').query({ discordId: 'discord-nobody' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/bot/daily', () => {
  it('returns date, number, playedCount and a link, without a clip or rank', async () => {
    const app = buildApp();
    const res = await authed(request(app).get('/api/bot/daily'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      number: expect.any(Number),
      playedCount: 0,
      url: expect.stringContaining('/daily'),
    });
    expect(res.body.clip).toBeUndefined();
    expect(res.body.rank).toBeUndefined();
  });
});
