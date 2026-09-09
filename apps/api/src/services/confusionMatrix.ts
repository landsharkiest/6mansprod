import { RANKS, type ConfusionCell, type Rank, type RankAccuracy } from '@6mansdle/shared';

export interface RankPairCount {
  actualRank: Rank;
  guessedRank: Rank;
  count: number;
}

const pct = (correct: number, total: number) => (total ? Math.round((correct / total) * 1000) / 10 : 0);

/**
 * Expands sparse actual/guessed pair counts (one row per pair that occurred at least once)
 * into the full 9x9 grid in RANKS order, filling any pair with no guesses as count 0.
 */
export function buildConfusionMatrix(pairs: RankPairCount[]): ConfusionCell[] {
  const counts = new Map<string, number>();
  for (const p of pairs) counts.set(`${p.actualRank}:${p.guessedRank}`, p.count);

  const cells: ConfusionCell[] = [];
  for (const actualRank of RANKS) {
    for (const guessedRank of RANKS) {
      cells.push({ actualRank, guessedRank, count: counts.get(`${actualRank}:${guessedRank}`) ?? 0 });
    }
  }
  return cells;
}

/**
 * Per-actual-rank totals and accuracy, derived from the same pair counts used for the
 * confusion matrix (the actual===guessed diagonal is the correct count).
 */
export function perRankAccuracyFromPairs(pairs: RankPairCount[]): RankAccuracy[] {
  const totals = new Map<Rank, number>();
  const correct = new Map<Rank, number>();
  for (const p of pairs) {
    totals.set(p.actualRank, (totals.get(p.actualRank) ?? 0) + p.count);
    if (p.actualRank === p.guessedRank) correct.set(p.actualRank, (correct.get(p.actualRank) ?? 0) + p.count);
  }

  return RANKS.map((rank) => {
    const totalGuesses = totals.get(rank) ?? 0;
    const correctGuesses = correct.get(rank) ?? 0;
    return { rank, totalGuesses, correctGuesses, accuracy: pct(correctGuesses, totalGuesses) };
  });
}
