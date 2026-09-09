import { describe, expect, it } from 'vitest';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createClip, createUser } from '../support/factories.js';
import { pool } from '../../src/db/pool.js';

describe('GET /api/admin/dashboard auth', () => {
  it('requires auth', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin caller', async () => {
    const app = buildApp();
    const { agent } = await loginAs(app, 'player');
    const res = await agent.get('/api/admin/dashboard');
    expect(res.status).toBe(403);
  });
});

/** Records a counted guess at a specific instant, so guesses-per-day and the rolling windows are testable. */
async function guessAt(clipId: string, rank: string, correct: boolean, when: Date): Promise<void> {
  await pool.query(
    `INSERT INTO guesses (clip_id, mode, guessed_rank, actual_rank, is_correct, counted, created_at)
     VALUES ($1, 'endless', $2, $3, $4, TRUE, $5)`,
    [clipId, correct ? rank : 'H', rank, correct, when],
  );
}

describe('GET /api/admin/dashboard shape and content', () => {
  it('returns counts, a 30-entry UTC series, top uploaders, and attention/never-played clips', async () => {
    const app = buildApp();
    const admin = await loginAs(app, 'admin');
    const uploader = await createUser({ username: 'clipmaster' });
    const uploader2 = await createUser({ username: 'occasional' });
    // An inactive user pulls usersActive7d below usersTotal.
    const inactive = await createUser({ username: 'ghost' });
    await pool.query("UPDATE users SET last_seen_at = now() - interval '10 days' WHERE id = $1", [inactive.id]);

    // Clip mix: 2 pending, 4 approved (one hidden), 1 rejected.
    await createClip({ status: 'pending', uploaderId: uploader.id });
    await createClip({ status: 'pending', uploaderId: uploader.id });
    await createClip({ status: 'rejected', uploaderId: uploader.id });
    const hiddenClip = await createClip({ status: 'approved', uploaderId: uploader.id });
    await pool.query('UPDATE clips SET hidden = TRUE WHERE id = $1', [hiddenClip.id]);

    // clipA: mislabeled candidate -- 25 guesses today, only 2 correct (8% accuracy).
    const clipA = await createClip({ status: 'approved', rank: 'B', uploaderId: uploader.id });
    const now = new Date();
    for (let i = 0; i < 25; i++) {
      await guessAt(clipA.id, 'B', i < 2, now);
    }

    // clipC: healthy clip, 5 correct guesses today.
    const clipC = await createClip({ status: 'approved', rank: 'S', uploaderId: uploader.id });
    for (let i = 0; i < 5; i++) {
      await guessAt(clipC.id, 'S', true, now);
    }

    // clipB: approved but never played, owned by a different uploader.
    const clipB = await createClip({ status: 'approved', rank: 'A', uploaderId: uploader2.id });

    // Rolling-window coverage: one guess 3 days ago, one 20 days ago, one 40 days ago (outside every window).
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    await guessAt(clipC.id, 'S', true, threeDaysAgo);
    await guessAt(clipC.id, 'S', true, twentyDaysAgo);
    await guessAt(clipC.id, 'S', true, fortyDaysAgo);

    // One open report so openReports > 0.
    await pool.query(
      `INSERT INTO clip_reports (clip_id, user_id, reason, status) VALUES ($1, $2, 'wrong_rank', 'open')`,
      [clipC.id, uploader2.id],
    );

    const res = await admin.agent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    const body = res.body;

    expect(body.counts).toMatchObject({
      pendingClips: 2,
      approvedClips: 4,
      rejectedClips: 1,
      hiddenClips: 1,
      openReports: 1,
      usersTotal: 4, // admin + uploader + uploader2 + inactive
      usersActive7d: 3,
      guessesToday: 30, // 25 (clipA) + 5 (clipC)
      guesses7d: 31, // + 1 three-days-ago
      guesses30d: 32, // + 1 twenty-days-ago (forty-days-ago stays excluded)
    });

    expect(body.series).toHaveLength(30);
    const todayKey = now.toISOString().slice(0, 10);
    const today = body.series[body.series.length - 1];
    expect(today.date).toBe(todayKey);
    expect(today.guesses).toBe(30);
    expect(today.newUsers).toBe(4);

    const threeDaysAgoKey = threeDaysAgo.toISOString().slice(0, 10);
    if (threeDaysAgoKey !== todayKey) {
      const entry = body.series.find((p: { date: string }) => p.date === threeDaysAgoKey);
      expect(entry?.guesses).toBe(1);
    }

    const uploaders = body.topUploaders as Array<{ username: string; approvedCount: number }>;
    expect(uploaders.find((u) => u.username === 'clipmaster')?.approvedCount).toBe(3); // clipA, clipC, hiddenClip
    expect(uploaders.find((u) => u.username === 'occasional')?.approvedCount).toBe(1); // clipB

    const attention = body.attentionClips as Array<{ id: string; accuracy: number; guesses: number }>;
    const flagged = attention.find((c) => c.id === clipA.id);
    expect(flagged).toBeTruthy();
    expect(flagged!.guesses).toBe(25);
    expect(flagged!.accuracy).toBe(8);
    expect(attention.some((c) => c.id === clipC.id)).toBe(false); // clipC's accuracy is well above the threshold

    const neverPlayed = body.neverPlayedClips as Array<{ id: string }>;
    expect(neverPlayed.some((c) => c.id === clipB.id)).toBe(true);
    expect(neverPlayed.some((c) => c.id === clipA.id)).toBe(false);
  });
});
