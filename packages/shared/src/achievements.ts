/** Badges that reward play. Data-driven: add a row here (and a trigger in the API's
 * evaluateAchievements) to introduce a new one — nothing else needs to change shape. */
export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: AchievementTier;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first_guess', name: 'First Steps', description: 'Make your first guess.', emoji: '👣', tier: 'bronze' },
  { id: 'first_correct', name: 'On the Board', description: 'Get your first guess right.', emoji: '✅', tier: 'bronze' },
  { id: 'daily_streak_3', name: 'Habit Forming', description: 'Reach a 3-day daily streak.', emoji: '🔥', tier: 'bronze' },
  { id: 'daily_streak_7', name: 'Week One', description: 'Reach a 7-day daily streak.', emoji: '📅', tier: 'silver' },
  { id: 'daily_streak_30', name: 'Iron Will', description: 'Reach a 30-day daily streak.', emoji: '🏆', tier: 'gold' },
  { id: 'endless_run_5', name: 'Getting Hot', description: 'Get 5 in a row correct in endless mode.', emoji: '♨️', tier: 'bronze' },
  { id: 'endless_run_10', name: 'On Fire', description: 'Get 10 in a row correct in endless mode.', emoji: '🔥', tier: 'silver' },
  { id: 'endless_run_25', name: 'Unstoppable', description: 'Get 25 in a row correct in endless mode.', emoji: '🚀', tier: 'gold' },
  { id: 'guesses_100', name: 'Apprentice Scout', description: 'Make 100 counted guesses.', emoji: '🔍', tier: 'bronze' },
  { id: 'guesses_500', name: 'Rank Sage', description: 'Make 500 counted guesses.', emoji: '🧠', tier: 'gold' },
  { id: 'all_ranks_correct', name: 'Full Spectrum', description: 'Correctly guess every rank at least once.', emoji: '🌈', tier: 'gold' },
  { id: 'sharpshooter', name: 'Sharpshooter', description: '10 correct in a row in endless mode.', emoji: '🎯', tier: 'silver' },
  { id: 'night_owl', name: 'Night Owl', description: 'Play the daily challenge between 00:00 and 04:59 UTC.', emoji: '🦉', tier: 'bronze' },
  { id: 'early_bird', name: 'Early Bird', description: 'Play the daily challenge between 05:00 and 08:59 UTC.', emoji: '🐦', tier: 'bronze' },
  { id: 'comeback', name: 'Comeback', description: 'Get the daily right the day after getting it wrong.', emoji: '💪', tier: 'silver' },
  { id: 'contributor', name: 'Contributor', description: 'Have an uploaded clip approved.', emoji: '🎬', tier: 'gold' },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];

export const ACHIEVEMENT_MAP: ReadonlyMap<string, Achievement> = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === 'string' && ACHIEVEMENT_MAP.has(value);
}
