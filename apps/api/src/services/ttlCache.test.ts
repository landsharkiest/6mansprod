import { describe, expect, it } from 'vitest';
import { TtlCache } from './ttlCache.js';

describe('TtlCache', () => {
  it('returns undefined before anything is set', () => {
    const cache = new TtlCache<number>(1000, () => 0);
    expect(cache.get()).toBeUndefined();
  });

  it('returns the cached value within the TTL', () => {
    let now = 0;
    const cache = new TtlCache<string>(1000, () => now);
    cache.set('hello');
    now = 999;
    expect(cache.get()).toBe('hello');
  });

  it('expires exactly at the TTL boundary', () => {
    let now = 0;
    const cache = new TtlCache<string>(1000, () => now);
    cache.set('hello');
    now = 1000;
    expect(cache.get()).toBeUndefined();
  });

  it('expires after the TTL', () => {
    let now = 0;
    const cache = new TtlCache<string>(1000, () => now);
    cache.set('hello');
    now = 1001;
    expect(cache.get()).toBeUndefined();
  });

  it('resets the expiry on a new set', () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, () => now);
    cache.set(1);
    now = 900;
    cache.set(2);
    now = 1800;
    expect(cache.get()).toBe(2);
  });

  it('clear() forgets the cached value immediately', () => {
    let now = 0;
    const cache = new TtlCache<string>(1000, () => now);
    cache.set('hello');
    cache.clear();
    expect(cache.get()).toBeUndefined();
    now = 1;
    expect(cache.get()).toBeUndefined();
  });
});
