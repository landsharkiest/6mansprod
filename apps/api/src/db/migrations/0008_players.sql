-- "Who's that player?" mode. Uploaders can say who is in a clip (submitted_player, free text);
-- an admin verifies it by linking the clip to a canonical row in players. Only clips with a
-- verified player_id are served in this mode.
CREATE TABLE IF NOT EXISTS players (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS players_name_lower_uniq ON players (lower(name));

ALTER TABLE clips ADD COLUMN IF NOT EXISTS submitted_player TEXT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS player_id INTEGER REFERENCES players(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS clips_player_idx ON clips (player_id) WHERE player_id IS NOT NULL;

-- Kept apart from `guesses` so rank-mode stats, streaks and leaderboards are untouched.
-- actual_player_id is denormalised so history survives a clip's player being corrected.
CREATE TABLE IF NOT EXISTS player_guesses (
  id                BIGSERIAL PRIMARY KEY,
  clip_id           UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guessed_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  actual_player_id  INTEGER REFERENCES players(id) ON DELETE SET NULL,
  is_correct        BOOLEAN NOT NULL,
  counted           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_guesses_clip_idx ON player_guesses (clip_id);
CREATE INDEX IF NOT EXISTS player_guesses_user_clip_idx ON player_guesses (user_id, clip_id) WHERE user_id IS NOT NULL;

-- Run of consecutive correct player guesses, like user_endless_stats.
CREATE TABLE IF NOT EXISTS user_player_stats (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_run INTEGER NOT NULL DEFAULT 0,
  best_run    INTEGER NOT NULL DEFAULT 0,
  played      INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
