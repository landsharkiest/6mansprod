import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyScheduler, nextDailyPostTime, shouldFireDaily, utcDay } from '../src/lib/scheduler.js';

describe('utcDay', () => {
  it('formats as YYYY-MM-DD in UTC', () => {
    expect(utcDay(new Date('2026-03-01T23:59:00Z'))).toBe('2026-03-01');
    expect(utcDay(new Date('2026-03-02T00:00:00Z'))).toBe('2026-03-02');
  });
});

describe('shouldFireDaily', () => {
  it('is false before 00:05 UTC even with no prior post', () => {
    expect(shouldFireDaily(new Date('2026-03-01T00:04:59Z'), null)).toBe(false);
  });

  it('is true at exactly 00:05 UTC with no prior post', () => {
    expect(shouldFireDaily(new Date('2026-03-01T00:05:00Z'), null)).toBe(true);
  });

  it('is true any time after 00:05 UTC, same day, with no prior post', () => {
    expect(shouldFireDaily(new Date('2026-03-01T14:30:00Z'), null)).toBe(true);
  });

  it('is false once today has already fired', () => {
    expect(shouldFireDaily(new Date('2026-03-01T10:00:00Z'), '2026-03-01')).toBe(false);
  });

  it('is true again the next day even if it fired yesterday', () => {
    expect(shouldFireDaily(new Date('2026-03-02T00:05:00Z'), '2026-03-01')).toBe(true);
  });

  it('catches up if the process was down through 00:05 (e.g. restarted at noon)', () => {
    expect(shouldFireDaily(new Date('2026-03-01T12:00:00Z'), '2026-02-28')).toBe(true);
  });
});

describe('nextDailyPostTime', () => {
  it("returns today's 00:05 UTC when still ahead", () => {
    expect(nextDailyPostTime(new Date('2026-03-01T00:00:00Z')).toISOString()).toBe('2026-03-01T00:05:00.000Z');
  });

  it("rolls to tomorrow's 00:05 UTC once today's has passed", () => {
    expect(nextDailyPostTime(new Date('2026-03-01T00:05:00Z')).toISOString()).toBe('2026-03-02T00:05:00.000Z');
    expect(nextDailyPostTime(new Date('2026-03-01T23:59:00Z')).toISOString()).toBe('2026-03-02T00:05:00.000Z');
  });
});

describe('DailyScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once per UTC day, polling on the given interval', async () => {
    const onFire = vi.fn();
    const scheduler = new DailyScheduler(onFire, 30_000);
    scheduler.start();

    // Before 00:05 — no fire yet.
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(onFire).not.toHaveBeenCalled();

    // Crosses 00:05 — fires exactly once even though several more ticks land the same day.
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(onFire).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(onFire).toHaveBeenCalledTimes(1);

    // Next UTC day, past 00:05 again — fires a second time.
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(onFire).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('stop() prevents further polling', async () => {
    const onFire = vi.fn();
    const scheduler = new DailyScheduler(onFire, 30_000);
    scheduler.start();
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(onFire).not.toHaveBeenCalled();
  });
});
