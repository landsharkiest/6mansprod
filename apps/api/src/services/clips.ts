import type { ClipStats, PlayableClip, Rank, RankCount } from '@6mansdle/shared';
import { RANKS } from '@6mansdle/shared';
import { pool, type Queryable } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { playbackUrl } from './storage.js';

export interface ClipRow {
  id: string;
  s3_key: string;
  rank: Rank;
  status: 'pending' | 'approved' | 'rejected';
  content_type: string;
}

export async function getClip(db: Queryable, id: string): Promise<ClipRow | null> {
  const { rows } = await db.query<ClipRow>(
    'SELECT id, s3_key, rank, status, content_type FROM clips WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function toPlayable(clip: ClipRow): Promise<PlayableClip> {
  return { clipId: clip.id, videoUrl: await playbackUrl(clip.s3_key), contentType: clip.content_type };
}

/** A random approved clip, avoiding the one the player just saw when there is any alternative. */
export async function pickRandomApprovedClip(excludeId?: string): Promise<ClipRow> {
  const { rows } = await pool.query<ClipRow>(
    `SELECT id, s3_key, rank, status, content_type
       FROM clips
      WHERE status = 'approved' AND upload_completed
      ORDER BY (id = $1) ASC, random()
      LIMIT 1`,
    [excludeId ?? null],
  );
  const clip = rows[0];
  if (!clip) throw notFound('No approved clips available yet');
  return clip;
}

export async function clipStats(db: Queryable, clip: Pick<ClipRow, 'id' | 'rank'>): Promise<ClipStats> {
  const { rows } = await db.query<{ guessed_rank: Rank; count: number }>(
    'SELECT guessed_rank, COUNT(*)::int AS count FROM guesses WHERE clip_id = $1 GROUP BY guessed_rank',
    [clip.id],
  );
  const counts = new Map(rows.map((r) => [r.guessed_rank, r.count]));
  const distribution: RankCount[] = RANKS.map((rank) => ({ rank, count: counts.get(rank) ?? 0 }));
  const totalGuesses = distribution.reduce((sum, d) => sum + d.count, 0);
  const correctGuesses = counts.get(clip.rank) ?? 0;
  return {
    clipId: clip.id,
    actualRank: clip.rank,
    totalGuesses,
    correctGuesses,
    accuracy: totalGuesses ? Math.round((correctGuesses / totalGuesses) * 1000) / 10 : 0,
    distribution,
  };
}
