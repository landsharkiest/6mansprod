-- Blitz mode: 90-second timed runs. One row per run, guest or signed-in.
-- expires_at is the authoritative end-of-run instant (started_at + 90s). A separate 5s grace
-- window is applied only when *checking* whether a run is still active (server clock skew /
-- in-flight requests near the deadline) -- it is never added to expires_at itself, so the run's
-- real scored duration is always exactly 90s minus any wrong-answer penalties.
CREATE TABLE IF NOT EXISTS blitz_runs (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  current_clip_id  UUID REFERENCES clips(id),
  clip_served_at   TIMESTAMPTZ,
  score            INTEGER NOT NULL DEFAULT 0,
  correct_count    INTEGER NOT NULL DEFAULT 0,
  total_count      INTEGER NOT NULL DEFAULT 0,
  best_streak      INTEGER NOT NULL DEFAULT 0,
  current_streak   INTEGER NOT NULL DEFAULT 0,
  finished_at      TIMESTAMPTZ,
  seen_clip_ids    JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS blitz_runs_user_score_idx ON blitz_runs (user_id, score DESC);
CREATE INDEX IF NOT EXISTS blitz_runs_finished_at_idx ON blitz_runs (finished_at);

ALTER TABLE guesses DROP CONSTRAINT IF EXISTS guesses_mode_check;
ALTER TABLE guesses ADD CONSTRAINT guesses_mode_check CHECK (mode IN ('endless', 'daily', 'blitz'));
