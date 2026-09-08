import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

const s3 = new S3Client({ region: config.AWS_REGION });

const PLAY_URL_TTL_SECONDS = 15 * 60;
const UPLOAD_URL_TTL_SECONDS = 10 * 60;

export const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** Object key for a clip. Deliberately contains nothing but the id, so the URL leaks no rank. */
export function clipKey(clipId: string, contentType: string): string {
  const ext = ALLOWED_VIDEO_TYPES[contentType] ?? 'bin';
  return `clips/${clipId}.${ext}`;
}

/** URL a browser can play. Uses CloudFront when configured, otherwise a short-lived presigned S3 URL. */
export async function playbackUrl(key: string): Promise<string> {
  if (config.CDN_ORIGIN) return `${config.CDN_ORIGIN}/${key}`;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }), {
    expiresIn: PLAY_URL_TTL_SECONDS,
  });
}

/** Presigned PUT the browser uses to upload directly. Content type and length are pinned into the signature. */
export async function presignUpload(key: string, contentType: string, sizeBytes: number) {
  const command = new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return { url, headers: { 'Content-Type': contentType } };
}

/** Confirms an object exists and returns its size, or null when it was never uploaded. */
export async function headObject(key: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? '' };
  } catch (err) {
    if ((err as { name?: string }).name === 'NotFound') return null;
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
}
