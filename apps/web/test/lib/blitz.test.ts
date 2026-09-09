import { describe, expect, it } from 'vitest';
import { applyGuessDelta, INITIAL_BLITZ_STATE, isRunOver, msUntilEnds, secondsRemaining } from '../../src/lib/blitz';

describe('msUntilEnds', () => {
  it('counts down to endsAt', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    const endsAt = new Date('2026-09-08T12:01:30Z').toISOString();
    expect(msUntilEnds(endsAt, now)).toBe(90_000);
  });

  it('never returns a negative value once past endsAt', () => {
    const now = new Date('2026-09-08T12:02:00Z');
    const endsAt = new Date('2026-09-08T12:01:30Z').toISOString();
    expect(msUntilEnds(endsAt, now)).toBe(0);
  });
});

describe('isRunOver', () => {
  it('is false before endsAt', () => {
    const endsAt = new Date('2026-09-08T12:01:30Z').toISOString();
    expect(isRunOver(endsAt, new Date('2026-09-08T12:00:00Z'))).toBe(false);
  });

  it('is true at exactly endsAt', () => {
    const endsAt = new Date('2026-09-08T12:01:30Z').toISOString();
    expect(isRunOver(endsAt, new Date('2026-09-08T12:01:30Z'))).toBe(true);
  });

  it('is true after endsAt', () => {
    const endsAt = new Date('2026-09-08T12:01:30Z').toISOString();
    expect(isRunOver(endsAt, new Date('2026-09-08T12:05:00Z'))).toBe(true);
  });
});

describe('secondsRemaining', () => {
  it('rounds up partial seconds so the display never shows 0 while time remains', () => {
    expect(secondsRemaining(500)).toBe(1);
    expect(secondsRemaining(1000)).toBe(1);
    expect(secondsRemaining(1001)).toBe(2);
    expect(secondsRemaining(0)).toBe(0);
  });
});

describe('applyGuessDelta', () => {
  it('starts from all zeros', () => {
    expect(INITIAL_BLITZ_STATE).toEqual({ score: 0, correctCount: 0, totalCount: 0, currentStreak: 0, bestStreak: 0 });
  });

  it('adopts the server-reported totals from a guess response', () => {
    const next = applyGuessDelta(INITIAL_BLITZ_STATE, {
      score: 140,
      correctCount: 1,
      totalCount: 1,
      currentStreak: 1,
      bestStreak: 1,
    });
    expect(next).toEqual({ score: 140, correctCount: 1, totalCount: 1, currentStreak: 1, bestStreak: 1 });
  });

  it('accumulates across a sequence of guesses (correct, correct, wrong)', () => {
    let state = INITIAL_BLITZ_STATE;
    state = applyGuessDelta(state, { score: 140, correctCount: 1, totalCount: 1, currentStreak: 1, bestStreak: 1 });
    state = applyGuessDelta(state, { score: 265, correctCount: 2, totalCount: 2, currentStreak: 2, bestStreak: 2 });
    state = applyGuessDelta(state, { score: 265, correctCount: 2, totalCount: 3, currentStreak: 0, bestStreak: 2 });
    expect(state).toEqual({ score: 265, correctCount: 2, totalCount: 3, currentStreak: 0, bestStreak: 2 });
  });
});
