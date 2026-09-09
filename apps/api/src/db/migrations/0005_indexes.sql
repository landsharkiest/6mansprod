-- Indexes for hot query paths, added during a hardening pass. `guesses(clip_id)` and
-- `guesses(user_id, created_at DESC)` already exist from 0001, so they're not repeated here.

-- pickRandomApprovedClip / getOrCreateDaily / community "approved clip count" all filter on the
-- same three columns together (status = 'approved' AND upload_completed AND NOT hidden). The
-- existing clips_status_idx (0001) only covers `status` under a partial WHERE upload_completed,
-- so a query that also excludes hidden clips can't use it as tightly. This composite lets the
-- planner satisfy all three predicates from the index alone.
CREATE INDEX IF NOT EXISTS clips_visible_idx ON clips (status, upload_completed, hidden);

-- Leaderboard sort/filter (routes/stats.ts) filters on `played >= $1` for every mode and sort
-- option before applying ORDER BY. These tables are one row per user, so as the user base grows
-- this keeps the filter step index-backed instead of a sequential scan of every player's stats.
CREATE INDEX IF NOT EXISTS user_daily_stats_played_idx ON user_daily_stats (played) WHERE played > 0;
CREATE INDEX IF NOT EXISTS user_endless_stats_played_idx ON user_endless_stats (played) WHERE played > 0;
