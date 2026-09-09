const DAILY_POST_UTC_HOUR = 0;
const DAILY_POST_UTC_MINUTE = 5;

/** `now`'s UTC calendar day as `YYYY-MM-DD`, used to make sure we post at most once per day. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * True once `now` has reached (or passed) today's 00:05 UTC and today hasn't posted yet.
 * `lastFiredDay` is the UTC day (`YYYY-MM-DD`) of the last successful post, or null if none yet.
 * Pure and timer-free so it's trivial to unit test with arbitrary `now`/`lastFiredDay` pairs.
 */
export function shouldFireDaily(now: Date, lastFiredDay: string | null): boolean {
  if (lastFiredDay === utcDay(now)) return false;
  const todaysPostTime = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    DAILY_POST_UTC_HOUR,
    DAILY_POST_UTC_MINUTE,
    0,
    0,
  );
  return now.getTime() >= todaysPostTime;
}

/** The next 00:05 UTC at or after `now` (today's if it hasn't happened yet, otherwise tomorrow's). */
export function nextDailyPostTime(now: Date): Date {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_POST_UTC_HOUR, DAILY_POST_UTC_MINUTE, 0, 0),
  );
  if (today.getTime() > now.getTime()) return today;
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;

/**
 * Polls with a plain `setInterval` (deliberately no cron dependency) and fires `onFire` once,
 * the first time each UTC day's tick lands at or after 00:05 UTC. A misfire — the process being
 * down at exactly 00:05 — still catches up on the very next tick, since `shouldFireDaily` only
 * cares about "have we posted today yet", not an exact instant.
 */
export class DailyScheduler {
  private lastFiredDay: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly onFire: () => void | Promise<void>,
    private readonly pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Exposed for tests; runs one poll iteration synchronously (onFire is still awaited async). */
  tick(): void {
    const now = this.now();
    if (!shouldFireDaily(now, this.lastFiredDay)) return;
    this.lastFiredDay = utcDay(now);
    void this.onFire();
  }
}
