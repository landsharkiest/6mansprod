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
  /** Ordinal day number since the first daily challenge, first day = 1. */
  number: number;
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
}

export interface ApiError {
  error: string;
  details?: unknown;
}
