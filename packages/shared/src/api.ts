import type { Rank } from './ranks.js';

export type GameMode = 'endless' | 'daily';
export type ClipStatus = 'pending' | 'approved' | 'rejected';

export interface PublicUser {
  id: number;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface MeResponse {
  user: PublicUser | null;
}

/** A clip handed to a player. Never carries the rank. */
export interface PlayableClip {
  clipId: string;
  videoUrl: string;
  contentType: string;
}

export interface RankCount {
  rank: Rank;
  count: number;
}

export interface ClipStats {
  clipId: string;
  actualRank: Rank;
  totalGuesses: number;
  correctGuesses: number;
  accuracy: number;
  distribution: RankCount[];
}

export interface GuessRequest {
  clipId: string;
  rank: Rank;
  mode: GameMode;
}

export interface GuessResponse {
  correct: boolean;
  guessedRank: Rank;
  actualRank: Rank;
  distance: number;
  stats: ClipStats;
  /** False when the user had already guessed this clip: recorded, but not counted toward stats. */
  counted: boolean;
  /** Daily streak, present for daily guesses by logged-in users. */
  streak?: { current: number; best: number };
  /** Endless run (consecutive correct), present for endless guesses by logged-in users. */
  run?: { current: number; best: number };
}

export interface DailyResponse {
  date: string;
  clip: PlayableClip;
  /** Populated when the caller already guessed today. */
  result: GuessResponse | null;
}

export interface OverallStats {
  totalGuesses: number;
  correctGuesses: number;
  accuracy: number;
  approvedClips: number;
  perRank: Array<{ rank: Rank; totalGuesses: number; correctGuesses: number }>;
}

export type LeaderboardSort = 'streak' | 'best' | 'accuracy' | 'played';

export interface LeaderboardEntry {
  user: Pick<PublicUser, 'id' | 'username' | 'avatarUrl'>;
  /** Daily: current day streak. Endless: current run of consecutive correct guesses. */
  currentStreak: number;
  bestStreak: number;
  played: number;
  correct: number;
  accuracy: number;
}

export interface LeaderboardResponse {
  mode: GameMode;
  sort: LeaderboardSort;
  /** Plays required before a user is listed on the accuracy sort. */
  minPlaysForAccuracy: number;
  entries: LeaderboardEntry[];
}

export interface HistoryEntry {
  id: number;
  clipId: string;
  mode: GameMode;
  guessedRank: Rank;
  actualRank: Rank;
  isCorrect: boolean;
  createdAt: string;
}

/** One calendar day (UTC) of activity for the profile heatmap. */
export interface ActivityDay {
  date: string;
  /** Counted guesses across all modes. */
  guesses: number;
  daily: 'none' | 'correct' | 'wrong';
}

export interface UserProfile {
  user: PublicUser;
  /** Last 365 days, oldest first, days with no activity omitted. */
  activity: ActivityDay[];
  memberSince: string;
  totals: { guesses: number; correct: number; accuracy: number };
  daily: { played: number; correct: number; currentStreak: number; bestStreak: number };
  endless: { played: number; correct: number; currentRun: number; bestRun: number };
  recent: HistoryEntry[];
}

export interface PresignUploadRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
  rank: Rank;
}

export interface PresignUploadResponse {
  clipId: string;
  uploadUrl: string;
  /** Headers the browser must send with the PUT. */
  headers: Record<string, string>;
}

export interface AdminClip {
  id: string;
  rank: Rank;
  status: ClipStatus;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  uploader: Pick<PublicUser, 'id' | 'username'> | null;
  reviewedAt: string | null;
  videoUrl: string;
  /** Pulled from rotation by the auto-hide safeguard (>= 3 open reports from distinct users). */
  hidden: boolean;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export const REPORT_REASONS = ['wrong_rank', 'rank_visible', 'bad_quality', 'not_6mans', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  wrong_rank: 'Wrong rank',
  rank_visible: 'Rank is visible in the clip',
  bad_quality: 'Bad video quality',
  not_6mans: 'Not a 6mans clip',
  other: 'Other',
};

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface ReportClipRequest {
  reason: ReportReason;
  /** Only meaningful when reason is 'wrong_rank', but accepted regardless. */
  suggestedRank?: Rank;
  /** Max 300 chars. */
  note?: string;
}

/** What the reporter gets back after filing a report. */
export interface ClipReport {
  id: number;
  clipId: string;
  reason: ReportReason;
  suggestedRank: Rank | null;
  note: string | null;
  status: ReportStatus;
  createdAt: string;
}

/** A report as seen in the admin queue, joined with the clip it targets. */
export interface AdminReport {
  id: number;
  clip: AdminClip;
  reason: ReportReason;
  suggestedRank: Rank | null;
  note: string | null;
  status: ReportStatus;
  createdAt: string;
  reporter: Pick<PublicUser, 'id' | 'username'> | null;
}

export type ResolveReportAction = 'fix_rank' | 'reject_clip' | 'dismiss';

export interface ResolveReportRequest {
  action: ResolveReportAction;
  /** Required when action is 'fix_rank'. */
  rank?: Rank;
}

export interface ResolveReportResponse {
  clipId: string;
  /** How many open reports on that clip (including this one) were closed. */
  resolvedCount: number;
}
