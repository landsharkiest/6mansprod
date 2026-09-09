import { describe, expect, it } from 'vitest';
import { topClipsByAccuracy } from './clipDifficulty.js';

const clips = [
  { clipId: 'low-guesses', actualRank: 'S' as const, totalGuesses: 3, correctGuesses: 0 }, // below min, excluded
  { clipId: 'hard', actualRank: 'A' as const, totalGuesses: 20, correctGuesses: 2 }, // 10%
  { clipId: 'medium', actualRank: 'B' as const, totalGuesses: 10, correctGuesses: 5 }, // 50%
  { clipId: 'easy', actualRank: 'X' as const, totalGuesses: 15, correctGuesses: 15 }, // 100%
];

describe('topClipsByAccuracy', () => {
  it('excludes clips under the minimum guess threshold', () => {
    const hardest = topClipsByAccuracy(clips, 'hardest', 10, 5);
    expect(hardest.find((c) => c.actualRank === 'S')).toBeUndefined();
  });

  it('ranks hardest ascending by accuracy', () => {
    const hardest = topClipsByAccuracy(clips, 'hardest', 10, 5);
    expect(hardest.map((c) => c.actualRank)).toEqual(['A', 'B', 'X']);
    expect(hardest[0]).toEqual({ actualRank: 'A', totalGuesses: 20, accuracy: 10 });
    expect(hardest[0]).not.toHaveProperty('clipId');
  });

  it('ranks easiest descending by accuracy', () => {
    const easiest = topClipsByAccuracy(clips, 'easiest', 10, 5);
    expect(easiest.map((c) => c.actualRank)).toEqual(['X', 'B', 'A']);
  });

  it('respects the limit', () => {
    const top1 = topClipsByAccuracy(clips, 'hardest', 10, 1);
    expect(top1).toHaveLength(1);
    expect(top1[0]!.actualRank).toBe('A');
  });

  it('returns an empty list when nothing meets the threshold', () => {
    expect(topClipsByAccuracy(clips, 'hardest', 1000, 5)).toEqual([]);
  });
});
