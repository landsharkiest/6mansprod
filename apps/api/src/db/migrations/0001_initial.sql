-- Users authenticated through Discord.
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  discord_id   TEXT NOT NULL UNIQUE,
  username     TEXT NOT NULL,
  avatar_hash  TEXT,
  is_admin     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-side sessions (schema expected by connect-pg-simple).
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);

-- Uploaded gameplay clips. The rank lives here, never in the object key.
CREATE TABLE IF NOT EXISTS clips (
  id                UUID PRIMARY KEY,
  s3_key            TEXT NOT NULL UNIQUE,
  rank              TEXT NOT NULL CHECK (rank IN ('S','X','A','B+','B','C','D','E','H')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  original_filename TEXT NOT NULL,
  content_type      TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL,
  upload_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  uploader_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clips_status_idx ON clips (status) WHERE upload_completed;

-- One row per calendar day (UTC). Everyone gets the same clip.
CREATE TABLE IF NOT EXISTS daily_challenges (
  id         SERIAL PRIMARY KEY,
  day        DATE NOT NULL UNIQUE,
  clip_id    UUID NOT NULL REFERENCES clips(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every guess, guest or user. actual_rank is denormalised so history survives clip edits.
CREATE TABLE IF NOT EXISTS guesses (
  id           BIGSERIAL PRIMARY KEY,
  clip_id      UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  daily_id     INTEGER REFERENCES daily_challenges(id) ON DELETE SET NULL,
  mode         TEXT NOT NULL CHECK (mode IN ('endless','daily')),
  guessed_rank TEXT NOT NULL CHECK (guessed_rank IN ('S','X','A','B+','B','C','D','E','H')),
  actual_rank  TEXT NOT NULL,
  is_correct   BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guesses_clip_idx ON guesses (clip_id);
CREATE INDEX IF NOT EXISTS guesses_user_idx ON guesses (user_id, created_at DESC);
-- A logged-in user may answer a given daily exactly once.
CREATE UNIQUE INDEX IF NOT EXISTS guesses_daily_user_uniq ON guesses (daily_id, user_id)
  WHERE mode = 'daily' AND user_id IS NOT NULL;

-- Streaks are maintained incrementally on daily guesses.
CREATE TABLE IF NOT EXISTS user_daily_stats (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak    INTEGER NOT NULL DEFAULT 0,
  last_played    DATE,
  played         INTEGER NOT NULL DEFAULT 0,
  correct        INTEGER NOT NULL DEFAULT 0
);
