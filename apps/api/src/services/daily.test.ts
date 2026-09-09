import { describe, expect, it } from 'vitest';
import { effectiveStreak, nextDailyNumber } from './daily.js';
import { previousDay, utcToday } from '../lib/dates.js';

describe('dates', () => {
  it('formats UTC day', () => {
    expect(utcToday(new Date('2026-09-07T23:59:00Z'))).toBe('2026-09-07');
    expect(utcToday(new Date('2026-09-08T00:00:01Z'))).toBe('2026-09-08');
  });
  it('steps back across month and year boundaries', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });
});

describe('effectiveStreak', () => {
  const today = '2026-09-07';
  it('keeps a streak played today or yesterday', () => {
    expect(effectiveStreak({ current_streak: 4, best_streak: 9, last_played: today }, today)).toEqual({ current: 4, best: 9 });
    expect(effectiveStreak({ current_streak: 4, best_streak: 9, last_played: '2026-09-06' }, today)).toEqual({ current: 4, best: 9 });
  });
  it('drops a lapsed streak but keeps the best', () => {
    expect(effectiveStreak({ current_streak: 4, best_streak: 9, last_played: '2026-09-05' }, today)).toEqual({ current: 0, best: 9 });
    expect(effectiveStreak({ current_streak: 0, best_streak: 0, last_played: null }, today)).toEqual({ current: 0, best: 0 });
  });
});

describe('nextDailyNumber', () => {
  it('starts at 1 when no daily has ever run', () => {
    expect(nextDailyNumber(null)).toBe(1);
  });
  it('is one past the most recent daily number', () => {
    expect(nextDailyNumber(1)).toBe(2);
    expect(nextDailyNumber(41)).toBe(42);
  });
});
