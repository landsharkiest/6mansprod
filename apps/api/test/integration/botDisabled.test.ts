import { describe, expect, it } from 'vitest';
import { buildApp, guestClient } from '../support/client.js';

/**
 * Runs under the main integration config (vitest.integration.config.ts), which deliberately
 * leaves BOT_API_TOKEN unset — matching a real deployment that hasn't configured the bot yet.
 * The *enabled* path lives in bot.test.ts under vitest.integration.bot.config.ts, which sets it.
 */
describe('bot routes when BOT_API_TOKEN is unset', () => {
  it('503s GET /api/bot/daily', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/bot/daily');
    expect(res.status).toBe(503);
  });

  it('503s POST /api/bot/uploads/presign even with a bearer token', async () => {
    const app = buildApp();
    const res = await guestClient(app)
      .post('/api/bot/uploads/presign')
      .set('Authorization', 'Bearer anything')
      .send({});
    expect(res.status).toBe(503);
  });

  it('503s GET /api/bot/uploads', async () => {
    const app = buildApp();
    const res = await guestClient(app).get('/api/bot/uploads').query({ discordId: 'x' });
    expect(res.status).toBe(503);
  });
});
