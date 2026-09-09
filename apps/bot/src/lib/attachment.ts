/** The same three video types the API accepts (see apps/api/src/services/storage.ts). */
export const ALLOWED_CONTENT_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

export interface AttachmentInput {
  contentType: string | null | undefined;
  size: number;
}

/** Returns null when the attachment is acceptable, or a user-facing reason it isn't. */
export function validateAttachment(attachment: AttachmentInput, maxBytes: number): string | null {
  if (!attachment.contentType || !ALLOWED_CONTENT_TYPES.has(attachment.contentType)) {
    return 'Attach an mp4, webm, or mov clip.';
  }
  if (!Number.isFinite(attachment.size) || attachment.size <= 0) {
    return 'That attachment has no readable size.';
  }
  if (attachment.size > maxBytes) {
    const maxMb = Math.floor(maxBytes / (1024 * 1024));
    return `That clip is too large — keep it under ${maxMb} MB.`;
  }
  return null;
}
