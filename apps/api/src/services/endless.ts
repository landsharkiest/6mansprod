import type { PoolClient } from 'pg';

export interface RunState {
  current: number;
  best: number;
}

/**
 * Applies one counted endless result to a user's run. A correct guess extends the run,
 * a wrong one ends it. Call inside the guess transaction.
 */
export async function applyEndlessResult(client: PoolClient, userId: number, correct: boolean): Promise<RunState> {
  const { rows } = await client.query<{ current_run: number; best_run: number }>(
    `INSERT INTO user_endless_stats (user_id, current_run, best_run, played, correct)
     VALUES ($1, $2, $2, 1, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET current_run = CASE WHEN $3 = 1 THEN user_endless_stats.current_run + 1 ELSE 0 END,
           best_run = GREATEST(user_endless_stats.best_run,
                               CASE WHEN $3 = 1 THEN user_endless_stats.current_run + 1 ELSE 0 END),
           played = user_endless_stats.played + 1,
           correct = user_endless_stats.correct + $3,
           updated_at = now()
     RETURNING current_run, best_run`,
    [userId, correct ? 1 : 0, correct ? 1 : 0],
  );
  const r = rows[0]!;
  return { current: r.current_run, best: r.best_run };
}

/** Current run without changing it (for showing on repeat clips). */
export async function readRun(client: PoolClient, userId: number): Promise<RunState> {
  const { rows } = await client.query<{ current_run: number; best_run: number }>(
    'SELECT current_run, best_run FROM user_endless_stats WHERE user_id = $1',
    [userId],
  );
  return rows[0] ? { current: rows[0].current_run, best: rows[0].best_run } : { current: 0, best: 0 };
}
