/**
 * A single-value in-memory cache with a fixed time-to-live. Used for aggregate-heavy endpoints
 * (like community stats) where a stale-by-a-minute response is fine and recomputing on every
 * request is not. `now` is injectable so tests can control time without faking timers.
 */
export class TtlCache<T> {
  private value: T | undefined;
  private expiresAt = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns the cached value if it hasn't expired, otherwise undefined. */
  get(): T | undefined {
    return this.now() < this.expiresAt ? this.value : undefined;
  }

  /** Stores a value and resets the expiry to ttlMs from now. */
  set(value: T): void {
    this.value = value;
    this.expiresAt = this.now() + this.ttlMs;
  }
}
