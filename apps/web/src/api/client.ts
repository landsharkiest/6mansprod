import type {
  AdminClip,
  AdminReport,
  ChallengeGuessRequest,
  ChallengeGuessResponse,
  ChallengeResponse,
  BlitzFinishResponse,
  BlitzGuessResponse,
  BlitzLeaderboardPeriod,
  BlitzLeaderboardResponse,
  BlitzMeBestResponse,
  BlitzStartResponse,
  ClipReport,
  ClipStatus,
  CommunityStats,
  CreateChallengeRequest,
  CreateChallengeResponse,
  DailyMeta,
  DailyResponse,
  GameMode,
  GuessRequest,
  GuessResponse,
  LeaderboardResponse,
  LeaderboardSort,
  MeResponse,
  OverallStats,
  PlayableClip,
  PresignUploadRequest,
  PresignUploadResponse,
  Rank,
  ReportClipRequest,
  ReportStatus,
  ResolveReportAction,
  ResolveReportResponse,
  UserProfile,
} from '@6mansdle/shared';

const API_BASE = import.meta.env.VITE_API_ORIGIN ?? '';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(res.status, body.error ?? res.statusText, body.details);
  return body as T;
}

export const api = {
  loginUrl: `${API_BASE}/api/auth/discord`,
  me: () => request<MeResponse>('/api/auth/me'),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  randomClip: (exclude?: string) =>
    request<PlayableClip>(`/api/clips/random${exclude ? `?exclude=${encodeURIComponent(exclude)}` : ''}`),
  daily: () => request<DailyResponse>('/api/daily'),
  dailyMeta: () => request<DailyMeta>('/api/daily/meta'),
  guess: (body: GuessRequest) => request<GuessResponse>('/api/guesses', { method: 'POST', body: JSON.stringify(body) }),

  overallStats: () => request<OverallStats>('/api/stats/overall'),
  communityStats: () => request<CommunityStats>('/api/stats/community'),
  leaderboard: (mode: GameMode = 'daily', sort: LeaderboardSort = 'streak') =>
    request<LeaderboardResponse>(`/api/stats/leaderboard?mode=${mode}&sort=${sort}`),
  profile: () => request<UserProfile>('/api/me/profile'),
  userProfile: (id: number | string) => request<UserProfile>(`/api/users/${id}/profile`),

  presignUpload: (body: PresignUploadRequest) =>
    request<PresignUploadResponse>('/api/uploads/presign', { method: 'POST', body: JSON.stringify(body) }),
  completeUpload: (clipId: string) => request<{ clipId: string }>(`/api/uploads/${clipId}/complete`, { method: 'POST' }),
  myUploads: () =>
    request<Array<{ id: string; rank: Rank; status: ClipStatus; originalFilename: string; createdAt: string }>>(
      '/api/uploads/mine',
    ),

  adminClips: (status: ClipStatus) => request<AdminClip[]>(`/api/admin/clips?status=${status}`),
  reviewClip: (id: string, status: 'approved' | 'rejected', rank?: Rank) =>
    request<AdminClip>(`/api/admin/clips/${id}/review`, { method: 'POST', body: JSON.stringify({ status, rank }) }),
  deleteClip: (id: string) => request<void>(`/api/admin/clips/${id}`, { method: 'DELETE' }),

  reportClip: (clipId: string, body: ReportClipRequest) =>
    request<ClipReport>(`/api/clips/${clipId}/report`, { method: 'POST', body: JSON.stringify(body) }),

  adminReports: (status: ReportStatus = 'open') => request<AdminReport[]>(`/api/admin/reports?status=${status}`),
  resolveReport: (id: number, action: ResolveReportAction, rank?: Rank) =>
    request<ResolveReportResponse>(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ action, rank }) }),

  createChallenge: (body: CreateChallengeRequest) =>
    request<CreateChallengeResponse>('/api/challenges', { method: 'POST', body: JSON.stringify(body) }),
  challenge: (token: string) => request<ChallengeResponse>(`/api/challenges/${encodeURIComponent(token)}`),
  challengeGuess: (token: string, body: ChallengeGuessRequest) =>
    request<ChallengeGuessResponse>(`/api/challenges/${encodeURIComponent(token)}/guess`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  blitzStart: () => request<BlitzStartResponse>('/api/blitz/start', { method: 'POST' }),
  /**
   * A 410 here isn't an error to surface -- it's the server telling us the run is already over,
   * with the final summary attached. So this returns a discriminated result instead of throwing.
   */
  blitzGuess: async (runId: number, clipId: string, rank: Rank): Promise<
    { expired: false; result: BlitzGuessResponse } | { expired: true; summary: BlitzFinishResponse }
  > => {
    const res = await fetch(`${API_BASE}/api/blitz/${runId}/guess`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, rank }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 410) return { expired: true, summary: body as BlitzFinishResponse };
    if (!res.ok) throw new ApiRequestError(res.status, body.error ?? res.statusText, body.details);
    return { expired: false, result: body as BlitzGuessResponse };
  },
  blitzFinish: (runId: number) => request<BlitzFinishResponse>(`/api/blitz/${runId}/finish`, { method: 'POST' }),
  blitzLeaderboard: (period: BlitzLeaderboardPeriod = 'all') =>
    request<BlitzLeaderboardResponse>(`/api/blitz/leaderboard?period=${period}`),
  blitzMeBest: () => request<BlitzMeBestResponse>('/api/blitz/me/best'),
};

/** Upload straight to S3 with the presigned PUT, reporting progress. */
export function uploadToS3(url: string, headers: Record<string, string>, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed (network)'));
    xhr.send(file);
  });
}
