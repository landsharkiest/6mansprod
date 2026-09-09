import { describe, expect, it } from 'vitest';
import { RANKS } from '@6mansdle/shared';
import {
  buildVsCommunity,
  buildWeeklyAccuracy,
  computeOverallBias,
  mondayOf,
  pickBlindSpots,
  pickStrengths,
  type WeekAgg,
} from './insights.js';

describe('mondayOf', () => {
  it('returns the same date when given a Monday', () => {
    // 2026-09-07 is a Monday.
    expect(mondayOf(new Date('2026-09-07T15:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-07');
  });

  it('rolls back to the preceding Monday for a mid-week date', () => {
    // 2026-09-10 is a Thursday.
    expect(mondayOf(new Date('2026-09-10T23:59:00Z')).toISOString().slice(0, 10)).toBe('2026-09-07');
  });

  it('rolls back correctly for a Sunday (JS day 0)', () => {
    // 2026-09-13 is a Sunday, belongs to the week starting 2026-09-07.
    expect(mondayOf(new Date('2026-09-13T01:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-07');
  });
});

describe('buildWeeklyAccuracy', () => {
  const now = new Date('2026-09-10T12:00:00Z'); // Thursday of the week starting 2026-09-07

  it('returns exactly numWeeks buckets, oldest first, ending on the current week', () => {
    const buckets = buildWeeklyAccuracy([], 26, now);
    expect(buckets).toHaveLength(26);
    expect(buckets[0]!.weekStart).toBe('2026-03-16'); // 25 weeks before 2026-09-07
    expect(buckets[25]!.weekStart).toBe('2026-09-07');
  });

  it('zero-fills weeks with no data', () => {
    const buckets = buildWeeklyAccuracy([], 4, now);
    expect(buckets.every((b) => b.guesses === 0 && b.correct === 0 && b.accuracy === 0)).toBe(true);
  });

  it('fills in matching weeks and computes accuracy', () => {
    const aggs: WeekAgg[] = [{ weekStart: '2026-09-07', guesses: 8, correct: 6 }];
    const buckets = buildWeeklyAccuracy(aggs, 4, now);
    const current = buckets[buckets.length - 1]!;
    expect(current).toEqual({ weekStart: '2026-09-07', guesses: 8, correct: 6, accuracy: 75 });
  });

  it('ignores aggregate weeks outside the requested window', () => {
    const aggs: WeekAgg[] = [{ weekStart: '2020-01-06', guesses: 5, correct: 5 }];
    const buckets = buildWeeklyAccuracy(aggs, 4, now);
    expect(buckets.every((b) => b.guesses === 0)).toBe(true);
  });
});

describe('pickStrengths', () => {
  it('excludes ranks below the minimum guess threshold', () => {
    const strengths = pickStrengths([
      { actualRank: 'S', guessedRank: 'S', count: 3 }, // only 3 guesses, below threshold of 5
      { actualRank: 'X', guessedRank: 'X', count: 5 },
    ]);
    expect(strengths.map((s) => s.rank)).toEqual(['X']);
  });

  it('sorts by accuracy descending and caps at the limit', () => {
    const pairs = [
      { actualRank: 'S' as const, guessedRank: 'S' as const, count: 10 }, // 100%
      { actualRank: 'X' as const, guessedRank: 'A' as const, count: 5 },
      { actualRank: 'X' as const, guessedRank: 'X' as const, count: 5 }, // 50%
      { actualRank: 'A' as const, guessedRank: 'A' as const, count: 8 },
      { actualRank: 'A' as const, guessedRank: 'B' as const, count: 2 }, // 80%
      { actualRank: 'B' as const, guessedRank: 'C' as const, count: 6 }, // 0%
    ];
    const strengths = pickStrengths(pairs, 2);
    expect(strengths).toHaveLength(2);
    expect(strengths.map((s) => s.rank)).toEqual(['S', 'A']);
  });

  it('returns an empty array with no data', () => {
    expect(pickStrengths([])).toEqual([]);
  });
});

describe('pickBlindSpots', () => {
  it('excludes ranks with no wrong guesses', () => {
    const spots = pickBlindSpots([{ actualRank: 'S', guessedRank: 'S', count: 10 }]);
    expect(spots).toEqual([]);
  });

  it('reports the most common wrong guess per rank', () => {
    const spots = pickBlindSpots([
      { actualRank: 'A', guessedRank: 'A', count: 2 },
      { actualRank: 'A', guessedRank: 'B+', count: 4 },
      { actualRank: 'A', guessedRank: 'X', count: 1 },
    ]);
    expect(spots).toHaveLength(1);
    expect(spots[0]).toEqual({
      actualRank: 'A',
      totalGuesses: 7,
      correctGuesses: 2,
      accuracy: 28.6,
      mostCommonWrongGuess: 'B+',
      mostCommonWrongGuessCount: 4,
    });
  });

  it('sorts by wrong-guess count descending and caps at the limit', () => {
    const pairs = [
      { actualRank: 'S' as const, guessedRank: 'X' as const, count: 1 },
      { actualRank: 'A' as const, guessedRank: 'B' as const, count: 5 },
      { actualRank: 'B' as const, guessedRank: 'C' as const, count: 3 },
      { actualRank: 'C' as const, guessedRank: 'D' as const, count: 2 },
    ];
    const spots = pickBlindSpots(pairs, 2);
    expect(spots.map((s) => s.actualRank)).toEqual(['A', 'B']);
  });

  it('never returns more entries than there are ranks', () => {
    const pairs = RANKS.map((r, i) => ({ actualRank: r, guessedRank: RANKS[(i + 1) % RANKS.length]!, count: 1 }));
    const spots = pickBlindSpots(pairs, 99);
    expect(spots.length).toBeLessThanOrEqual(RANKS.length);
  });
});

describe('computeOverallBias', () => {
  it('returns null with no data', () => {
    expect(computeOverallBias([])).toBeNull();
  });

  it('is 0 for a perfectly calibrated player', () => {
    expect(computeOverallBias([{ actualRank: 'B', guessedRank: 'B', count: 10 }])).toBe(0);
  });

  it('is positive when guesses skew better than the truth (RANKS best to worst)', () => {
    // Guessed S (index 0) for an actual B (index 4): signedDistance = 4 - 0 = +4 (overrated).
    expect(computeOverallBias([{ actualRank: 'B', guessedRank: 'S', count: 1 }])).toBe(4);
  });

  it('is negative when guesses skew worse than the truth', () => {
    // Guessed H (index 8) for an actual S (index 0): signedDistance = 0 - 8 = -8 (underrated).
    expect(computeOverallBias([{ actualRank: 'S', guessedRank: 'H', count: 1 }])).toBe(-8);
  });

  it('weights by count across multiple pairs', () => {
    const bias = computeOverallBias([
      { actualRank: 'B', guessedRank: 'B', count: 3 }, // 0 * 3
      { actualRank: 'B', guessedRank: 'S', count: 1 }, // +4 * 1
    ]);
    expect(bias).toBe(1); // (0*3 + 4*1) / 4
  });
});

describe('buildVsCommunity', () => {
  it('maps null user accuracy when the player has never guessed that rank', () => {
    const result = buildVsCommunity(
      [{ rank: 'S', totalGuesses: 0, accuracy: 0 }],
      [{ rank: 'S', accuracy: 42 }],
    );
    expect(result).toEqual([{ rank: 'S', userAccuracy: null, userGuesses: 0, communityAccuracy: 42 }]);
  });

  it('carries the user accuracy through when they have guesses for a rank', () => {
    const result = buildVsCommunity(
      [{ rank: 'A', totalGuesses: 5, accuracy: 80 }],
      [{ rank: 'A', accuracy: 55 }],
    );
    expect(result).toEqual([{ rank: 'A', userAccuracy: 80, userGuesses: 5, communityAccuracy: 55 }]);
  });

  it('defaults community accuracy to 0 for a rank with no community data', () => {
    const result = buildVsCommunity([{ rank: 'H', totalGuesses: 2, accuracy: 100 }], []);
    expect(result[0]!.communityAccuracy).toBe(0);
  });
});
