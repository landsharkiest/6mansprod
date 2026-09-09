import { describe, expect, it } from 'vitest';
import { blitzPoints } from '@6mansdle/shared';

describe('blitzPoints', () => {
  it('scores a correct guess at 0ms elapsed as 150 (100 base + full 50 bonus)', () => {
    expect(blitzPoints(true, 0)).toBe(150);
  });

  it('scores a correct guess at 5000ms elapsed as 100 (bonus fully decayed)', () => {
    expect(blitzPoints(true, 5000)).toBe(100);
  });

  it('scores a correct guess well past the bonus window as 100, not negative', () => {
    expect(blitzPoints(true, 12_000)).toBe(100);
  });

  it('scores a correct guess at 2500ms elapsed as ~125', () => {
    expect(blitzPoints(true, 2500)).toBe(125);
  });

  it('scores any wrong guess as 0 regardless of elapsed time', () => {
    expect(blitzPoints(false, 0)).toBe(0);
    expect(blitzPoints(false, 2500)).toBe(0);
    expect(blitzPoints(false, 50_000)).toBe(0);
  });

  it('clamps a negative elapsed time to the maximum bonus rather than exceeding it', () => {
    expect(blitzPoints(true, -500)).toBe(150);
  });

  it('is always within [100, 150] for a correct guess', () => {
    for (const elapsed of [0, 500, 1000, 1999, 2500, 3000, 4000, 4999, 5000, 5001, 10_000]) {
      const points = blitzPoints(true, elapsed);
      expect(points).toBeGreaterThanOrEqual(100);
      expect(points).toBeLessThanOrEqual(150);
    }
  });

  it('decays monotonically as elapsed time increases', () => {
    let previous = blitzPoints(true, 0);
    for (const elapsed of [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000]) {
      const points = blitzPoints(true, elapsed);
      expect(points).toBeLessThanOrEqual(previous);
      previous = points;
    }
  });
});
