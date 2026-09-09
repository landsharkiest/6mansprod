import type { GameMode, GuessResponse, Rank } from '@6mansdle/shared';
import { rankDistance } from '@6mansdle/shared';
import { withTransaction } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { utcToday } from '../lib/dates.js';
import { clipStats, getClip } from './clips.js';
import { applyDailyResult, getOrCreateDaily } from './daily.js';
import { applyEndlessResult, readRun } from './endless.js';
import { awardGuessAchievements } from './achievements.js';

interface SubmitArgs {
  clipId: string;
  guessedRank: Rank;
  mode: GameMode;
  userId: number | null;
}

/**
 * Records a guess and returns the verdict. The server is the only party that knows the rank,
 * so correctness is decided here and never trusted from the client.
 *
 * A signed-in user's repeat guess on a clip they have already answered is stored for the
 * distribution but excluded from streaks, runs, and accuracy (`counted = false`).
 */
export async function submitGuess({ clipId, guessedRank, mode, userId }: SubmitArgs): Promise<GuessResponse> {
  const today = utcToday();
  const daily = mode === 'daily' ? await getOrCreateDaily(today) : null;
  if (daily && daily.clip.id !== clipId) throw badRequest("That clip is not today's daily challenge");

  return withTransaction(async (client) => {
    const clip = await getClip(client, clipId);
    if (!clip || clip.status !== 'approved') throw notFound('Clip not found');

    const correct = clip.rank === guessedRank;

    if (daily && userId !== null) {
      const dup = await client.query('SELECT 1 FROM guesses WHERE daily_id = $1 AND user_id = $2', [daily.id, userId]);
      if (dup.rowCount) throw conflict("You've already played today's daily");
    }

    let counted = true;
    if (userId !== null) {
      const seen = await client.query('SELECT 1 FROM guesses WHERE user_id = $1 AND clip_id = $2 LIMIT 1', [userId, clip.id]);
      counted = !seen.rowCount;
    }

    await client.query(
      `INSERT INTO guesses (clip_id, user_id, daily_id, mode, guessed_rank, actual_rank, is_correct, counted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [clip.id, userId, daily?.id ?? null, mode, guessedRank, clip.rank, correct, counted],
    );

    let streak: GuessResponse['streak'];
    let run: GuessResponse['run'];
    let newAchievements: GuessResponse['newAchievements'] = [];
    if (userId !== null) {
      if (daily) {
        // The daily is answered once per user, so it always counts.
        streak = await applyDailyResult(client, userId, today, correct);
      } else {
        run = counted ? await applyEndlessResult(client, userId, correct) : await readRun(client, userId);
      }
      newAchievements = await awardGuessAchievements(client, {
        userId,
        mode,
        correct,
        counted,
        dailyStreakCurrent: streak?.current,
        endlessRunCurrent: run?.current,
      });
    }

    const stats = await clipStats(client, clip);
    return {
      correct,
      guessedRank,
      actualRank: clip.rank,
      distance: rankDistance(guessedRank, clip.rank),
      stats,
      counted,
      newAchievements,
      ...(streak ? { streak } : {}),
      ...(run ? { run } : {}),
    };
  });
}
