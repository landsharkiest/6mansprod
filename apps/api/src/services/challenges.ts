import type {
  ChallengeGuessResponse,
  ChallengeResponse,
  CreateChallengeResponse,
  Rank,
  RankCount,
} from '@6mansdle/shared';
import { RANKS, challengeVerdict } from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { badRequest, conflict, gone, notFound } from '../lib/errors.js';
import { generateToken } from '../lib/token.js';
import { config } from '../config.js';
import { getClip, toPlayable } from './clips.js';
import { submitGuess } from './guesses.js';
import { toPublicUser, type UserRow } from '../auth/users.js';

/** Postgres unique_violation error code. */
const UNIQUE_VIOLATION = '23505';

function challengeUrl(token: string): string {
  return `${config.WEB_ORIGIN[0]}/c/${token}`;
}

interface ChallengeRow {
  id: number;
  token: string;
  clip_id: string;
  creator_id: number;
  creator_guess: Rank;
  expires_at: string;
}

async function loadChallengeByToken(token: string): Promise<ChallengeRow | null> {
  const { rows } = await pool.query<ChallengeRow>(
    'SELECT id, token, clip_id, creator_id, creator_guess, expires_at FROM challenges WHERE token = $1',
    [token],
  );
  return rows[0] ?? null;
}

function isExpired(row: Pick<ChallengeRow, 'expires_at'>): boolean {
  return new Date(row.expires_at).getTime() <= Date.now();
}

async function attemptDistribution(challengeId: number): Promise<RankCount[]> {
  const { rows } = await pool.query<{ guessed_rank: Rank; count: number }>(
    'SELECT guessed_rank, COUNT(*)::int AS count FROM challenge_attempts WHERE challenge_id = $1 GROUP BY guessed_rank',
    [challengeId],
  );
  const counts = new Map(rows.map((r) => [r.guessed_rank, r.count]));
  return RANKS.map((rank) => ({ rank, count: counts.get(rank) ?? 0 }));
}

interface CreateChallengeArgs {
  clipId: string;
  userId: number;
}

/**
 * Creates a challenge link from a clip the caller has already guessed, using their latest guess
 * on it as the creator's guess. Idempotent per (creator, clip): a second call returns the same
 * link rather than minting a new one.
 */
export async function createChallenge({ clipId, userId }: CreateChallengeArgs): Promise<CreateChallengeResponse> {
  const clip = await getClip(pool, clipId);
  if (!clip || clip.status !== 'approved') throw notFound('Clip not found');

  const existing = await pool.query<{ token: string }>(
    'SELECT token FROM challenges WHERE creator_id = $1 AND clip_id = $2',
    [userId, clipId],
  );
  if (existing.rows[0]) return { token: existing.rows[0].token, url: challengeUrl(existing.rows[0].token) };

  const priorGuess = await pool.query<{ guessed_rank: Rank }>(
    'SELECT guessed_rank FROM guesses WHERE clip_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1',
    [clipId, userId],
  );
  const creatorGuess = priorGuess.rows[0]?.guessed_rank;
  if (!creatorGuess) throw badRequest('Guess this clip before challenging a friend with it');

  const token = generateToken();
  // ON CONFLICT DO UPDATE (a no-op write) rather than DO NOTHING so RETURNING still gives back
  // the winning row if a concurrent request created the same (creator, clip) challenge first.
  const { rows } = await pool.query<{ token: string }>(
    `INSERT INTO challenges (token, clip_id, creator_id, creator_guess)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (creator_id, clip_id) DO UPDATE SET clip_id = EXCLUDED.clip_id
     RETURNING token`,
    [token, clipId, userId, creatorGuess],
  );
  const finalToken = rows[0]!.token;
  return { token: finalToken, url: challengeUrl(finalToken) };
}

interface GetChallengeArgs {
  token: string;
  userId: number | null;
}

/**
 * Never reveals the rank until the caller has taken the challenge themselves (checked via
 * challenge_attempts, not session state, so refreshing the page after guessing still shows the
 * reveal for signed-in players).
 */
