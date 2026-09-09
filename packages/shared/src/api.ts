import type { Rank } from './ranks.js';
import type { Achievement } from './achievements.js';

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
  /** Achievements newly earned by this guess. Empty unless the caller is signed in. */
  newAchievements: Achievement[];
}

export interface DailyResponse {
  date: string;
  /** Ordinal day number since the first daily challenge, first day = 1. */
  number: number;
  clip: PlayableClip;
  /** Populated when the caller already guessed today. */
  result: GuessResponse | null;
}

/** Lightweight daily info for chips/badges — never creates today's challenge as a side effect. */
export interface DailyMeta {
  date: string;
  /** Ordinal day number since the first daily challenge, first day = 1. */
  number: number;
}

export interface OverallStats {
  totalGuesses: number;
  correctGuesses: number;
  accuracy: number;
  approvedClips: number;
  perRank: Array<{ rank: Rank; totalGuesses: number; correctGuesses: number }>;
}

/** Community-wide totals for the public stats page. Built from counted guesses only. */
export interface CommunityStatsTotals {
  totalGuesses: number;
  correctGuesses: number;
  accuracy: number;
  /** Distinct signed-in users who have made at least one counted guess. */
  players: number;
  approvedClips: number;
  guessesToday: number;
  guessesThisWeek: number;
}

export interface RankAccuracy {
  rank: Rank;
  totalGuesses: number;
  correctGuesses: number;
  accuracy: number;
}

/** One cell of the actual-rank x guessed-rank confusion matrix. */
export interface ConfusionCell {
  actualRank: Rank;
  guessedRank: Rank;
  count: number;
}

/**
 * A clip's difficulty summary. Deliberately carries no clip id: the play endpoints hand out ids,
 * so pairing an id with its rank here would let a player look up the answer before guessing.
 */
export interface ClipDifficulty {
  actualRank: Rank;
  totalGuesses: number;
  accuracy: number;
}

/**
 * Average signed rank-distance of guesses for one actual rank (RANKS order: index 0 = best).
 * Positive means players tend to guess a *better* rank than the truth (overrated);
 * negative means they tend to guess *worse* (underrated).
 */
export interface RankBias {
  rank: Rank;
  avgSignedDistance: number;
}

export interface CommunityStats {
  totals: CommunityStatsTotals;
  perRank: RankAccuracy[];
  confusionMatrix: ConfusionCell[];
  hardestClips: ClipDifficulty[];
  easiestClips: ClipDifficulty[];
  mostOverratedRank: RankBias | null;
  mostUnderratedRank: RankBias | null;
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
  /** Earned achievements only; cross-reference against the ACHIEVEMENTS catalogue for the rest. */
  achievements: Array<{ id: string; earnedAt: string }>;
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

export interface CreateChallengeRequest {
  clipId: string;
}

export interface CreateChallengeResponse {
  token: string;
  /** Full shareable URL, e.g. https://6mansdle.com/c/AbCd12eFgH34. */
  url: string;
}

/** What the caller already knows about their own attempt, before the reveal. */
export interface ChallengeAttempt {
  guessedRank: Rank;
  isCorrect: boolean;
}

/**
 * Only present once the caller has attempted the challenge (or is re-fetching after they have).
 * Never sent before that — the whole point of a challenge is guessing blind first.
 */
export interface ChallengeReveal {
  actualRank: Rank;
  creatorGuess: Rank;
  creatorCorrect: boolean;
  /** How everyone who has taken this challenge guessed. */
  distribution: RankCount[];
}

export interface ChallengeResponse {
  /** Never carries the rank — same contract as a normal playable clip. */
  clip: PlayableClip;
  creator: Pick<PublicUser, 'username' | 'avatarUrl'>;
  /** Total people who have guessed on this challenge so far. */
  attempts: number;
  expired: boolean;
  myAttempt: ChallengeAttempt | null;
  reveal: ChallengeReveal | null;
}

export interface ChallengeGuessRequest {
  rank: Rank;
}

export interface ChallengeGuessResponse {
  correct: boolean;
  actualRank: Rank;
  distance: number;
  creatorGuess: Rank;
  creatorCorrect: boolean;
  youBeatCreator: boolean;
  /** How everyone who has taken this challenge guessed, including this attempt. */
  distribution: RankCount[];
  /** Same global clip stats a normal endless guess returns. */
  stats: ClipStats;
}

export type ChallengeVerdict = 'beat' | 'tie' | 'lost';

/**
 * Compares the challenge-taker's correctness against the creator's original guess. Pure and
 * shared so the API (for `youBeatCreator`) and the web result panel (for its verdict text) agree.
 */
export function challengeVerdict(myCorrect: boolean, creatorCorrect: boolean): ChallengeVerdict {
  if (myCorrect === creatorCorrect) return 'tie';
  return myCorrect ? 'beat' : 'lost';
}

// ---------------------------------------------------------------------------------------------
// Blitz: 90-second timed mode. All scoring is server-authoritative -- clients only ever display
// what the server already computed, they never submit elapsed time or points themselves.
// ---------------------------------------------------------------------------------------------

/** Score/accuracy/streak summary for one blitz run, shared by /finish, the 410 body, and /me/best. */
export interface BlitzRunSummary {
  runId: number;
  score: number;
  correctCount: number;
  totalCount: number;
  bestStreak: number;
}

export interface BlitzStartResponse {
  runId: number;
  /** ISO timestamp; the run is authoritatively over once the server clock passes this. */
  endsAt: string;
  clip: PlayableClip;
}

export interface BlitzGuessRequest {
  clipId: string;
  rank: Rank;
}

export interface BlitzGuessResponse {
  correct: boolean;
  actualRank: Rank;
  /** Points awarded for this guess (0 for a wrong guess). */
  points: number;
  score: number;
  correctCount: number;
  totalCount: number;
  currentStreak: number;
  bestStreak: number;
  /** Updated end-of-run instant (a wrong guess shortens it by the time penalty). */
  endsAt: string;
  /** Null once the run has ended -- there is nothing left to play. */
  nextClip: PlayableClip | null;
  /** True if this guess ended the run (time penalty pushed it past now, or it was already over). */
  finished: boolean;
}

export interface BlitzFinishResponse extends BlitzRunSummary {
  finishedAt: string;
}

export type BlitzLeaderboardPeriod = 'today' | 'week' | 'all';

export interface BlitzLeaderboardEntry {
  user: Pick<PublicUser, 'id' | 'username' | 'avatarUrl'>;
  score: number;
  correctCount: number;
  totalCount: number;
  bestStreak: number;
  finishedAt: string;
}

export interface BlitzLeaderboardResponse {
  period: BlitzLeaderboardPeriod;
  entries: BlitzLeaderboardEntry[];
}

export interface BlitzMeBestResponse {
  best: BlitzRunSummary | null;
}
