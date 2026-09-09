import type { Rank } from '@6mansdle/shared';

export interface ShareTextInput {
  /** Daily ordinal number, e.g. 42 for "#42". */
  number: number;
  /** UTC date string as returned by the API, e.g. "2026-09-09". */
  date: string;
  correct: boolean;
  guessedRank: Rank;
  actualRank: Rank;
  /** Rank distance between guess and answer (0 = correct). */
  distance: number;
  /** Current daily streak. Omit (or 0/undefined) to skip the streak line, e.g. for guests with no streak yet. */
  streak?: number;
  /** Defaults to https://6mansdle.com/daily */
  url?: string;
}

const DEFAULT_URL = 'https://6mansdle.com/daily';

/** "1 rank off", "3 ranks off" — never mentions the clip itself. */
function distanceHint(distance: number): string {
  return `${distance} rank${distance === 1 ? '' : 's'} off`;
}

/**
 * Builds the compact, spoiler-free share text for a daily result.
 * Never includes the clip id or anything that could identify the clip.
 */
export function buildShareText(input: ShareTextInput): string {
  const { number, date, correct, guessedRank, actualRank, distance, streak, url } = input;

  const lines: string[] = [`6mansdle #${number} · ${date}`];

  if (correct) {
    lines.push(`🟩 ${actualRank}  (correct)`);
  } else {
    lines.push(`🟥 ${guessedRank} → 🟩 ${actualRank}  (${distanceHint(distance)})`);
  }

  if (streak && streak > 0) {
    lines.push(`🔥 streak ${streak}`);
  }

  lines.push(url ?? DEFAULT_URL);

  return lines.join('\n');
}
