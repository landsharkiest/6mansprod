-- Player-flagged clip issues, reviewed by admins.
CREATE TABLE IF NOT EXISTS clip_reports (
  id             SERIAL PRIMARY KEY,
  clip_id        UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason         TEXT NOT NULL CHECK (reason IN ('wrong_rank', 'rank_visible', 'bad_quality', 'not_6mans', 'other')),
  suggested_rank TEXT CHECK (suggested_rank IN ('S','X','A','B+','B','C','D','E','H')),
  note           TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS clip_reports_status_idx ON clip_reports (status);
CREATE INDEX IF NOT EXISTS clip_reports_clip_idx ON clip_reports (clip_id);

-- A signed-in user may have at most one open report per clip.
CREATE UNIQUE INDEX IF NOT EXISTS clip_reports_open_user_uniq ON clip_reports (clip_id, user_id)
  WHERE status = 'open' AND user_id IS NOT NULL;

-- Auto-hide safeguard: clips with enough open reports are pulled from rotation until an admin
-- resolves the queue. Kept separate from `status` so review history (approved/rejected) is untouched.
ALTER TABLE clips ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
