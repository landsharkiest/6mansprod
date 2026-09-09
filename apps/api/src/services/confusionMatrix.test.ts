import { describe, expect, it } from 'vitest';
import { RANKS } from '@6mansdle/shared';
import { buildConfusionMatrix, perRankAccuracyFromPairs } from './confusionMatrix.js';

describe('buildConfusionMatrix', () => {
  it('fills the full 9x9 grid in RANKS order, zero for pairs with no guesses', () => {
    const cells = buildConfusionMatrix([
      { actualRank: 'S', guessedRank: 'S', count: 4 },
      { actualRank: 'S', guessedRank: 'X', count: 1 },
      { actualRank: 'H', guessedRank: 'E', count: 2 },
    ]);

    expect(cells).toHaveLength(RANKS.length * RANKS.length);
    // Row-major in RANKS order: first 9 cells are actualRank S against every guessed rank.
    expect(cells.slice(0, RANKS.length).map((c) => c.guessedRank)).toEqual([...RANKS]);
    expect(cells.find((c) => c.actualRank === 'S' && c.guessedRank === 'S')?.count).toBe(4);
    expect(cells.find((c) => c.actualRank === 'S' && c.guessedRank === 'X')?.count).toBe(1);
    expect(cells.find((c) => c.actualRank === 'S' && c.guessedRank === 'A')?.count).toBe(0);
    expect(cells.find((c) => c.actualRank === 'H' && c.guessedRank === 'E')?.count).toBe(2);
    expect(cells.find((c) => c.actualRank === 'H' && c.guessedRank === 'H')?.count).toBe(0);
  });

  it('returns an all-zero grid when there are no pairs', () => {
    const cells = buildConfusionMatrix([]);
    expect(cells).toHaveLength(81);
    expect(cells.every((c) => c.count === 0)).toBe(true);
  });
});

describe('perRankAccuracyFromPairs', () => {
  it('sums totals and treats the diagonal as correct guesses', () => {
    const result = perRankAccuracyFromPairs([
      { actualRank: 'S', guessedRank: 'S', count: 3 },
      { actualRank: 'S', guessedRank: 'X', count: 1 },
      { actualRank: 'B', guessedRank: 'B+', count: 5 },
    ]);

    const s = result.find((r) => r.rank === 'S')!;
    expect(s).toEqual({ rank: 'S', totalGuesses: 4, correctGuesses: 3, accuracy: 75 });

    const b = result.find((r) => r.rank === 'B')!;
    expect(b).toEqual({ rank: 'B', totalGuesses: 5, correctGuesses: 0, accuracy: 0 });

    const untouched = result.find((r) => r.rank === 'D')!;
    expect(untouched).toEqual({ rank: 'D', totalGuesses: 0, correctGuesses: 0, accuracy: 0 });

    expect(result).toHaveLength(RANKS.length);
  });
});
