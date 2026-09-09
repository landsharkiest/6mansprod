import { describe, expect, it } from 'vitest';
import { computeRankBias, pickRankBiasExtremes } from './rankBias.js';

describe('computeRankBias', () => {
  it('is positive when guesses skew better than the truth (overrated)', () => {
    // RANKS = S, X, A, B+, B, C, D, E, H — B is index 4, S is index 0 (better).
    // Guessing S for a B clip means players thought it was much better than it is.
    const [bias] = computeRankBias([{ actualRank: 'B', guessedRank: 'S', count: 2 }]);
    expect(bias).toEqual({ rank: 'B', avgSignedDistance: 4 });
  });

  it('is negative when guesses skew worse than the truth (underrated)', () => {
    const [bias] = computeRankBias([{ actualRank: 'B', guessedRank: 'H', count: 2 }]);
    expect(bias).toEqual({ rank: 'B', avgSignedDistance: -4 });
  });

  it('averages across multiple pairs for the same actual rank', () => {
    const [bias] = computeRankBias([
      { actualRank: 'B', guessedRank: 'B', count: 3 }, // distance 0, weight 3
      { actualRank: 'B', guessedRank: 'S', count: 1 }, // distance 4, weight 1
    ]);
    // (0*3 + 4*1) / 4 = 1
    expect(bias).toEqual({ rank: 'B', avgSignedDistance: 1 });
  });

  it('omits ranks with zero counted guesses', () => {
    const biases = computeRankBias([{ actualRank: 'S', guessedRank: 'S', count: 1 }]);
    expect(biases.map((b) => b.rank)).toEqual(['S']);
  });
});

describe('pickRankBiasExtremes', () => {
  it('picks the max as most overrated and the min as most underrated', () => {
    const { mostOverratedRank, mostUnderratedRank } = pickRankBiasExtremes([
      { rank: 'B+', avgSignedDistance: 1.5 },
      { rank: 'D', avgSignedDistance: -2.1 },
      { rank: 'S', avgSignedDistance: 0 },
    ]);
    expect(mostOverratedRank).toEqual({ rank: 'B+', avgSignedDistance: 1.5 });
    expect(mostUnderratedRank).toEqual({ rank: 'D', avgSignedDistance: -2.1 });
  });

  it('returns null for both when there is no data', () => {
    expect(pickRankBiasExtremes([])).toEqual({ mostOverratedRank: null, mostUnderratedRank: null });
  });
});
