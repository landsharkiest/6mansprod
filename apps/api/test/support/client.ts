import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';

/** A fresh app instance. Cheap enough to build per test file (or per test, if isolation matters). */
export function buildApp(): Express {
  return createApp();
}

/** A cookie-jar client with no session — i.e. a guest. */
export function guestClient(app: Express) {
  return request.agent(app);
}

/**
 * Logs in via the dev-login route (only available outside production when Discord isn't
 * configured, which is how the integration env is set up) and returns an agent that carries the
 * resulting session cookie on every subsequent request.
 */
export async function loginAs(app: Express, as: 'player' | 'admin' = 'player') {
  const agent = request.agent(app);
  const res = await agent.get(`/api/auth/dev-login?as=${as}`);
  if (res.status !== 302) {
    throw new Error(`dev-login failed: ${res.status} ${res.text}`);
  }
  const me = await agent.get('/api/auth/me');
  const userId: number = me.body?.user?.id;
  if (typeof userId !== 'number') {
    throw new Error(`dev-login did not produce a session: ${JSON.stringify(me.body)}`);
  }
  return { agent, userId };
}
