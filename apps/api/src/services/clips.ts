import type { AdminClip, ClipStats, PlayableClip, Rank, RankCount } from '@6mansdle/shared';
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

/**
 * A random approved clip, avoiding the one the player just saw when there is any alternative.
 * Clips pulled by the auto-hide safeguard are excluded from rotation.
 */
export async function pickRandomApprovedClip(excludeId?: string): Promise<ClipRow> {
  const { rows } = await pool.query<ClipRow>(
    `SELECT id, s3_key, rank, status, content_type
       FROM clips
      WHERE status = 'approved' AND upload_completed AND NOT hidden
      ORDER BY (id = $1) ASC, random()
      LIMIT 1`,
    [excludeId ?? null],
  );
  const clip = rows[0];
  if (!clip) throw notFound('No approved clips available yet');
  return clip;
}


/**
 * A random approved clip excluding a whole set of ids (e.g. everything already served in a
 * blitz run, so a normal-length run doesn't repeat itself). Falls back to any approved clip
 * once every clip has been excluded, so a run never dead-ends just because the pool is small.
 */
export async function pickRandomApprovedClipExcluding(excludeIds: readonly string[]): Promise<ClipRow> {
  const { rows } = await pool.query<ClipRow>(
    `SELECT id, s3_key, rank, status, content_type
       FROM clips
      WHERE status = 'approved' AND upload_completed AND NOT hidden AND NOT (id = ANY($1::uuid[]))
      ORDER BY random()
      LIMIT 1`,
    [excludeIds],
  );
  if (rows[0]) return rows[0];
  // Every approved clip has already been shown this run -- recycle the pool rather than error out.
  return pickRandomApprovedClip();
}

/** Row shape for the admin clip list and for a clip joined onto an admin report. */
export interface AdminClipRow {
  id: string;
  s3_key: string;
  rank: Rank;
  status: AdminClip['status'];
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  reviewed_at: string | null;
  uploader_id: number | null;
  uploader_name: string | null;
  hidden: boolean;
}

export const ADMIN_CLIP_SELECT = `
  SELECT c.id, c.s3_key, c.rank, c.status, c.original_filename, c.content_type, c.size_bytes,
         c.created_at, c.reviewed_at, c.uploader_id, u.username AS uploader_name, c.hidden
    FROM clips c LEFT JOIN users u ON u.id = c.uploader_id`;

export async function toAdminClip(r: AdminClipRow & { uploader_approved?: number; uploader_rejected?: number }): Promise<AdminClip> {
  return {
    id: r.id,
    rank: r.rank,
    status: r.status,
    originalFilename: r.original_filename,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    createdAt: new Date(r.created_at).toISOString(),
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
    uploader: r.uploader_id !== null ? { id: r.uploader_id, username: r.uploader_name ?? 'unknown' } : null,
    videoUrl: await playbackUrl(r.s3_key),
    hidden: r.hidden,
    ...(r.uploader_approved !== undefined || r.uploader_rejected !== undefined
      ? { uploaderStats: { approved: r.uploader_approved ?? 0, rejected: r.uploader_rejected ?? 0 } }
      : {}),
  };
}

/** Select used by the admin clip list: adds each clip's uploader's approved/rejected counts so
 * the review queue can flag a spammy uploader at a glance. */
export const ADMIN_CLIP_SELECT_WITH_UPLOADER_STATS = `
  SELECT c.id, c.s3_key, c.rank, c.status, c.original_filename, c.content_type, c.size_bytes,
         c.created_at, c.reviewed_at, c.uploader_id, u.username AS uploader_name, c.hidden,
         (SELECT COUNT(*)::int FROM clips c2 WHERE c2.uploader_id = c.uploader_id AND c2.status = 'approved') AS uploader_approved,
         (SELECT COUNT(*)::int FROM clips c2 WHERE c2.uploader_id = c.uploader_id AND c2.status = 'rejected') AS uploader_rejected
    FROM clips c LEFT JOIN users u ON u.id = c.uploader_id`;

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
