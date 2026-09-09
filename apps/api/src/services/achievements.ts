import type { PoolClient } from 'pg';
import type { Achievement, GameMode } from '@6mansdle/shared';
import { ACHIEVEMENTS, ACHIEVEMENT_MAP, RANKS } from '@6mansdle/shared';

const ACHIEVEMENT_ORDER = new Map(ACHIEVEMENTS.map((a, i) => [a.id, i]));

/** Everything evaluateAchievements needs to decide what a guess just unlocked. */
export interface AchievementSnapshot {
  mode: GameMode;
  correct: boolean;
  /** False for a repeat guess on a clip the user already answered — it earns nothing new. */
  counted: boolean;
  /** Counted guesses across both modes, including this one. */
  totalCountedGuesses: number;
  /** Counted correct guesses across both modes, including this one. */
  totalCorrectGuesses: number;
  /** Daily streak after this guess. Only meaningful when mode === 'daily'. */
  dailyStreakCurrent: number;
  /** Endless run after this guess. Only meaningful when mode === 'endless'. */
  endlessRunCurrent: number;
  /** Distinct ranks correctly guessed, including this one if it was correct. */
  distinctRanksCorrect: number;
  /** UTC hour (0-23) the guess was made. Only meaningful when mode === 'daily'. */
  guessHourUtc: number;
  /** True if the user's most recent daily guess before this one was wrong. */
  previousDailyWrong: boolean;
}

/**
 * Pure decision function: given a snapshot of a user's state right after a guess, and the set
 * of achievement ids they already hold, returns the newly-earned ids (in catalogue order).
 * `contributor` is never returned here — it's awarded from the clip-approval path, not a guess.
 */
export function evaluateAchievements(snapshot: AchievementSnapshot, alreadyEarned: ReadonlySet<string>): string[] {
  const earned: string[] = [];
  const award = (id: string, condition: boolean) => {
    if (condition && !alreadyEarned.has(id)) earned.push(id);
  };

  award('first_guess', snapshot.totalCountedGuesses >= 1);
  award('first_correct', snapshot.totalCorrectGuesses >= 1);
  award('guesses_100', snapshot.totalCountedGuesses >= 100);
  award('guesses_500', snapshot.totalCountedGuesses >= 500);

  award('daily_streak_3', snapshot.mode === 'daily' && snapshot.dailyStreakCurrent >= 3);
  award('daily_streak_7', snapshot.mode === 'daily' && snapshot.dailyStreakCurrent >= 7);
  award('daily_streak_30', snapshot.mode === 'daily' && snapshot.dailyStreakCurrent >= 30);

  award('endless_run_5', snapshot.mode === 'endless' && snapshot.endlessRunCurrent >= 5);
  award('endless_run_10', snapshot.mode === 'endless' && snapshot.endlessRunCurrent >= 10);
  award('sharpshooter', snapshot.mode === 'endless' && snapshot.endlessRunCurrent >= 10);
  award('endless_run_25', snapshot.mode === 'endless' && snapshot.endlessRunCurrent >= 25);

  award('all_ranks_correct', snapshot.distinctRanksCorrect >= RANKS.length);

  award('night_owl', snapshot.mode === 'daily' && snapshot.guessHourUtc >= 0 && snapshot.guessHourUtc < 5);
  award('early_bird', snapshot.mode === 'daily' && snapshot.guessHourUtc >= 5 && snapshot.guessHourUtc < 9);
  award('comeback', snapshot.mode === 'daily' && snapshot.correct && snapshot.previousDailyWrong);

  return earned.sort((a, b) => ACHIEVEMENT_ORDER.get(a)! - ACHIEVEMENT_ORDER.get(b)!);
}

/** Ids the user already holds. Cheap: primary-key lookup on user_achievements. */
export async function getEarnedAchievementIds(client: PoolClient, userId: number): Promise<Set<string>> {
  const { rows } = await client.query<{ achievement_id: string }>(
    'SELECT achievement_id FROM user_achievements WHERE user_id = $1',
    [userId],
  );
  return new Set(rows.map((r) => r.achievement_id));
}

