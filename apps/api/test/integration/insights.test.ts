import { describe, expect, it } from 'vitest';
import { INSIGHTS_WEEKS, RANKS, type Rank } from '@6mansdle/shared';
import { buildApp, guestClient, loginAs } from '../support/client.js';
import { createApprovedClip } from '../support/factories.js';

/** Plays `rank` clips of the given rank, guessing `guessAs` each time. */
async function playGuesses(agent: ReturnType<typeof guestClient>, rounds: Array<{ actual: Rank; guess: Rank }>) {
  for (const { actual, guess } of rounds) {
    const clip = await createApprovedClip(actual);
    await agent.post('/api/guesses').send({ clipId: clip.id, rank: guess, mode: 'endless' });
  }
}

describe('GET /api/users/:id/insights', () => {
  it('404s for an unknown id', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/users/999999/insights');
    expect(res.status).toBe(404);
  });

  it('returns locked with the number of guesses still needed below the threshold', async () => {
    const app = buildApp();
    const { agent, userId } = await loginAs(app);
    await playGuesses(agent, [
      { actual: 'S', guess: 'S' },
      { actual: 'X', guess: 'X' },
      { actual: 'A', guess: 'A' },
    ]);

    const res = await guestClient(app).get(`/api/users/${userId}/insights`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locked: true, needed: 7 });
  });

  it('is locked at 0 guesses with needed equal to the full threshold', async () => {
    const app = buildApp();
    const { userId } = await loginAs(app);
    const res = await guestClient(app).get(`/api/users/${userId}/insights`);
    expect(res.body).toEqual({ locked: true, needed: 10 });
  });

  it('unlocks at the threshold and returns full shapes', async () => {
    const app = buildApp();
    const { agent, userId } = await loginAs(app);

    // 10 counted guesses: 7 correct S guesses (a strength), 3 wrong A guesses (a blind spot,
    // most commonly guessed as B).
    await playGuesses(agent, [
      { actual: 'S', guess: 'S' },
      { actual: 'S', guess: 'S' },
      { actual: 'S', guess: 'S' },
      { actual: 'S', guess: 'S' },
      { actual: 'S', guess: 'S' },
      { actual: 'A', guess: 'B' },
      { actual: 'A', guess: 'B' },
      { actual: 'A', guess: 'X' },
      { actual: 'X', guess: 'X' },
      { actual: 'X', guess: 'X' },
    ]);

    const res = await guestClient(app).get(`/api/users/${userId}/insights`);
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);

    expect(res.body.totals).toEqual({ guesses: 10, correct: 7, accuracy: 70 });

    // Weekly buckets: exactly INSIGHTS_WEEKS entries, ascending weekStart, current week last.
    expect(res.body.accuracyOverTime).toHaveLength(INSIGHTS_WEEKS);
    const weekStarts = res.body.accuracyOverTime.map((b: { weekStart: string }) => b.weekStart);
    const sorted = [...weekStarts].sort();
    expect(weekStarts).toEqual(sorted);
    const currentWeek = res.body.accuracyOverTime[INSIGHTS_WEEKS - 1];
    expect(currentWeek.guesses).toBe(10);
    expect(currentWeek.correct).toBe(7);

    // Personal confusion: full 9x9 grid.
    expect(res.body.personalConfusion).toHaveLength(RANKS.length * RANKS.length);
    const sCell = res.body.personalConfusion.find((c: { actualRank: string; guessedRank: string }) => c.actualRank === 'S' && c.guessedRank === 'S');
    expect(sCell.count).toBe(5);

    // Blind spots: A is the only rank with wrong guesses, most common wrong guess is B.
    expect(res.body.blindSpots).toHaveLength(1);
    expect(res.body.blindSpots[0]).toMatchObject({
      actualRank: 'A',
      totalGuesses: 3,
      correctGuesses: 0,
      mostCommonWrongGuess: 'B',
      mostCommonWrongGuessCount: 2,
    });

    // Strengths: S (100%, 5 guesses) and X (100%, 2 guesses is below the min-5 threshold so excluded).
    expect(res.body.strengths.map((s: { rank: string }) => s.rank)).toEqual(['S']);

    // Bias: overall should be negative (guessed worse than truth on the A round).
    expect(typeof res.body.bias.overall).toBe('number');
    expect(res.body.bias.overall).toBeLessThan(0);
    expect(Array.isArray(res.body.bias.perRank)).toBe(true);

    // vsCommunity: one entry per rank, community accuracy reflects the same guesses (this user is
    // the whole community here).
    expect(res.body.vsCommunity).toHaveLength(RANKS.length);
    const sVsCommunity = res.body.vsCommunity.find((v: { rank: string }) => v.rank === 'S');
    expect(sVsCommunity.userAccuracy).toBe(100);
    expect(sVsCommunity.communityAccuracy).toBe(100);
    // This user is the whole community, so overall community accuracy equals their own.
    expect(res.body.communityAccuracy).toBe(70);
    const dVsCommunity = res.body.vsCommunity.find((v: { rank: string }) => v.rank === 'D');
    expect(dVsCommunity.userAccuracy).toBeNull();
  });

  it('only counts a signed-in user\'s first guess on a given clip toward totals', async () => {
    const app = buildApp();
    const { agent, userId } = await loginAs(app);
    const rounds = Array.from({ length: 9 }, () => ({ actual: 'S' as const, guess: 'S' as const }));
    await playGuesses(agent, rounds);

    // A 10th, fresh clip to cross the unlock threshold.
    const clip = await createApprovedClip('S');
    await agent.post('/api/guesses').send({ clipId: clip.id, rank: 'S', mode: 'endless' });

    // Re-guess that same clip: stored, but not counted.
    await agent.post('/api/guesses').send({ clipId: clip.id, rank: 'H', mode: 'endless' });

    const res = await guestClient(app).get(`/api/users/${userId}/insights`);
    expect(res.body.locked).toBe(false);
    expect(res.body.totals.guesses).toBe(10);
    // The uncounted wrong H guess must not show up in the confusion matrix.
    const hCell = res.body.personalConfusion.find((c: { actualRank: string; guessedRank: string }) => c.actualRank === 'S' && c.guessedRank === 'H');
    expect(hCell.count).toBe(0);
  });
});
