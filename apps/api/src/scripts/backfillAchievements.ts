/**
 * One-off backfill: awards achievements to existing users from data that predates the
 * achievements feature, so early players aren't penalised for having played before badges
 * existed.
 *
 * Rather than re-scanning every guess row per user, this reuses the same aggregate stats
 * tables the live guess flow uses (user_daily_stats.best_streak, user_endless_stats.best_run,
 * etc.), plus a handful of set-returning queries for the achievements that depend on specific
 * guess events (time-of-day, comeback, contributor). It feeds those into the same pure
 * `evaluateAchievements` the API uses per-guess — called once per "category" of condition per
 * user, threading the running earned-set through each call — so the awarding logic never
 * drifts from the live path.
 *
 * Run with: npx tsx src/scripts/backfillAchievements.ts
 */
import { RANKS } from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import { evaluateAchievements, type AchievementSnapshot } from '../services/achievements.js';

const NEUTRAL_HOUR = 12; // outside both the night-owl and early-bird windows

async function main(): Promise<void> {
  const [users, dailyStats, endlessStats, ranksCorrect, nightOwlUsers, earlyBirdUsers, comebackUsers, contributors, alreadyEarnedRows] =
    await Promise.all([
      pool.query<{ id: number }>('SELECT id FROM users'),
      pool.query<{ user_id: number; played: number; correct: number; best_streak: number }>(
        'SELECT user_id, played, correct, best_streak FROM user_daily_stats',
      ),
      pool.query<{ user_id: number; played: number; correct: number; best_run: number }>(
        'SELECT user_id, played, correct, best_run FROM user_endless_stats',
      ),
      pool.query<{ user_id: number; n: number }>(
        `SELECT user_id, COUNT(DISTINCT actual_rank)::int AS n
           FROM guesses WHERE is_correct AND counted AND user_id IS NOT NULL
          GROUP BY user_id`,
      ),
      pool.query<{ user_id: number }>(
        `SELECT DISTINCT user_id FROM guesses
          WHERE mode = 'daily' AND counted AND user_id IS NOT NULL
            AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') BETWEEN 0 AND 4`,
      ),
      pool.query<{ user_id: number }>(
        `SELECT DISTINCT user_id FROM guesses
          WHERE mode = 'daily' AND counted AND user_id IS NOT NULL
            AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') BETWEEN 5 AND 8`,
      ),
      pool.query<{ user_id: number }>(
        `SELECT DISTINCT user_id FROM (
           SELECT user_id, is_correct,
                  LAG(is_correct) OVER (PARTITION BY user_id ORDER BY created_at) AS prev_correct
             FROM guesses WHERE mode = 'daily' AND counted AND user_id IS NOT NULL
         ) t WHERE is_correct AND prev_correct = false`,
      ),
      pool.query<{ uploader_id: number }>(
        `SELECT DISTINCT uploader_id FROM clips WHERE status = 'approved' AND uploader_id IS NOT NULL`,
      ),
      pool.query<{ user_id: number; achievement_id: string }>('SELECT user_id, achievement_id FROM user_achievements'),
    ]);

  const byUser = <T extends { user_id: number }>(rows: T[]) => new Map(rows.map((r) => [r.user_id, r]));
  const daily = byUser(dailyStats.rows);
  const endless = byUser(endlessStats.rows);
  const ranks = byUser(ranksCorrect.rows);
  const nightOwl = new Set(nightOwlUsers.rows.map((r) => r.user_id));
  const earlyBird = new Set(earlyBirdUsers.rows.map((r) => r.user_id));
  const comeback = new Set(comebackUsers.rows.map((r) => r.user_id));
  const contributor = new Set(contributors.rows.map((r) => r.uploader_id));

  const alreadyEarnedByUser = new Map<number, Set<string>>();
  for (const row of alreadyEarnedRows.rows) {
    if (!alreadyEarnedByUser.has(row.user_id)) alreadyEarnedByUser.set(row.user_id, new Set());
    alreadyEarnedByUser.get(row.user_id)!.add(row.achievement_id);
  }

  const userIds: number[] = [];
  const achievementIds: string[] = [];
  let usersAwarded = 0;

  for (const { id: userId } of users.rows) {
    const earned = new Set(alreadyEarnedByUser.get(userId) ?? []);
    const d = daily.get(userId) ?? { played: 0, correct: 0, best_streak: 0 };
    const e = endless.get(userId) ?? { played: 0, correct: 0, best_run: 0 };
    const totalCountedGuesses = d.played + e.played;
    const totalCorrectGuesses = d.correct + e.correct;
    const distinctRanksCorrect = ranks.get(userId)?.n ?? 0;

    const baseSnapshot: Omit<AchievementSnapshot, 'mode' | 'guessHourUtc' | 'correct' | 'previousDailyWrong' | 'dailyStreakCurrent' | 'endlessRunCurrent'> = {
      counted: true,
      totalCountedGuesses,
      totalCorrectGuesses,
      distinctRanksCorrect,
    };

    const applyAndCollect = (snapshot: AchievementSnapshot) => {
      const newIds = evaluateAchievements(snapshot, earned);
      for (const id of newIds) earned.add(id);
      return newIds;
    };

    // Count/streak/run milestones — mode only needs to match whichever field we're testing.
    applyAndCollect({
      ...baseSnapshot,
      mode: 'daily',
      correct: false,
      previousDailyWrong: false,
      guessHourUtc: NEUTRAL_HOUR,
      dailyStreakCurrent: d.best_streak,
      endlessRunCurrent: 0,
    });
    applyAndCollect({
      ...baseSnapshot,
      mode: 'endless',
      correct: false,
      previousDailyWrong: false,
      guessHourUtc: NEUTRAL_HOUR,
      dailyStreakCurrent: 0,
      endlessRunCurrent: e.best_run,
    });

    if (nightOwl.has(userId)) {
      applyAndCollect({ ...baseSnapshot, mode: 'daily', correct: false, previousDailyWrong: false, guessHourUtc: 2, dailyStreakCurrent: 0, endlessRunCurrent: 0 });
    }
    if (earlyBird.has(userId)) {
      applyAndCollect({ ...baseSnapshot, mode: 'daily', correct: false, previousDailyWrong: false, guessHourUtc: 6, dailyStreakCurrent: 0, endlessRunCurrent: 0 });
    }
    if (comeback.has(userId)) {
      applyAndCollect({ ...baseSnapshot, mode: 'daily', correct: true, previousDailyWrong: true, guessHourUtc: NEUTRAL_HOUR, dailyStreakCurrent: 0, endlessRunCurrent: 0 });
    }
    if (contributor.has(userId) && !earned.has('contributor')) {
      earned.add('contributor');
    }

    const originallyEarned = alreadyEarnedByUser.get(userId) ?? new Set();
    const newlyEarned = [...earned].filter((id) => !originallyEarned.has(id));
    if (newlyEarned.length > 0) {
      usersAwarded += 1;
      for (const id of newlyEarned) {
        userIds.push(userId);
        achievementIds.push(id);
      }
    }
  }

  if (userIds.length > 0) {
    await pool.query(
      `INSERT INTO user_achievements (user_id, achievement_id)
       SELECT * FROM unnest($1::int[], $2::text[])
       ON CONFLICT (user_id, achievement_id) DO NOTHING`,
      [userIds, achievementIds],
    );
  }

  logger.info(
    { usersConsidered: users.rows.length, usersAwarded, rowsInserted: userIds.length, rankCount: RANKS.length },
    'backfill complete',
  );
}

main()
  .then(() => pool.end())
  .catch((err) => {
    logger.error({ err }, 'backfill failed');
    return pool.end().finally(() => process.exit(1));
  });
