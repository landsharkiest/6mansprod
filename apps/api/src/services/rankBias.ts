import { RANKS, type Rank, type RankBias } from '@6mansdle/shared';
import type { RankPairCount } from './confusionMatrix.js';

/**
 * Distance in RANKS list positions from `guessed` to `actual`, signed so a positive value
 * means the guess was *better* than the truth (RANKS is best-to-worst, so a lower index is
 * a better rank) and a negative value means the guess was worse.
 */
function signedDistance(actualRank: Rank, guessedRank: Rank): number {
  return RANKS.indexOf(actualRank) - RANKS.indexOf(guessedRank);
}

/**
 * Average signed guess bias per actual rank, built from the same actual/guessed pair counts
 * as the confusion matrix. Ranks with zero counted guesses are omitted.
 */
export function computeRankBias(pairs: RankPairCount[]): RankBias[] {
  const sums = new Map<Rank, number>();
  const totals = new Map<Rank, number>();
  for (const p of pairs) {
    sums.set(p.actualRank, (sums.get(p.actualRank) ?? 0) + signedDistance(p.actualRank, p.guessedRank) * p.count);
    totals.set(p.actualRank, (totals.get(p.actualRank) ?? 0) + p.count);
  }

  return RANKS.filter((rank) => (totals.get(rank) ?? 0) > 0).map((rank) => {
    const total = totals.get(rank)!;
    const avgSignedDistance = Math.round((sums.get(rank)! / total) * 100) / 100;
    return { rank, avgSignedDistance };
  });
}

/**
 * The rank players most overrate (guess better than truth, on average) and most underrate
 * (guess worse than truth). Ties keep RANKS order (first match wins). Null when there is no data.
 */
export function pickRankBiasExtremes(biases: RankBias[]): { mostOverratedRank: RankBias | null; mostUnderratedRank: RankBias | null } {
  if (biases.length === 0) return { mostOverratedRank: null, mostUnderratedRank: null };

  let mostOverratedRank = biases[0]!;
  let mostUnderratedRank = biases[0]!;
  for (const b of biases) {
    if (b.avgSignedDistance > mostOverratedRank.avgSignedDistance) mostOverratedRank = b;
    if (b.avgSignedDistance < mostUnderratedRank.avgSignedDistance) mostUnderratedRank = b;
  }
  return { mostOverratedRank, mostUnderratedRank };
}
