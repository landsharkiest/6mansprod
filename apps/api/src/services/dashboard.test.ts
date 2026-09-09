import { describe, expect, it } from 'vitest';
import { ATTENTION_MAX_ACCURACY, ATTENTION_MIN_GUESSES, buildDailySeries, needsAttention } from './dashboard.js';

describe('needsAttention', () => {
  it('flags a clip below the accuracy threshold with enough guesses', () => {
    expect(needsAttention(ATTENTION_MIN_GUESSES, ATTENTION_MAX_ACCURACY - 0.1)).toBe(true);
    expect(needsAttention(50, 5)).toBe(true);
  });

  it('does not flag a clip with too few guesses, even at 0% accuracy', () => {
    expect(needsAttention(ATTENTION_MIN_GUESSES - 1, 0)).toBe(false);
  });

  it('does not flag a clip at or above the accuracy threshold', () => {
    expect(needsAttention(50, ATTENTION_MAX_ACCURACY)).toBe(false);
    expect(needsAttention(50, 90)).toBe(false);
  });
});

describe('buildDailySeries', () => {
  const today = new Date('2026-09-08T15:30:00Z');

  it('returns 30 days, oldest first, ending on the current UTC day', () => {
    const series = buildDailySeries(today, new Map(), new Map());
    expect(series).toHaveLength(30);
    expect(series[0]!.date).toBe('2026-08-10');
    expect(series[29]!.date).toBe('2026-09-08');
  });

  it('zero-fills days with no data and carries through counts for days that have some', () => {
    const guesses = new Map([['2026-09-08', 12], ['2026-09-05', 3]]);
    const newUsers = new Map([['2026-09-08', 2]]);
    const series = buildDailySeries(today, guesses, newUsers);

    const last = series[series.length - 1]!;
    expect(last).toEqual({ date: '2026-09-08', guesses: 12, newUsers: 2 });

    const sep5 = series.find((p) => p.date === '2026-09-05')!;
    expect(sep5).toEqual({ date: '2026-09-05', guesses: 3, newUsers: 0 });

    const sep1 = series.find((p) => p.date === '2026-09-01')!;
    expect(sep1).toEqual({ date: '2026-09-01', guesses: 0, newUsers: 0 });
  });

  it('respects a custom day count', () => {
    const series = buildDailySeries(today, new Map(), new Map(), 7);
    expect(series).toHaveLength(7);
    expect(series[0]!.date).toBe('2026-09-02');
    expect(series[6]!.date).toBe('2026-09-08');
  });

  it('handles a UTC month boundary correctly', () => {
    const marchFirst = new Date('2026-03-01T00:00:00Z');
    const series = buildDailySeries(marchFirst, new Map(), new Map(), 3);
    expect(series.map((p) => p.date)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});
