-- A challenge link a signed-in player creates from an endless clip they've already guessed.
-- Anyone opening the link plays the same clip, then sees how they did against the creator.
CREATE TABLE IF NOT EXISTS challenges (
  id            SERIAL PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  clip_id       UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  creator_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_guess TEXT NOT NULL CHECK (creator_guess IN ('S','X','A','B+','B','C','D','E','H')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
);
-- Creating a challenge is idempotent per (creator, clip): a second POST returns the same row.
CREATE UNIQUE INDEX IF NOT EXISTS challenges_creator_clip_uniq ON challenges (creator_id, clip_id);

-- One row per person who opened the link and guessed. Guests may attempt freely (no identity to
-- dedupe on); a signed-in user gets exactly one attempt, enforced by the partial unique index.
CREATE TABLE IF NOT EXISTS challenge_attempts (
  id           BIGSERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guessed_rank TEXT NOT NULL CHECK (guessed_rank IN ('S','X','A','B+','B','C','D','E','H')),
  is_correct   BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS challenge_attempts_challenge_idx ON challenge_attempts (challenge_id);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_attempts_user_uniq ON challenge_attempts (challenge_id, user_id)
  WHERE user_id IS NOT NULL;
