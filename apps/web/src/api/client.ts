import type {
  AdminClip,
  ClipStatus,
  DailyResponse,
  GuessRequest,
  GuessResponse,
  LeaderboardEntry,
  MeResponse,
  OverallStats,
  PlayableClip,
  PresignUploadRequest,
  PresignUploadResponse,
  Rank,
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
  guess: (body: GuessRequest) => request<GuessResponse>('/api/guesses', { method: 'POST', body: JSON.stringify(body) }),

  overallStats: () => request<OverallStats>('/api/stats/overall'),
  leaderboard: (sort: 'streak' | 'best' | 'accuracy' | 'played' = 'streak') =>
    request<LeaderboardEntry[]>(`/api/stats/leaderboard?sort=${sort}`),
  profile: () => request<UserProfile>('/api/me/profile'),

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
