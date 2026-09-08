/** 6mans ranks, highest to lowest. Order matters for display and adjacency scoring. */
export const RANKS = ['S', 'X', 'A', 'B+', 'B', 'C', 'D', 'E', 'H'] as const;
export type Rank = (typeof RANKS)[number];

export function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && (RANKS as readonly string[]).includes(value);
}

/** Display colour per rank. Shared so the chart and the buttons agree. */
export const RANK_COLORS: Record<Rank, string> = {
  S: '#e91e63',
  X: '#43a047',
  A: '#ef5350',
  'B+': '#3f51b5',
  B: '#ab47bc',
  C: '#1e88e5',
  D: '#4fc3f7',
  E: '#ff7043',
  H: '#8d6e63',
};

/** Distance between two ranks in list positions (0 = exact). */
export function rankDistance(a: Rank, b: Rank): number {
  return Math.abs(RANKS.indexOf(a) - RANKS.indexOf(b));
}
