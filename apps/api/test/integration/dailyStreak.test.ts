import { describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/db/pool.js';
import { applyDailyResult } from '../../src/services/daily.js';
import { createUser } from '../support/factories.js';

/**
 * applyDailyResult is the transactional core of the daily streak. Exercised directly (inside its
 * own transaction, as production code always calls it) with explicit day strings so the streak
 * logic is tested independent of "today" and HTTP.
 */
describe('applyDailyResult streak transitions', () => {
  it('playing yesterday then today extends the streak to 2', async () => {
    const user = await createUser();
    await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-06', true));
    const result = await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-07', true));
    expect(result).toEqual({ current: 2, best: 2 });
  });

  it('skipping a day resets the streak to 1', async () => {
    const user = await createUser();
    await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-01', true));
    // Gap: no play on 09-02.
    const result = await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-03', true));
    expect(result).toEqual({ current: 1, best: 1 });
  });

  it('a wrong answer resets current to 0 but keeps the best', async () => {
    const user = await createUser();
    await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-01', true));
    await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-02', true));
    const result = await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-03', false));
    expect(result).toEqual({ current: 0, best: 2 });
  });

  it('a later correct streak cannot exceed a prior best until it does', async () => {
    const user = await createUser();
    await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-01', true));
    await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-02', true));
    await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-03', true)); // best=3
    await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-04', false)); // current=0, best=3
    const restart = await withTransaction((client) => applyDailyResult(client, user.id, '2026-09-05', true));
    expect(restart).toEqual({ current: 1, best: 3 });
  });
});
