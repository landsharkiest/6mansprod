import { describe, expect, it, vi } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createClip } from '../support/factories.js';
import { headObject } from '../../src/services/storage.js';
import { pool } from '../../src/db/pool.js';

describe('POST /api/uploads/presign', () => {
  it('requires auth', async () => {
    const app = buildApp();
    const res = await guestClient(app)
      .post('/api/uploads/presign')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4', sizeBytes: 1000, rank: 'S' });
    expect(res.status).toBe(401);
  });

  it('rejects an oversize file', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app);
    // MAX_UPLOAD_MB default is 50.
    const res = await agent
      .post('/api/uploads/presign')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4', sizeBytes: 51 * 1024 * 1024, rank: 'S' });
    expect(res.status).toBe(400);
  });

  it('rejects an unsupported content type', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app);
    const res = await agent
      .post('/api/uploads/presign')
      .send({ filename: 'clip.exe', contentType: 'application/x-msdownload', sizeBytes: 1000, rank: 'S' });
    expect(res.status).toBe(400);
  });

  it('reserves a clip row and returns a presigned URL for a valid request', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app);
    const res = await agent
      .post('/api/uploads/presign')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4', sizeBytes: 1000, rank: 'S' });
    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toContain('fake-s3.test');
    const { rows } = await pool.query('SELECT status, upload_completed FROM clips WHERE id = $1', [res.body.clipId]);
    expect(rows[0]).toEqual({ status: 'pending', upload_completed: false });
  });
});

describe('POST /api/uploads/:clipId/complete', () => {
  it('marks upload_completed using the mocked headObject size', async () => {
    const app = buildApp();
    const { agent, userId } = await loginAs(app);
    const clip = await createClip({ status: 'pending', uploadCompleted: false, uploaderId: userId });

    const res = await agent.post(`/api/uploads/${clip.id}/complete`);
    expect(res.status).toBe(200);
    const { rows } = await pool.query('SELECT upload_completed, size_bytes FROM clips WHERE id = $1', [clip.id]);
    expect(rows[0].upload_completed).toBe(true);
    expect(rows[0].size_bytes).toBe(1234); // from the storage mock's default headObject
  });

  it('400s when the object was never uploaded (headObject returns null)', async () => {
    const app = buildApp();
    const { agent, userId } = await loginAs(app);
    const clip = await createClip({ status: 'pending', uploadCompleted: false, uploaderId: userId });
    vi.mocked(headObject).mockResolvedValueOnce(null);

    const res = await agent.post(`/api/uploads/${clip.id}/complete`);
    expect(res.status).toBe(400);
  });

  it('404s for an upload that is not the caller\'s', async () => {
    const app = buildApp();
    const owner = await loginAs(app, 'player');
    const clip = await createClip({ status: 'pending', uploadCompleted: false, uploaderId: owner.userId });

    // dev-login "admin" upserts a distinct user (dev-admin), so it doubles as "a different signed-in user".
    const stranger = await loginAs(app, 'admin');
    const res = await stranger.agent.post(`/api/uploads/${clip.id}/complete`);
    expect(res.status).toBe(404);
  });
});

describe('admin review', () => {
  it('non-admin gets 403', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app, 'player');
    const res = await agent.get('/api/admin/clips');
    expect(res.status).toBe(403);
  });

  it('guest gets 401', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/admin/clips');
    expect(res.status).toBe(401);
  });

  it('approves a clip with a rank correction', async () => {
    const app = buildApp();
    const clip = await createClip({ status: 'pending', rank: 'B' });
    const { agent } = await loginAs(app, 'admin');

    const res = await agent.post(`/api/admin/clips/${clip.id}/review`).send({ status: 'approved', rank: 'S' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.rank).toBe('S');

    const { rows } = await pool.query('SELECT status, rank FROM clips WHERE id = $1', [clip.id]);
    expect(rows[0]).toEqual({ status: 'approved', rank: 'S' });
  });

  it('rejects a clip and lists it under status=rejected', async () => {
    const app = buildApp();
    const clip = await createClip({ status: 'pending' });
    const { agent } = await loginAs(app, 'admin');

    const review = await agent.post(`/api/admin/clips/${clip.id}/review`).send({ status: 'rejected' });
    expect(review.status).toBe(200);

    const list = await agent.get('/api/admin/clips?status=rejected');
    expect(list.body.map((c: { id: string }) => c.id)).toContain(clip.id);
  });

  it('includes each clip\'s uploader approved/rejected counts, for spotting spam', async () => {
    const app = buildApp();
    const uploaderRes = await loginAs(app, 'player');
    const { agent: adminAgent } = await loginAs(app, 'admin');

    await createClip({ status: 'approved', uploaderId: uploaderRes.userId });
    await createClip({ status: 'rejected', uploaderId: uploaderRes.userId });
    const pending = await createClip({ status: 'pending', uploaderId: uploaderRes.userId });

    const list = await adminAgent.get(`/api/admin/clips?status=pending`);
    expect(list.status).toBe(200);
    const row = list.body.find((c: { id: string }) => c.id === pending.id);
    expect(row.uploaderStats).toEqual({ approved: 1, rejected: 1 });
  });

  it('deletes a rejected clip', async () => {
    const app = buildApp();
    const clip = await createClip({ status: 'rejected' });
    const { agent } = await loginAs(app, 'admin');
    const res = await agent.delete(`/api/admin/clips/${clip.id}`);
    expect(res.status).toBe(204);
    const { rows } = await pool.query('SELECT 1 FROM clips WHERE id = $1', [clip.id]);
    expect(rows).toHaveLength(0);
  });
});
