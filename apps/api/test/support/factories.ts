import { randomUUID } from 'node:crypto';
import type { Rank } from '@6mansdle/shared';
import { pool } from '../../src/db/pool.js';

export interface TestUser {
  id: number;
  discord_id: string;
  username: string;
  avatar_hash: string | null;
  is_admin: boolean;
}

export async function createUser(opts: { discordId?: string; username?: string; isAdmin?: boolean } = {}): Promise<TestUser> {
  const discordId = opts.discordId ?? `user-${randomUUID()}`;
  const username = opts.username ?? 'Test User';
  const { rows } = await pool.query<TestUser>(
    `INSERT INTO users (discord_id, username, is_admin)
     VALUES ($1, $2, $3)
     RETURNING id, discord_id, username, avatar_hash, is_admin`,
    [discordId, username, opts.isAdmin ?? false],
  );
  return rows[0]!;
}

export interface TestClip {
  id: string;
  s3_key: string;
  rank: Rank;
  status: 'pending' | 'approved' | 'rejected';
  content_type: string;
  upload_completed: boolean;
  uploader_id: number | null;
}

export async function createClip(
  opts: {
    rank?: Rank;
    status?: 'pending' | 'approved' | 'rejected';
    uploadCompleted?: boolean;
    uploaderId?: number | null;
    filename?: string;
    contentType?: string;
    sizeBytes?: number;
  } = {},
): Promise<TestClip> {
  const id = randomUUID();
  const rank = opts.rank ?? 'A';
  const status = opts.status ?? 'approved';
  const contentType = opts.contentType ?? 'video/mp4';
  const { rows } = await pool.query<TestClip>(
    `INSERT INTO clips (id, s3_key, rank, status, original_filename, content_type, size_bytes, upload_completed, uploader_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, s3_key, rank, status, content_type, upload_completed, uploader_id`,
    [
      id,
      `clips/${id}.mp4`,
      rank,
      status,
      opts.filename ?? 'clip.mp4',
      contentType,
      opts.sizeBytes ?? 1_000_000,
      opts.uploadCompleted ?? true,
      opts.uploaderId ?? null,
    ],
  );
  return rows[0]!;
}

/** An approved, playable clip — what most game-flow tests need. */
export const createApprovedClip = (rank: Rank = 'A'): Promise<TestClip> => createClip({ rank, status: 'approved' });
