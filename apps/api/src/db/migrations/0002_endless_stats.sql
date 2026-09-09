-- Endless-mode run streaks and totals, maintained incrementally like user_daily_stats.
CREATE TABLE IF NOT EXISTS user_endless_stats (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_run INTEGER NOT NULL DEFAULT 0,
  best_run    INTEGER NOT NULL DEFAULT 0,
  played      INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A repeat guess on a clip the user has already seen is stored but excluded from stats.
ALTER TABLE guesses ADD COLUMN IF NOT EXISTS counted BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS guesses_user_clip_idx ON guesses (user_id, clip_id) WHERE user_id IS NOT NULL;
