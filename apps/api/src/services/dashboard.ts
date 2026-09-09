import type { AdminDashboard, DashboardSeriesPoint, Rank } from '@6mansdle/shared';
import { pool } from '../db/pool.js';
import { playbackUrl } from './storage.js';

/**
 * A clip needs a second look once enough people have guessed it and hardly anyone gets it right
 * -- that pattern usually means the submitted rank is wrong rather than that the clip is just
 * hard. Kept as named constants (not magic numbers) so the SQL and the pure predicate below agree.
 */
export const ATTENTION_MIN_GUESSES = 20;
export const ATTENTION_MAX_ACCURACY = 20;

/** Pure so it's unit-testable without a database. */
export function needsAttention(totalGuesses: number, accuracy: number): boolean {
  return totalGuesses >= ATTENTION_MIN_GUESSES && accuracy < ATTENTION_MAX_ACCURACY;
}

/** yyyy-mm-dd for `daysAgo` days before `today`, in UTC. 0 = today. */
function utcDateString(today: Date, daysAgo: number): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the `days`-long (oldest first) guesses/new-users series, filling in zero for any day
 * with no rows. Pure: callers hand it day -> count maps built from SQL, so this is testable
 * without touching Postgres.
 */
export function buildDailySeries(
  today: Date,
  guessesByDay: ReadonlyMap<string, number>,
  newUsersByDay: ReadonlyMap<string, number>,
  days = 30,
): DashboardSeriesPoint[] {
  const series: DashboardSeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = utcDateString(today, i);
    series.push({ date, guesses: guessesByDay.get(date) ?? 0, newUsers: newUsersByDay.get(date) ?? 0 });
  }
  return series;
}

/**
 * Builds the full admin dashboard payload. Pure aggregation logic (the attention threshold, the
 * day-series fill) lives in the functions above so it's testable without a database; this
 * function only runs the SQL and wires the results together, mirroring communityStats.ts.
 */
export async function loadDashboard(): Promise<AdminDashboard> {
  const [countsRow, reportsRow, usersRow, guessTotals, seriesGuesses, seriesUsers, uploaderRows, attentionRows, neverPlayedRows] =
    await Promise.all([
      pool.query<{ pending: number; approved: number; rejected: number; hidden: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending' AND upload_completed)::int AS pending,
           COUNT(*) FILTER (WHERE status = 'approved' AND upload_completed)::int AS approved,
           COUNT(*) FILTER (WHERE status = 'rejected' AND upload_completed)::int AS rejected,
           COUNT(*) FILTER (WHERE hidden AND upload_completed)::int AS hidden
         FROM clips`,
      ),
      pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM clip_reports WHERE status = 'open'"),
      pool.query<{ total: number; active7d: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE last_seen_at >= now() - interval '7 days')::int AS active7d
           FROM users`,
      ),
      pool.query<{ today: number; d7: number; d30: number }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')
           )::int AS today,
           COUNT(*) FILTER (
             WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc') - interval '6 days'
           )::int AS d7,
           COUNT(*) FILTER (
             WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc') - interval '29 days'
           )::int AS d30
         FROM guesses`,
      ),
      pool.query<{ day: string; n: number }>(
        `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'utc'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
           FROM guesses
          WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc') - interval '29 days'
          GROUP BY 1`,
      ),
      pool.query<{ day: string; n: number }>(
        `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'utc'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
           FROM users
          WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc') - interval '29 days'
          GROUP BY 1`,
      ),
      pool.query<{ id: number; username: string; approved_count: number }>(
        `SELECT u.id, u.username, COUNT(*)::int AS approved_count
           FROM clips c JOIN users u ON u.id = c.uploader_id
          WHERE c.status = 'approved' AND c.upload_completed
          GROUP BY u.id, u.username
          ORDER BY approved_count DESC, u.username ASC
          LIMIT 10`,
      ),
      pool.query<{ id: string; rank: Rank; s3_key: string; total: number; correct: number }>(
        `SELECT c.id, c.rank, c.s3_key,
                COUNT(g.id)::int AS total,
                COUNT(g.id) FILTER (WHERE g.is_correct)::int AS correct
           FROM clips c JOIN guesses g ON g.clip_id = c.id AND g.counted
          WHERE c.status = 'approved' AND c.upload_completed
          GROUP BY c.id, c.rank, c.s3_key
         HAVING COUNT(g.id) >= $1
          ORDER BY (COUNT(g.id) FILTER (WHERE g.is_correct))::float / COUNT(g.id) ASC
          LIMIT 20`,
        [ATTENTION_MIN_GUESSES],
      ),
      pool.query<{ id: string; rank: Rank; s3_key: string; created_at: string }>(
        `SELECT c.id, c.rank, c.s3_key, c.created_at
           FROM clips c
      LEFT JOIN guesses g ON g.clip_id = c.id
          WHERE c.status = 'approved' AND c.upload_completed AND g.id IS NULL
          ORDER BY c.created_at ASC
          LIMIT 20`,
      ),
    ]);

  const counts = countsRow.rows[0]!;
  const userTotals = usersRow.rows[0]!;
  const guessTotalsRow = guessTotals.rows[0]!;

  const guessesByDay = new Map(seriesGuesses.rows.map((r) => [r.day, r.n]));
  const newUsersByDay = new Map(seriesUsers.rows.map((r) => [r.day, r.n]));

  const attentionClips = (
    await Promise.all(
      attentionRows.rows.map(async (r) => {
        const accuracy = r.total ? Math.round((r.correct / r.total) * 1000) / 10 : 0;
        return { id: r.id, rank: r.rank, accuracy, guesses: r.total, videoUrl: await playbackUrl(r.s3_key) };
      }),
    )
  ).filter((clip) => needsAttention(clip.guesses, clip.accuracy));

  const neverPlayedClips = await Promise.all(
    neverPlayedRows.rows.map(async (r) => ({
      id: r.id,
      rank: r.rank,
      createdAt: new Date(r.created_at).toISOString(),
      videoUrl: await playbackUrl(r.s3_key),
    })),
  );

  return {
    counts: {
      pendingClips: counts.pending,
      approvedClips: counts.approved,
      rejectedClips: counts.rejected,
      hiddenClips: counts.hidden,
      openReports: reportsRow.rows[0]!.n,
      usersTotal: userTotals.total,
      usersActive7d: userTotals.active7d,
      guessesToday: guessTotalsRow.today,
      guesses7d: guessTotalsRow.d7,
      guesses30d: guessTotalsRow.d30,
    },
    series: buildDailySeries(new Date(), guessesByDay, newUsersByDay),
    topUploaders: uploaderRows.rows.map((r) => ({ id: r.id, username: r.username, approvedCount: r.approved_count })),
    attentionClips,
    neverPlayedClips,
  };
}
