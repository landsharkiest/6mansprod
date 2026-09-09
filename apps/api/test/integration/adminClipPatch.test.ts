import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createClip } from '../support/factories.js';
import { pool } from '../../src/db/pool.js';

describe('PATCH /api/admin/clips/:id', () => {
  it('requires auth', async () => {
    const app = buildApp();
    const clip = await createClip({ status: 'approved' });
    const res = await guestClient(app).patch(`/api/admin/clips/${clip.id}`).send({ rank: 'S' });
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin caller', async () => {
    const app = buildApp();
    const clip = await createClip({ status: 'approved' });
    const { agent } = await loginAs(app, 'player');
    const res = await agent.patch(`/api/admin/clips/${clip.id}`).send({ rank: 'S' });
    expect(res.status).toBe(403);
  });

  it('fixes the rank without touching status or hidden', async () => {
    const app = buildApp();
    const clip = await createClip({ status: 'approved', rank: 'C' });
    const { agent } = await loginAs(app, 'admin');

    const res = await agent.patch(`/api/admin/clips/${clip.id}`).send({ rank: 'S' });
    expect(res.status).toBe(200);
    expect(res.body.rank).toBe('S');
    expect(res.body.status).toBe('approved');

    const { rows } = await pool.query('SELECT rank, status, hidden FROM clips WHERE id = $1', [clip.id]);
    expect(rows[0]).toEqual({ rank: 'S', status: 'approved', hidden: false });
  });

  it('toggles hidden independently of rank', async () => {
    const app = buildApp();
    const clip = await createClip({ status: 'approved', rank: 'A' });
    const { agent } = await loginAs(app, 'admin');

    const hide = await agent.patch(`/api/admin/clips/${clip.id}`).send({ hidden: true });
    expect(hide.status).toBe(200);
    expect(hide.body.hidden).toBe(true);
    expect(hide.body.rank).toBe('A');

    const unhide = await agent.patch(`/api/admin/clips/${clip.id}`).send({ hidden: false });
    expect(unhide.status).toBe(200);
    expect(unhide.body.hidden).toBe(false);
  });

  it('400s when neither rank nor hidden is provided', async () => {
    const app = buildApp();
    const clip = await createClip({ status: 'approved' });
    const { agent } = await loginAs(app, 'admin');
    const res = await agent.patch(`/api/admin/clips/${clip.id}`).send({});
    expect(res.status).toBe(400);
  });

  it('404s for an unknown clip', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app, 'admin');
    const res = await agent.patch('/api/admin/clips/00000000-0000-0000-0000-000000000000').send({ rank: 'S' });
    expect(res.status).toBe(404);
  });
});
