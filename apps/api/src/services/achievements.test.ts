import { describe, expect, it } from 'vitest';
import { evaluateAchievements, type AchievementSnapshot } from './achievements.js';

const base: AchievementSnapshot = {
  mode: 'endless',
  correct: false,
  counted: true,
  totalCountedGuesses: 0,
  totalCorrectGuesses: 0,
  dailyStreakCurrent: 0,
  endlessRunCurrent: 0,
  distinctRanksCorrect: 0,
  guessHourUtc: 12,
  previousDailyWrong: false,
};

const none = new Set<string>();
const snap = (overrides: Partial<AchievementSnapshot>): AchievementSnapshot => ({ ...base, ...overrides });

describe('evaluateAchievements', () => {
  it('awards first_guess on the first counted guess', () => {
    expect(evaluateAchievements(snap({ totalCountedGuesses: 1 }), none)).toContain('first_guess');
    expect(evaluateAchievements(snap({ totalCountedGuesses: 0 }), none)).not.toContain('first_guess');
  });

  it('awards first_correct once a correct guess is counted', () => {
    expect(evaluateAchievements(snap({ totalCorrectGuesses: 1 }), none)).toContain('first_correct');
    expect(evaluateAchievements(snap({ totalCorrectGuesses: 0 }), none)).not.toContain('first_correct');
  });

  it('does not re-award an achievement already in the earned set', () => {
    const already = new Set(['first_guess', 'first_correct']);
    const result = evaluateAchievements(snap({ totalCountedGuesses: 5, totalCorrectGuesses: 5 }), already);
    expect(result).not.toContain('first_guess');
    expect(result).not.toContain('first_correct');
  });

  describe('guess-count milestones', () => {
    it('guesses_100 requires >= 100 counted guesses', () => {
      expect(evaluateAchievements(snap({ totalCountedGuesses: 99 }), none)).not.toContain('guesses_100');
      expect(evaluateAchievements(snap({ totalCountedGuesses: 100 }), none)).toContain('guesses_100');
    });
    it('guesses_500 requires >= 500 counted guesses', () => {
      expect(evaluateAchievements(snap({ totalCountedGuesses: 499 }), none)).not.toContain('guesses_500');
      expect(evaluateAchievements(snap({ totalCountedGuesses: 500 }), none)).toContain('guesses_500');
    });
  });

  describe('daily streaks', () => {
    it('daily_streak_3 triggers at exactly 3, not before', () => {
      expect(evaluateAchievements(snap({ mode: 'daily', dailyStreakCurrent: 2 }), none)).not.toContain('daily_streak_3');
      expect(evaluateAchievements(snap({ mode: 'daily', dailyStreakCurrent: 3 }), none)).toContain('daily_streak_3');
    });
    it('daily_streak_7 and daily_streak_30 trigger at their boundaries', () => {
      const at7 = evaluateAchievements(snap({ mode: 'daily', dailyStreakCurrent: 7 }), none);
      expect(at7).toContain('daily_streak_7');
      expect(at7).not.toContain('daily_streak_30');
      const at30 = evaluateAchievements(snap({ mode: 'daily', dailyStreakCurrent: 30 }), none);
      expect(at30).toContain('daily_streak_30');
    });
    it('does not fire for endless mode even with a high streak field', () => {
      expect(evaluateAchievements(snap({ mode: 'endless', dailyStreakCurrent: 30 }), none)).not.toContain('daily_streak_3');
    });
  });

  describe('endless runs', () => {
    it('endless_run_5/10/25 and sharpshooter trigger at their boundaries', () => {
      const at5 = evaluateAchievements(snap({ mode: 'endless', endlessRunCurrent: 5 }), none);
      expect(at5).toContain('endless_run_5');
      expect(at5).not.toContain('endless_run_10');

      const at10 = evaluateAchievements(snap({ mode: 'endless', endlessRunCurrent: 10 }), none);
      expect(at10).toContain('endless_run_10');
      expect(at10).toContain('sharpshooter');
      expect(at10).not.toContain('endless_run_25');

      const at25 = evaluateAchievements(snap({ mode: 'endless', endlessRunCurrent: 25 }), none);
      expect(at25).toContain('endless_run_25');
    });
    it('does not fire for daily mode', () => {
      expect(evaluateAchievements(snap({ mode: 'daily', endlessRunCurrent: 25 }), none)).not.toContain('endless_run_5');
    });
  });

  describe('all_ranks_correct', () => {
    it('requires all 9 ranks, not 8', () => {
      expect(evaluateAchievements(snap({ distinctRanksCorrect: 8 }), none)).not.toContain('all_ranks_correct');
      expect(evaluateAchievements(snap({ distinctRanksCorrect: 9 }), none)).toContain('all_ranks_correct');
    });
  });

  describe('time-of-day badges', () => {
    it('night_owl covers 00:00-04:59 UTC, not 05:00', () => {
      expect(evaluateAchievements(snap({ mode: 'daily', guessHourUtc: 0 }), none)).toContain('night_owl');
      expect(evaluateAchievements(snap({ mode: 'daily', guessHourUtc: 4 }), none)).toContain('night_owl');
      expect(evaluateAchievements(snap({ mode: 'daily', guessHourUtc: 5 }), none)).not.toContain('night_owl');
    });
    it('early_bird covers 05:00-08:59 UTC, not 04:59 or 09:00', () => {
      expect(evaluateAchievements(snap({ mode: 'daily', guessHourUtc: 5 }), none)).toContain('early_bird');
      expect(evaluateAchievements(snap({ mode: 'daily', guessHourUtc: 8 }), none)).toContain('early_bird');
      expect(evaluateAchievements(snap({ mode: 'daily', guessHourUtc: 4 }), none)).not.toContain('early_bird');
      expect(evaluateAchievements(snap({ mode: 'daily', guessHourUtc: 9 }), none)).not.toContain('early_bird');
    });
    it('only fires for the daily, never endless', () => {
      expect(evaluateAchievements(snap({ mode: 'endless', guessHourUtc: 2 }), none)).not.toContain('night_owl');
    });
  });

  describe('comeback', () => {
    it('requires a correct daily right after a wrong one', () => {
      expect(
        evaluateAchievements(snap({ mode: 'daily', correct: true, previousDailyWrong: true }), none),
      ).toContain('comeback');
    });
    it('does not fire if the guess itself was wrong', () => {
      expect(
        evaluateAchievements(snap({ mode: 'daily', correct: false, previousDailyWrong: true }), none),
      ).not.toContain('comeback');
    });
    it('does not fire if there was no previous wrong daily', () => {
      expect(
        evaluateAchievements(snap({ mode: 'daily', correct: true, previousDailyWrong: false }), none),
      ).not.toContain('comeback');
    });
  });

  it('never returns contributor: it is awarded outside the guess flow', () => {
    const result = evaluateAchievements(
      snap({
        totalCountedGuesses: 1000,
        totalCorrectGuesses: 1000,
        mode: 'daily',
        dailyStreakCurrent: 999,
        distinctRanksCorrect: 9,
      }),
      none,
    );
    expect(result).not.toContain('contributor');
  });

  it('returns ids in catalogue order regardless of check order', () => {
    const result = evaluateAchievements(
      snap({ totalCountedGuesses: 100, totalCorrectGuesses: 1, mode: 'endless', endlessRunCurrent: 25 }),
      none,
    );
    // first_correct and endless_run_5 both come before guesses_100 and endless_run_25 in the catalogue.
    expect(result.indexOf('first_correct')).toBeLessThan(result.indexOf('guesses_100'));
    expect(result.indexOf('endless_run_5')).toBeLessThan(result.indexOf('endless_run_25'));
    expect(result.indexOf('endless_run_5')).toBeLessThan(result.indexOf('guesses_100'));
  });
});
