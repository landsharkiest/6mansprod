import { describe, expect, it } from 'vitest';
import { HIDE_THRESHOLD, shouldHideClip } from './reports.js';

describe('shouldHideClip', () => {
  it('does not hide below the threshold', () => {
    expect(shouldHideClip(0)).toBe(false);
    expect(shouldHideClip(HIDE_THRESHOLD - 1)).toBe(false);
  });
  it('hides once the threshold is reached', () => {
    expect(shouldHideClip(HIDE_THRESHOLD)).toBe(true);
    expect(shouldHideClip(HIDE_THRESHOLD + 5)).toBe(true);
  });
});
