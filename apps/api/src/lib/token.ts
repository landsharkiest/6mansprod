import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A crypto-random, URL-safe token (default 12 chars) for share links like challenges. Rejection
 * sampling avoids the small modulo bias `byte % 62` would otherwise introduce.
 */
export function generateToken(length = 12): string {
  let out = '';
  while (out.length < length) {
    const bytes = randomBytes(length - out.length);
    for (const byte of bytes) {
      // 256 isn't a multiple of 62; discard the last partial bucket (248..255) to keep it uniform.
      if (byte >= 248) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}
