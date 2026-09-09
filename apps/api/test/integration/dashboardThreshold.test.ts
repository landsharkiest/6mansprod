import { describe, expect, it } from 'vitest';
import { buildApp, loginAs } from '../support/client.js';
import { createClip } from '../support/factories.js';
import { pool } from '../../src/db/pool.js';

/**
 * A separate file (and so a separate module registry / dashboard cache instance -- see
 * dashboard.test.ts) so this one GET call isn't served a cached response from another test.
 */
describe('GET /api/admin/dashboard attention threshold boundary', () => {
  it('excludes a clip just under the guess-count threshold even at 0% accuracy', async () => {
    const app = buildApp();
    const admin = await loginAs(app, 'admin');
    const clip = await createClip({ status: 'approved', rank: 'D' });

    for (let i = 0; i < 19; i++) {
      await pool.query(
        `INSERT INTO guesses (clip_id, mode, guessed_rank, actual_rank, is_correct, counted)
         VALUES ($1, 'endless', 'H', 'D', FALSE, TRUE)`,
        [clip.id],
      );
    }

    const res = await admin.agent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect((res.body.attentionClips as Array<{ id: string }>).some((c) => c.id === clip.id)).toBe(false);
  });
});
