import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createClip } from '../support/factories.js';
import { pool } from '../../src/db/pool.js';

describe("Who's that player", () => {
  it('upload suggestion -> admin verifies on approve -> playable and guessable', async () => {
    const app = buildApp();
    const uploader = await loginAs(app, 'player');
    const presign = await uploader.agent
      .post('/api/uploads/presign')
      .send({ filename: 'c.mp4', contentType: 'video/mp4', sizeBytes: 1000, rank: 'S', playerName: '  jstn  ' });
    expect(presign.status).toBe(201);
    const clipId = presign.body.clipId as string;
    await uploader.agent.post(`/api/uploads/${clipId}/complete`).expect(200);

    // Not playable until verified.
    await guestClient(app).get('/api/who/clips/random').expect(404);

    const admin = await loginAs(app, 'admin');
    const pending = await admin.agent.get('/api/admin/clips?status=pending').expect(200);
    expect(pending.body[0].submittedPlayer).toBe('jstn');
    expect(pending.body[0].player).toBeNull();

    const reviewed = await admin.agent
      .post(`/api/admin/clips/${clipId}/review`)
      .send({ status: 'approved', playerName: 'JSTN' })
      .expect(200);
    expect(reviewed.body.player.name).toBe('JSTN');

    // A second clip, verified under a differently-cased name, reuses the same player.
    const other = await createClip({ status: 'approved' });
    await admin.agent.patch(`/api/admin/clips/${other.id}`).send({ playerName: 'Garrett G' }).expect(200);
    const again = await createClip({ status: 'approved' });
    await admin.agent.patch(`/api/admin/clips/${again.id}`).send({ playerName: 'garrett g' }).expect(200);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM players');
    expect(rows[0].n).toBe(2);

    const players = (await guestClient(app).get('/api/who/players').expect(200)).body as Array<{ id: number; name: string }>;
    expect(players.map((p) => p.name)).toEqual(['Garrett G', 'JSTN']);
    const jstn = players.find((p) => p.name === 'JSTN')!;
    const garrett = players.find((p) => p.name === 'Garrett G')!;

    // Random clip never carries the answer.
    const random = await guestClient(app).get('/api/who/clips/random').expect(200);
    expect(JSON.stringify(random.body)).not.toMatch(/jstn|garrett/i);

    const wrong = await uploader.agent.post('/api/who/guesses').send({ clipId, playerId: garrett.id }).expect(201);
    expect(wrong.body).toMatchObject({ correct: false, actualPlayer: { name: 'JSTN' }, actualRank: 'S', counted: true, run: { current: 0 } });

    const right = await admin.agent.post('/api/who/guesses').send({ clipId, playerId: jstn.id }).expect(201);
    expect(right.body).toMatchObject({ correct: true, totalGuesses: 2, accuracy: 50, run: { current: 1, best: 1 } });

    const repeat = await admin.agent.post('/api/who/guesses').send({ clipId, playerId: jstn.id }).expect(201);
    expect(repeat.body).toMatchObject({ counted: false, run: { current: 1 } });

    // Clearing the player pulls the clip out of the mode.
    await admin.agent.patch(`/api/admin/clips/${clipId}`).send({ playerName: null }).expect(200);
    await guestClient(app).post('/api/who/guesses').send({ clipId, playerId: jstn.id }).expect(404);

    const mine = await uploader.agent.get('/api/uploads/mine').expect(200);
    expect(mine.body[0].player).toBe('jstn');
  });
});
