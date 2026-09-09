import type { ClipDifficulty } from '@6mansdle/shared';

export interface ClipGuessAgg {
  clipId: string;
  actualRank: ClipDifficulty['actualRank'];
  totalGuesses: number;
  correctGuesses: number;
}

const pct = (correct: number, total: number) => (total ? Math.round((correct / total) * 1000) / 10 : 0);

/**
 * Top N clips by accuracy in either direction, restricted to clips with at least `minGuesses`
 * counted guesses so a 1/1 clip can't top the list. Ties keep the incoming (clipId) order.
 */
export function topClipsByAccuracy(
  clips: ClipGuessAgg[],
  direction: 'hardest' | 'easiest',
  minGuesses: number,
  limit: number,
): ClipDifficulty[] {
  const eligible = clips
    .filter((c) => c.totalGuesses >= minGuesses)
    // clipId is intentionally dropped from the public shape (see ClipDifficulty in shared).
    .map((c) => ({ actualRank: c.actualRank, totalGuesses: c.totalGuesses, accuracy: pct(c.correctGuesses, c.totalGuesses) }));

  eligible.sort((a, b) => (direction === 'hardest' ? a.accuracy - b.accuracy : b.accuracy - a.accuracy));
  return eligible.slice(0, limit);
}
