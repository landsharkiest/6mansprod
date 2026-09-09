import { describe, expect, it } from 'vitest';
import { formatCountdown, msUntilNextUtcMidnight } from '../../src/lib/countdown';

describe('msUntilNextUtcMidnight', () => {
  it('counts down to the next UTC midnight', () => {
    const now = new Date('2026-09-08T23:59:00Z');
    expect(msUntilNextUtcMidnight(now)).toBe(60_000);
  });

  it('is a full day right after midnight', () => {
    const now = new Date('2026-09-08T00:00:00Z');
    expect(msUntilNextUtcMidnight(now)).toBe(24 * 60 * 60 * 1000);
  });

  it('never returns a negative value', () => {
    // Same instant repeated; guards the Math.max(0, ...) floor.
    const now = new Date('2026-09-08T00:00:00.000Z');
    expect(msUntilNextUtcMidnight(now)).toBeGreaterThanOrEqual(0);
  });
});

describe('formatCountdown', () => {
  it('formats as HH:MM:SS', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(1000)).toBe('00:00:01');
    expect(formatCountdown(61_000)).toBe('00:01:01');
    expect(formatCountdown(3_661_000)).toBe('01:01:01');
  });

  it('pads single digits', () => {
    expect(formatCountdown(9_000)).toBe('00:00:09');
  });
});
