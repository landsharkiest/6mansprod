import type { PresignUploadResponse, Rank } from '@6mansdle/shared';
import { config } from './config.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function botFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.API_ORIGIN}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.BOT_API_TOKEN}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || `${res.status} ${res.statusText}`);
  }
  // Some endpoints (e.g. complete) return a small body; all of them return JSON.
  return (await res.json()) as T;
}

export interface PresignRequest {
  discordId: string;
  username: string;
  avatar: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  rank: Rank;
}

export function presignUpload(req: PresignRequest): Promise<PresignUploadResponse> {
  return botFetch<PresignUploadResponse>('/api/bot/uploads/presign', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export interface CompleteUploadResponse {
  clipId: string;
  status: 'pending';
}

export function completeUpload(discordId: string, clipId: string): Promise<CompleteUploadResponse> {
  return botFetch<CompleteUploadResponse>(`/api/bot/uploads/${encodeURIComponent(clipId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({ discordId }),
  });
}

export interface BotDailyResponse {
  date: string;
  number: number;
  playedCount: number;
  url: string;
}

export function fetchDaily(): Promise<BotDailyResponse> {
  return botFetch<BotDailyResponse>('/api/bot/daily');
}

export interface BotUploadSummary {
  id: string;
  rank: Rank;
  status: string;
  originalFilename: string;
  createdAt: string;
}

export function fetchUploads(discordId: string): Promise<BotUploadSummary[]> {
  return botFetch<BotUploadSummary[]>(`/api/bot/uploads?discordId=${encodeURIComponent(discordId)}`);
}

/** Streams a Discord CDN attachment straight into the presigned S3 PUT — never buffers it locally. */
export async function uploadToPresignedUrl(cdnUrl: string, presign: PresignUploadResponse, contentType: string): Promise<void> {
  const source = await fetch(cdnUrl);
  if (!source.ok || !source.body) {
    throw new Error(`Failed to fetch attachment from Discord: ${source.status} ${source.statusText}`);
  }
  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    // duplex is required by undici when streaming a body, but isn't in the lib.dom RequestInit
    // typings yet — cast narrowly rather than losing type-checking on the rest of the call.
    ...({ duplex: 'half' } as Record<string, unknown>),
    headers: { ...presign.headers, 'Content-Type': contentType },
    body: source.body,
  });
  if (!put.ok) {
    const body = await put.text().catch(() => '');
    throw new Error(`Upload PUT failed: ${put.status} ${body}`);
  }
}
