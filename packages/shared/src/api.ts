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
  /** Present for daily guesses by logged-in users. */
  streak?: { current: number; best: number };
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

export interface LeaderboardEntry {
  user: Pick<PublicUser, 'id' | 'username' | 'avatarUrl'>;
  currentStreak: number;
  bestStreak: number;
  dailyPlayed: number;
  dailyCorrect: number;
  accuracy: number;
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

export interface UserProfile {
  user: PublicUser;
  totals: { guesses: number; correct: number; accuracy: number };
  daily: { played: number; correct: number; currentStreak: number; bestStreak: number };
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
