import type { GameMode, GuessResponse, Rank } from '@6mansdle/shared';
import { rankDistance } from '@6mansdle/shared';
import { withTransaction } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { utcToday } from '../lib/dates.js';
import { clipStats, getClip } from './clips.js';
import { applyDailyResult, getOrCreateDaily } from './daily.js';

interface SubmitArgs {
  clipId: string;
  guessedRank: Rank;
  mode: GameMode;
  userId: number | null;
}

/**
 * Records a guess and returns the verdict. The server is the only party that knows the rank,
 * so correctness is decided here and never trusted from the client.
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
      const dup = await client.query(
        'SELECT 1 FROM guesses WHERE daily_id = $1 AND user_id = $2 AND mode = $3',
        [daily.id, userId, 'daily'],
      );
      if (dup.rowCount) throw conflict("You've already played today's daily");
    }

    await client.query(
      `INSERT INTO guesses (clip_id, user_id, daily_id, mode, guessed_rank, actual_rank, is_correct)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clip.id, userId, daily?.id ?? null, mode, guessedRank, clip.rank, correct],
    );

    const streak = daily && userId !== null ? await applyDailyResult(client, userId, today, correct) : undefined;
    const stats = await clipStats(client, clip);

    return {
      correct,
      guessedRank,
      actualRank: clip.rank,
      distance: rankDistance(guessedRank, clip.rank),
      stats,
      ...(streak ? { streak } : {}),
    };
  });
}
