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
    expect(hardest.find((c) => c.clipId === 'low-guesses')).toBeUndefined();
  });

  it('ranks hardest ascending by accuracy', () => {
    const hardest = topClipsByAccuracy(clips, 'hardest', 10, 5);
    expect(hardest.map((c) => c.clipId)).toEqual(['hard', 'medium', 'easy']);
    expect(hardest[0]).toEqual({ clipId: 'hard', actualRank: 'A', totalGuesses: 20, accuracy: 10 });
  });

  it('ranks easiest descending by accuracy', () => {
    const easiest = topClipsByAccuracy(clips, 'easiest', 10, 5);
    expect(easiest.map((c) => c.clipId)).toEqual(['easy', 'medium', 'hard']);
  });

  it('respects the limit', () => {
    const top1 = topClipsByAccuracy(clips, 'hardest', 10, 1);
    expect(top1).toHaveLength(1);
    expect(top1[0]!.clipId).toBe('hard');
  });

  it('returns an empty list when nothing meets the threshold', () => {
    expect(topClipsByAccuracy(clips, 'hardest', 1000, 5)).toEqual([]);
  });
});
