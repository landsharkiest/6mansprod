import { z } from 'zod';
import type { Rank, WhoGuessResponse, WhoPlayer } from '@6mansdle/shared';
import { pool, withTransaction, type Queryable } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { ClipRow } from './clips.js';

/** A player's display name, as typed by an uploader or an admin. Whitespace is collapsed. */
export const playerNameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(64));

/**
 * Returns the id of the player with this name, creating it if needed. Matching is
 * case-insensitive so "JSTN" and "jstn" don't become two players; the first spelling wins.
 */
export async function upsertPlayer(db: Queryable, name: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `WITH ins AS (
       INSERT INTO players (name) VALUES ($1)
       ON CONFLICT ((lower(name))) DO NOTHING
       RETURNING id
     )
     SELECT id FROM ins
     UNION ALL
     SELECT id FROM players WHERE lower(name) = lower($1)
     LIMIT 1`,
    [name],
  );
  return rows[0]!.id;
}

/** Visible clips in this mode: approved, uploaded, not hidden, with a verified player. */
const WHO_CLIP_WHERE = `c.status = 'approved' AND c.upload_completed AND NOT c.hidden AND c.player_id IS NOT NULL`;

/** A random clip with a verified player, avoiding the one just shown when there's any alternative. */
export async function pickRandomWhoClip(excludeId?: string): Promise<ClipRow> {
  const { rows } = await pool.query<ClipRow>(
    `SELECT c.id, c.s3_key, c.rank, c.status, c.content_type
       FROM clips c
      WHERE ${WHO_CLIP_WHERE}
      ORDER BY (c.id = $1) ASC, random()
      LIMIT 1`,
    [excludeId ?? null],
  );
  if (!rows[0]) throw notFound('No player clips available yet');
  return rows[0];
}

/**
 * Every player who appears in at least one playable clip -- the full answer space. It's the
 * same list for every clip, so it reveals nothing about which clip is whose.
 */
export async function listWhoPlayers(): Promise<WhoPlayer[]> {
  const { rows } = await pool.query<WhoPlayer>(
    `SELECT p.id, p.name FROM players p
      WHERE EXISTS (SELECT 1 FROM clips c WHERE c.player_id = p.id AND ${WHO_CLIP_WHERE})
      ORDER BY lower(p.name)`,
  );
  return rows;
}

/** Every player with how many approved clips they're in, for the admin autocomplete. */
export async function listAllPlayers(): Promise<Array<WhoPlayer & { clipCount: number }>> {
  const { rows } = await pool.query<WhoPlayer & { clipCount: number }>(
    `SELECT p.id, p.name,
            (SELECT COUNT(*)::int FROM clips c WHERE c.player_id = p.id AND c.status = 'approved') AS "clipCount"
       FROM players p ORDER BY lower(p.name)`,
  );
  return rows;
}

interface SubmitArgs {
  clipId: string;
  playerId: number;
  userId: number | null;
}

/** Records a player guess. As with rank guesses, the server alone decides correctness. */
export async function submitWhoGuess({ clipId, playerId, userId }: SubmitArgs): Promise<WhoGuessResponse> {
  return withTransaction(async (client) => {
    const { rows: clipRows } = await client.query<{ id: string; rank: Rank; player_id: number; player_name: string }>(
      `SELECT c.id, c.rank, c.player_id, p.name AS player_name
         FROM clips c JOIN players p ON p.id = c.player_id
        WHERE c.id = $1 AND ${WHO_CLIP_WHERE}`,
      [clipId],
    );
    const clip = clipRows[0];
    if (!clip) throw notFound('Clip not found');

    const { rows: guessedRows } = await client.query<WhoPlayer>('SELECT id, name FROM players WHERE id = $1', [playerId]);
    const guessed = guessedRows[0];
    if (!guessed) throw badRequest('Unknown player');

    const correct = guessed.id === clip.player_id;

    let counted = true;
    if (userId !== null) {
      const seen = await client.query('SELECT 1 FROM player_guesses WHERE user_id = $1 AND clip_id = $2 LIMIT 1', [userId, clip.id]);
      counted = !seen.rowCount;
    }

    await client.query(
      `INSERT INTO player_guesses (clip_id, user_id, guessed_player_id, actual_player_id, is_correct, counted)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [clip.id, userId, guessed.id, clip.player_id, correct, counted],
    );

    let run: WhoGuessResponse['run'];
    if (userId !== null) {
      const { rows } = counted
        ? await client.query<{ current_run: number; best_run: number }>(
            `INSERT INTO user_player_stats (user_id, current_run, best_run, played, correct)
             VALUES ($1, $2, $2, 1, $2)
             ON CONFLICT (user_id) DO UPDATE
               SET current_run = CASE WHEN $2 = 1 THEN user_player_stats.current_run + 1 ELSE 0 END,
                   best_run = GREATEST(user_player_stats.best_run,
                                       CASE WHEN $2 = 1 THEN user_player_stats.current_run + 1 ELSE 0 END),
                   played = user_player_stats.played + 1,
                   correct = user_player_stats.correct + $2,
                   updated_at = now()
             RETURNING current_run, best_run`,
            [userId, correct ? 1 : 0],
          )
        : await client.query<{ current_run: number; best_run: number }>(
            'SELECT current_run, best_run FROM user_player_stats WHERE user_id = $1',
            [userId],
          );
      run = rows[0] ? { current: rows[0].current_run, best: rows[0].best_run } : { current: 0, best: 0 };
    }

    // Grouped by the clip's *current* player so a corrected clip's accuracy reflects the fix.
    const { rows: totals } = await client.query<{ total: number; correct: number }>(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE guessed_player_id = $2)::int AS correct
         FROM player_guesses WHERE clip_id = $1`,
      [clip.id, clip.player_id],
    );
    const { rows: top } = await client.query<{ id: number; name: string; count: number }>(
      `SELECT p.id, p.name, COUNT(*)::int AS count
         FROM player_guesses g JOIN players p ON p.id = g.guessed_player_id
        WHERE g.clip_id = $1
        GROUP BY p.id, p.name
        ORDER BY count DESC, lower(p.name)
        LIMIT 5`,
      [clip.id],
    );
    const total = totals[0]!.total;

    return {
      correct,
      guessedPlayer: guessed,
      actualPlayer: { id: clip.player_id, name: clip.player_name },
      actualRank: clip.rank,
      counted,
      ...(run ? { run } : {}),
      totalGuesses: total,
      accuracy: total ? Math.round((totals[0]!.correct / total) * 1000) / 10 : 0,
      topGuesses: top.map((r) => ({ player: { id: r.id, name: r.name }, count: r.count })),
    };
  });
}
