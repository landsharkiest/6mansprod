import type { Rank } from '@6mansdle/shared';
import { challengeVerdict } from '@6mansdle/shared';

export interface ChallengeShareTextInput {
  guessedRank: Rank;
  url: string;
}

/**
 * Share text for a freshly-created challenge link. Deliberately says only what the creator
 * guessed, never whether they were right — the point is to make the friend guess blind too.
 */
export function buildChallengeShareText({ guessedRank, url }: ChallengeShareTextInput): string {
  return `Can you beat me on 6mansdle? I guessed ${guessedRank} — ${url}`;
}

/**
 * The result panel's headline: how the challenge-taker did against the creator. Pure so it's
 * trivial to test independently of the panel's markup.
 */
export function buildChallengeVerdictText(myCorrect: boolean, creatorCorrect: boolean, creatorName: string): string {
  const verdict = challengeVerdict(myCorrect, creatorCorrect);
  if (verdict === 'beat') return `You beat ${creatorName}!`;
  if (verdict === 'tie') return 'Tie';
  return `${creatorName} got this one`;
}
