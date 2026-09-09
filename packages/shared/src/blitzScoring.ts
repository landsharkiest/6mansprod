/**
 * Pure scoring for Blitz mode. No I/O, no clocks read here -- callers pass in the
 * server-measured elapsed time so this stays trivially unit-testable and impossible to spoof
 * from the client (the server is the only party that computes `elapsedMs`).
 */

/** Total run length. */
export const BLITZ_DURATION_MS = 90_000;

/** Time subtracted from a run's `expires_at` for every wrong guess. */
export const BLITZ_WRONG_PENALTY_MS = 3_000;

/** Tolerance applied only when checking whether a run is still active, never added to real time. */
export const BLITZ_GRACE_MS = 5_000;

/** Points guaranteed for any correct guess, before the speed bonus. */
export const BLITZ_BASE_POINTS = 100;

/** Maximum extra points for answering instantly. */
export const BLITZ_MAX_SPEED_BONUS = 50;

/** Window (from when the clip was served) over which the speed bonus decays to zero. */
export const BLITZ_SPEED_BONUS_WINDOW_MS = 5_000;

/**
 * Points for one guess. Wrong guesses are always 0 regardless of elapsed time.
 * Correct guesses score 100 plus a bonus that decays linearly from 50 (at 0ms) to 0
 * (at BLITZ_SPEED_BONUS_WINDOW_MS and beyond): bonus = round(50 * max(0, (5 - elapsedSeconds) / 5)).
 */
export function blitzPoints(correct: boolean, elapsedMs: number): number {
  if (!correct) return 0;
  const elapsedSeconds = Math.max(0, elapsedMs) / 1000;
  const windowSeconds = BLITZ_SPEED_BONUS_WINDOW_MS / 1000;
  const fraction = Math.max(0, Math.min(1, (windowSeconds - elapsedSeconds) / windowSeconds));
  const bonus = Math.max(0, Math.min(BLITZ_MAX_SPEED_BONUS, Math.round(BLITZ_MAX_SPEED_BONUS * fraction)));
  return BLITZ_BASE_POINTS + bonus;
}
