import type { PublicUser } from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { config } from '../config.js';

export interface UserRow {
  id: number;
  discord_id: string;
  username: string;
  avatar_hash: string | null;
  is_admin: boolean;
}

export function avatarUrl(discordId: string, hash: string | null): string | null {
  if (!hash) return null;
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${ext}?size=128`;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    avatarUrl: avatarUrl(row.discord_id, row.avatar_hash),
    isAdmin: row.is_admin,
  };
}

/** Insert or refresh a user from a Discord profile. Admin flag follows ADMIN_DISCORD_IDS. */
export async function upsertDiscordUser(profile: {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
}): Promise<UserRow> {
  const isAdmin = config.ADMIN_DISCORD_IDS.includes(profile.id);
  const displayName = profile.global_name || profile.username;
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (discord_id, username, avatar_hash, is_admin)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_id) DO UPDATE
       SET username = EXCLUDED.username,
           avatar_hash = EXCLUDED.avatar_hash,
           is_admin = EXCLUDED.is_admin,
           last_seen_at = now()
     RETURNING id, discord_id, username, avatar_hash, is_admin`,
    [profile.id, displayName, profile.avatar, isAdmin],
  );
  return rows[0]!;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, discord_id, username, avatar_hash, is_admin FROM users WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function findUserByDiscordId(discordId: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, discord_id, username, avatar_hash, is_admin FROM users WHERE discord_id = $1',
    [discordId],
  );
  return rows[0] ?? null;
}
