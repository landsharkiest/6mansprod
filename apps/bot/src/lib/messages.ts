export interface DailyMetaLike {
  date: string;
  number: number;
  playedCount: number;
  url: string;
}

/** The scheduled announcement posted into DAILY_CHANNEL_ID at 00:05 UTC. */
export function formatDailyAnnouncement(meta: Pick<DailyMetaLike, 'number' | 'url'>): string {
  return `New 6mansdle daily #${meta.number} is live: ${meta.url}`;
}

/** The public reply to `/daily`. */
export function formatDailyReply(meta: DailyMetaLike): string {
  const plays = meta.playedCount === 1 ? '1 person has' : `${meta.playedCount} people have`;
  return `**6mansdle Daily #${meta.number}** — ${meta.date}\n${plays} played so far. ${meta.url}`;
}

/** The ephemeral reply after a `/submit` upload completes. */
export function formatSubmitReply(rank: string): string {
  return `Submitted for review as rank ${rank}`;
}

export interface UploadSummaryLike {
  rank: string;
  status: string;
  originalFilename: string;
}

/** The reply to `/myuploads`, one line per submission, most recent first (as the API returns them). */
export function formatUploadsReply(uploads: UploadSummaryLike[]): string {
  if (uploads.length === 0) return "You haven't submitted any clips yet. Use `/submit` to send one in.";
  const lines = uploads.map((u) => `• **${u.rank}** — ${u.status} (${u.originalFilename})`);
  return `Your submissions:\n${lines.join('\n')}`;
}
