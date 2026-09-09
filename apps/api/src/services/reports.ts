import type { PoolClient } from 'pg';
import type { AdminReport, ClipReport, Rank, ReportReason, ReportStatus, ResolveReportAction } from '@6mansdle/shared';
import { pool, withTransaction, type Queryable } from '../db/pool.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { ADMIN_CLIP_SELECT, toAdminClip, type AdminClipRow } from './clips.js';

/** A clip hidden from rotation once this many distinct signed-in users have an open report on it. */
export const HIDE_THRESHOLD = 3;

/** Pure decision the auto-hide safeguard is built on, kept separate so it's trivially testable. */
export function shouldHideClip(distinctOpenReporters: number): boolean {
  return distinctOpenReporters >= HIDE_THRESHOLD;
}

interface ReportRow {
  id: number;
  clip_id: string;
  reason: ReportReason;
  suggested_rank: Rank | null;
  note: string | null;
  status: ReportStatus;
  created_at: string;
}

function toClipReport(r: ReportRow): ClipReport {
  return {
    id: r.id,
    clipId: r.clip_id,
    reason: r.reason,
    suggestedRank: r.suggested_rank,
    note: r.note,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

interface SubmitReportArgs {
  clipId: string;
  userId: number;
  reason: ReportReason;
  suggestedRank: Rank | null;
  note: string | null;
}

/**
 * Files a report on a clip. Only a user who has already guessed the clip may report it, and a
 * signed-in user may have only one open report per clip. When enough distinct users have an open
 * report on a clip it's pulled from rotation (see `applyAutoHide`).
 */
export async function submitReport(args: SubmitReportArgs): Promise<ClipReport> {
  return withTransaction(async (client) => {
    const clip = await client.query('SELECT 1 FROM clips WHERE id = $1', [args.clipId]);
    if (!clip.rowCount) throw notFound('Clip not found');

    const guessed = await client.query(
      'SELECT 1 FROM guesses WHERE clip_id = $1 AND user_id = $2 LIMIT 1',
      [args.clipId, args.userId],
    );
    if (!guessed.rowCount) throw forbidden('Guess this clip before reporting it');

    const dup = await client.query(
      "SELECT 1 FROM clip_reports WHERE clip_id = $1 AND user_id = $2 AND status = 'open'",
      [args.clipId, args.userId],
    );
    if (dup.rowCount) throw conflict('You already reported this clip');

    const { rows } = await client.query<ReportRow>(
      `INSERT INTO clip_reports (clip_id, user_id, reason, suggested_rank, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, clip_id, user_id, reason, suggested_rank, note, status, created_at`,
      [args.clipId, args.userId, args.reason, args.suggestedRank, args.note],
    );

    await applyAutoHide(client, args.clipId);

    return toClipReport(rows[0]!);
  });
}

/** Hides the clip once distinct-open-reporter count crosses the threshold. */
async function applyAutoHide(client: PoolClient, clipId: string): Promise<void> {
  const { rows } = await client.query<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id)::int AS count
       FROM clip_reports WHERE clip_id = $1 AND status = 'open' AND user_id IS NOT NULL`,
    [clipId],
  );
  if (shouldHideClip(rows[0]?.count ?? 0)) {
    await client.query('UPDATE clips SET hidden = TRUE WHERE id = $1', [clipId]);
  }
}

interface AdminReportRow extends AdminClipRow {
  report_id: number;
  reason: ReportReason;
  suggested_rank: Rank | null;
  note: string | null;
  report_status: ReportStatus;
  report_created_at: string;
  reporter_id: number | null;
  reporter_name: string | null;
}

export async function listReports(status: ReportStatus, db: Queryable = pool): Promise<AdminReport[]> {
  const { rows } = await db.query<AdminReportRow>(
    `SELECT r.id AS report_id, r.reason, r.suggested_rank, r.note, r.status AS report_status,
            r.created_at AS report_created_at, r.user_id AS reporter_id, ru.username AS reporter_name,
            clip.*
       FROM clip_reports r
       JOIN (${ADMIN_CLIP_SELECT}) clip ON clip.id = r.clip_id
  LEFT JOIN users ru ON ru.id = r.user_id
      WHERE r.status = $1
      ORDER BY r.created_at ASC`,
    [status],
  );

  return Promise.all(
    rows.map(async (r) => ({
      id: r.report_id,
      clip: await toAdminClip(r),
      reason: r.reason,
      suggestedRank: r.suggested_rank,
      note: r.note,
      status: r.report_status,
      createdAt: new Date(r.report_created_at).toISOString(),
      reporter: r.reporter_id !== null ? { id: r.reporter_id, username: r.reporter_name ?? 'unknown' } : null,
    })),
  );
}

interface ResolveArgs {
  reportId: number;
  action: ResolveReportAction;
  rank: Rank | null;
  adminId: number;
}

export interface ResolveResult {
  clipId: string;
  resolvedCount: number;
}

/**
 * Resolving one report closes every open report on the same clip with the same outcome, and
 * always clears `hidden` — once no open reports remain the auto-hide invariant no longer holds.
 */
export async function resolveReport(args: ResolveArgs): Promise<ResolveResult> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ clip_id: string }>(
      'SELECT clip_id FROM clip_reports WHERE id = $1',
      [args.reportId],
    );
    const report = rows[0];
    if (!report) throw notFound('Report not found');
    const clipId = report.clip_id;

    if (args.action === 'fix_rank') {
      await client.query('UPDATE clips SET rank = $2 WHERE id = $1', [clipId, args.rank]);
    } else if (args.action === 'reject_clip') {
      await client.query("UPDATE clips SET status = 'rejected' WHERE id = $1", [clipId]);
    }
    await client.query('UPDATE clips SET hidden = FALSE WHERE id = $1', [clipId]);

    const closeStatus: ReportStatus = args.action === 'dismiss' ? 'dismissed' : 'resolved';
    const closed = await client.query(
      `UPDATE clip_reports SET status = $2, resolved_by = $3, resolved_at = now()
        WHERE clip_id = $1 AND status = 'open'`,
      [clipId, closeStatus, args.adminId],
    );

    return { clipId, resolvedCount: closed.rowCount ?? 0 };
  });
}
