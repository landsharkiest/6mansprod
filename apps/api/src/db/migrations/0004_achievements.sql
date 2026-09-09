-- Earned achievements. achievement_id is a string key into the shared ACHIEVEMENTS catalogue
-- (not a foreign key: the catalogue lives in code, not in the database).
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  earned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- Backs the all_ranks_correct check (distinct ranks a user has gotten right) without a full
-- table scan per guess.
CREATE INDEX IF NOT EXISTS guesses_user_correct_rank_idx ON guesses (user_id, actual_rank)
  WHERE is_correct AND counted;
