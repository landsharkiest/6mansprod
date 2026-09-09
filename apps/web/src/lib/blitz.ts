/**
 * Pure helpers behind BlitzPage's countdown and running-state display. Extracted for
 * testability, same pattern as lib/countdown.ts for the daily. The server (`endsAt`) is always
 * authoritative for when a run is actually over -- these just decide what the UI should show.
 */

/** Milliseconds remaining until `endsAt`, floored at 0. */
export function msUntilEnds(endsAt: string, now: Date): number {
  return Math.max(0, new Date(endsAt).getTime() - now.getTime());
}

/** True once `now` has reached (or passed) `endsAt` -- the point the client should stop playing. */
export function isRunOver(endsAt: string, now: Date): boolean {
  return now.getTime() >= new Date(endsAt).getTime();
}

/** Formats a millisecond duration as a whole number of seconds remaining, floored at 0. */
export function secondsRemaining(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

export interface BlitzRunningState {
  score: number;
  correctCount: number;
  totalCount: number;
  currentStreak: number;
  bestStreak: number;
}

export const INITIAL_BLITZ_STATE: BlitzRunningState = {
  score: 0,
  correctCount: 0,
  totalCount: 0,
  currentStreak: 0,
  bestStreak: 0,
};

/** One guess response's worth of running totals, folded into the accumulated run state. */
export interface BlitzGuessDelta {
  score: number;
  correctCount: number;
  totalCount: number;
  currentStreak: number;
  bestStreak: number;
}

/**
 * The server already returns running totals (score, counts, streaks) with every guess, so
 * "accumulating" is really just adopting the latest server state -- but this stays a pure
 * function so the play loop's state transition is unit-testable without a live server.
 */
export function applyGuessDelta(_prev: BlitzRunningState, delta: BlitzGuessDelta): BlitzRunningState {
  return {
    score: delta.score,
    correctCount: delta.correctCount,
    totalCount: delta.totalCount,
    currentStreak: delta.currentStreak,
    bestStreak: delta.bestStreak,
  };
}
