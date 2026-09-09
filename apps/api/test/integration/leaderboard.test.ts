import { describe, expect, it } from 'vitest';
import { buildApp, guestClient } from '../support/client.js';
import { createUser } from '../support/factories.js';
import { pool } from '../../src/db/pool.js';

async function setDailyStats(
  userId: number,
  stats: { currentStreak: number; bestStreak: number; lastPlayed: string; played: number; correct: number },
) {
  await pool.query(
    `INSERT INTO user_daily_stats (user_id, current_streak, best_streak, last_played, played, correct)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, stats.currentStreak, stats.bestStreak, stats.lastPlayed, stats.played, stats.correct],
  );
}

async function setEndlessStats(userId: number, stats: { currentRun: number; bestRun: number; played: number; correct: number }) {
  await pool.query(
    `INSERT INTO user_endless_stats (user_id, current_run, best_run, played, correct)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, stats.currentRun, stats.bestRun, stats.played, stats.correct],
  );
}

describe('GET /api/stats/leaderboard — daily mode', () => {
  it('sorts by streak, current desc then best desc then correct desc, deterministically', async () => {
    const app = buildApp();
    const today = new Date().toISOString().slice(0, 10);
    const low = await createUser({ username: 'low' });
    const high = await createUser({ username: 'high' });
    const tieA = await createUser({ username: 'tieA' });
    const tieB = await createUser({ username: 'tieB' });
    await setDailyStats(low.id, { currentStreak: 1, bestStreak: 1, lastPlayed: today, played: 1, correct: 1 });
    await setDailyStats(high.id, { currentStreak: 5, bestStreak: 5, lastPlayed: today, played: 5, correct: 5 });
    await setDailyStats(tieA.id, { currentStreak: 2, bestStreak: 2, lastPlayed: today, played: 2, correct: 2 });
    await setDailyStats(tieB.id, { currentStreak: 2, bestStreak: 2, lastPlayed: today, played: 3, correct: 3 });

    const res = await guestClient(app).get('/api/stats/leaderboard?mode=daily&sort=streak');
    expect(res.status).toBe(200);
    const ids = res.body.entries.map((e: { user: { id: number } }) => e.user.id);
    // high (5) > tieB (2, correct 3) > tieA (2, correct 2) > low (1)
    expect(ids).toEqual([high.id, tieB.id, tieA.id, low.id]);
  });

  it('sorts by accuracy and enforces the minimum-plays threshold (5 for daily)', async () => {
    const app = buildApp();
    const today = new Date().toISOString().slice(0, 10);
    const perfectButFewPlays = await createUser({ username: 'lucky' });
    const solidVolume = await createUser({ username: 'grinder' });
    await setDailyStats(perfectButFewPlays.id, { currentStreak: 1, bestStreak: 1, lastPlayed: today, played: 1, correct: 1 });
    await setDailyStats(solidVolume.id, { currentStreak: 1, bestStreak: 1, lastPlayed: today, played: 5, correct: 4 });

    const res = await guestClient(app).get('/api/stats/leaderboard?mode=daily&sort=accuracy');
    expect(res.status).toBe(200);
    const ids = res.body.entries.map((e: { user: { id: number } }) => e.user.id);
    expect(ids).toEqual([solidVolume.id]); // the 1-play 100% user is excluded
    expect(res.body.minPlaysForAccuracy).toBe(5);
  });
});

describe('GET /api/stats/leaderboard — endless mode', () => {
  it('enforces the minimum-plays threshold (20 for endless) on the accuracy sort', async () => {
    const app = buildApp();
    const under = await createUser({ username: 'under' });
    const over = await createUser({ username: 'over' });
    await setEndlessStats(under.id, { currentRun: 3, bestRun: 3, played: 19, correct: 19 });
    await setEndlessStats(over.id, { currentRun: 1, bestRun: 1, played: 20, correct: 15 });

    const res = await guestClient(app).get('/api/stats/leaderboard?mode=endless&sort=accuracy');
    expect(res.status).toBe(200);
    const ids = res.body.entries.map((e: { user: { id: number } }) => e.user.id);
    expect(ids).toEqual([over.id]);
    expect(res.body.minPlaysForAccuracy).toBe(20);
  });

  it('sorts by best run', async () => {
    const app = buildApp();
    const a = await createUser({ username: 'a' });
    const b = await createUser({ username: 'b' });
    await setEndlessStats(a.id, { currentRun: 1, bestRun: 10, played: 10, correct: 10 });
    await setEndlessStats(b.id, { currentRun: 8, bestRun: 8, played: 10, correct: 10 });

    const res = await guestClient(app).get('/api/stats/leaderboard?mode=endless&sort=best');
    const ids = res.body.entries.map((e: { user: { id: number } }) => e.user.id);
    expect(ids).toEqual([a.id, b.id]);
  });

  it('sorts by played', async () => {
    const app = buildApp();
    const a = await createUser({ username: 'a' });
    const b = await createUser({ username: 'b' });
    await setEndlessStats(a.id, { currentRun: 1, bestRun: 1, played: 30, correct: 10 });
    await setEndlessStats(b.id, { currentRun: 1, bestRun: 1, played: 50, correct: 10 });

    const res = await guestClient(app).get('/api/stats/leaderboard?mode=endless&sort=played');
    const ids = res.body.entries.map((e: { user: { id: number } }) => e.user.id);
    expect(ids).toEqual([b.id, a.id]);
  });
});
