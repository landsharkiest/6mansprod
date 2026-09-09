import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';

const BEARER_PREFIX = 'Bearer ';

/** Constant-time compare of two strings of possibly-different length. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so pad the shorter buffer first. The padding
  // guarantees a mismatch is still reported, without leaking the true length via an early return.
  const length = Math.max(bufA.length, bufB.length, 1);
  const paddedA = Buffer.alloc(length);
  const paddedB = Buffer.alloc(length);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return bufA.length === bufB.length && timingSafeEqual(paddedA, paddedB);
}

/**
 * Gates the server-to-server /api/bot/* routes behind a shared secret the bot presents as
 * `Authorization: Bearer <token>`. When BOT_API_TOKEN isn't configured, the integration is
 * considered off and every request answers 503 rather than pretending to authenticate.
 */
export function requireBotToken(req: Request, _res: Response, next: NextFunction): void {
  if (!config.BOT_API_TOKEN) {
    next(new HttpError(503, 'The Discord bot integration is not configured'));
    return;
  }
  const header = req.header('authorization') ?? '';
  const token = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : '';
  if (!token || !safeEqual(token, config.BOT_API_TOKEN)) {
    next(new HttpError(401, 'Invalid bot token'));
    return;
  }
  next();
}