export async function getChallenge({ token, userId }: GetChallengeArgs): Promise<ChallengeResponse> {
  const challenge = await loadChallengeByToken(token);
  if (!challenge) throw notFound('Challenge not found');

  const clip = await getClip(pool, challenge.clip_id);
  if (!clip) throw notFound('Challenge not found');

  const creatorRow = await pool.query<UserRow>(
    'SELECT id, discord_id, username, avatar_hash, is_admin FROM users WHERE id = $1',
    [challenge.creator_id],
  );
  const creatorUser = creatorRow.rows[0];
  if (!creatorUser) throw notFound('Challenge not found');
  const creator = toPublicUser(creatorUser);

  const countRow = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM challenge_attempts WHERE challenge_id = $1',
    [challenge.id],
  );

  let myAttempt: ChallengeResponse['myAttempt'] = null;
  if (userId !== null) {
    const mine = await pool.query<{ guessed_rank: Rank; is_correct: boolean }>(
      'SELECT guessed_rank, is_correct FROM challenge_attempts WHERE challenge_id = $1 AND user_id = $2',
      [challenge.id, userId],
    );
    const row = mine.rows[0];
    if (row) myAttempt = { guessedRank: row.guessed_rank, isCorrect: row.is_correct };
  }

  let reveal: ChallengeResponse['reveal'] = null;
  if (myAttempt) {
    reveal = {
      actualRank: clip.rank,
      creatorGuess: challenge.creator_guess,
      creatorCorrect: challenge.creator_guess === clip.rank,
      distribution: await attemptDistribution(challenge.id),
    };
  }

  return {
    clip: await toPlayable(clip),
    creator: { username: creator.username, avatarUrl: creator.avatarUrl },
    attempts: countRow.rows[0]?.count ?? 0,
    expired: isExpired(challenge),
    myAttempt,
    reveal,
  };
}

interface SubmitChallengeGuessArgs {
  token: string;
  guessedRank: Rank;
  userId: number | null;
}

/**
 * Records both a challenge_attempts row (this challenge specifically) and, through the normal
 * `submitGuess`, a real endless guesses row — so stats, streaks, runs and achievements all apply
 * exactly as they would from the regular endless flow.
 */
export async function submitChallengeGuess({ token, guessedRank, userId }: SubmitChallengeGuessArgs): Promise<ChallengeGuessResponse> {
  const challenge = await loadChallengeByToken(token);
  if (!challenge) throw notFound('Challenge not found');
  if (isExpired(challenge)) throw gone('This challenge has expired');

  const clip = await getClip(pool, challenge.clip_id);
  if (!clip) throw notFound('Challenge not found');

  if (userId !== null) {
    const dup = await pool.query(
      'SELECT 1 FROM challenge_attempts WHERE challenge_id = $1 AND user_id = $2',
      [challenge.id, userId],
    );
    if (dup.rowCount) throw conflict("You've already taken this challenge");
  }

  const correct = guessedRank === clip.rank;

  try {
    await pool.query(
      `INSERT INTO challenge_attempts (challenge_id, user_id, guessed_rank, is_correct)
       VALUES ($1, $2, $3, $4)`,
      [challenge.id, userId, guessedRank, correct],
    );
  } catch (err) {
    if (userId !== null && isUniqueViolation(err)) throw conflict("You've already taken this challenge");
    throw err;
  }

  const guessResult = await submitGuess({ clipId: clip.id, guessedRank, mode: 'endless', userId });

  const creatorCorrect = challenge.creator_guess === clip.rank;
  const verdict = challengeVerdict(correct, creatorCorrect);

  return {
    correct,
    actualRank: clip.rank,
    distance: guessResult.distance,
    creatorGuess: challenge.creator_guess,
    creatorCorrect,
    youBeatCreator: verdict === 'beat',
    distribution: await attemptDistribution(challenge.id),
    stats: guessResult.stats,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}