/** Inserts newly-earned rows, ignoring ones already present (belt-and-suspenders with the caller's own check). */
async function insertAchievements(client: PoolClient, userId: number, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await client.query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     SELECT $1, id FROM unnest($2::text[]) AS id
     ON CONFLICT (user_id, achievement_id) DO NOTHING`,
    [userId, ids],
  );
}

interface GuessAchievementArgs {
  userId: number;
  mode: GameMode;
  correct: boolean;
  counted: boolean;
  /** Daily streak after this guess (from applyDailyResult), when mode === 'daily'. */
  dailyStreakCurrent?: number;
  /** Endless run after this guess (from applyEndlessResult/readRun), when mode === 'endless'. */
  endlessRunCurrent?: number;
  now?: Date;
}

/**
 * DB-facing half of the guess flow: gathers the cheap bits of a snapshot from the stats tables
 * (never scans `guesses` for totals — user_daily_stats/user_endless_stats already track them),
 * runs the pure evaluator, and persists anything new. Call inside the guess transaction, after
 * the streak/run update and the guess row insert (comeback and all_ranks_correct both look at
 * the just-inserted row).
 */
export async function awardGuessAchievements(client: PoolClient, args: GuessAchievementArgs): Promise<Achievement[]> {
  const { userId, mode, correct, counted, now = new Date() } = args;
  const alreadyEarned = await getEarnedAchievementIds(client, userId);

  const [dailyStats, endlessStats] = await Promise.all([
    client.query<{ played: number; correct: number }>('SELECT played, correct FROM user_daily_stats WHERE user_id = $1', [userId]),
    client.query<{ played: number; correct: number }>('SELECT played, correct FROM user_endless_stats WHERE user_id = $1', [userId]),
  ]);
  const d = dailyStats.rows[0] ?? { played: 0, correct: 0 };
  const e = endlessStats.rows[0] ?? { played: 0, correct: 0 };

  // Only pay for the per-rank-correct count when it could still matter.
  let distinctRanksCorrect = 0;
  if (!alreadyEarned.has('all_ranks_correct') && counted && correct) {
    const { rows } = await client.query<{ n: number }>(
      'SELECT COUNT(DISTINCT actual_rank)::int AS n FROM guesses WHERE user_id = $1 AND is_correct AND counted',
      [userId],
    );
    distinctRanksCorrect = rows[0]?.n ?? 0;
  }

  // Only pay for the "was the previous daily wrong" lookup when comeback could still trigger.
  let previousDailyWrong = false;
  if (!alreadyEarned.has('comeback') && mode === 'daily' && correct) {
    const { rows } = await client.query<{ is_correct: boolean }>(
      `SELECT is_correct FROM guesses WHERE user_id = $1 AND mode = 'daily'
        ORDER BY created_at DESC OFFSET 1 LIMIT 1`,
      [userId],
    );
    previousDailyWrong = rows[0] ? !rows[0].is_correct : false;
  }

  const snapshot: AchievementSnapshot = {
    mode,
    correct,
    counted,
    totalCountedGuesses: d.played + e.played,
    totalCorrectGuesses: d.correct + e.correct,
    dailyStreakCurrent: args.dailyStreakCurrent ?? 0,
    endlessRunCurrent: args.endlessRunCurrent ?? 0,
    distinctRanksCorrect,
    guessHourUtc: now.getUTCHours(),
    previousDailyWrong,
  };

  const newIds = evaluateAchievements(snapshot, alreadyEarned);
  await insertAchievements(client, userId, newIds);
  return newIds.map((id) => ACHIEVEMENT_MAP.get(id)!);
}

/** Awarded from the clip-approval path, not the guess flow. Idempotent. */
export async function awardContributor(client: PoolClient, userId: number): Promise<void> {
  await insertAchievements(client, userId, ['contributor']);
}
