import { RANKS, type Rank } from '@6mansdle/shared';

/**
 * If a filename starts with a rank and an underscore ("B+_clip.mp4", "s_ranked.mov"), returns
 * that rank so the bulk-upload row can pre-fill it. Case-insensitive; returns undefined when the
 * filename doesn't follow the convention.
 */
export function rankFromFilename(filename: string): Rank | undefined {
  const underscore = filename.indexOf('_');
  if (underscore <= 0) return undefined;
  const prefix = filename.slice(0, underscore).toUpperCase();
  return RANKS.find((rank) => rank.toUpperCase() === prefix);
}

export interface QueueTask<T> {
  id: string;
  run: () => Promise<T>;
}

export type QueueOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Runs `tasks` with at most `concurrency` in flight at once. A failing task doesn't stop the
 * others -- its outcome is reported via `onSettle` and the queue moves on, so one bad upload in
 * a batch of fifty doesn't block the rest. Pure aside from invoking the tasks/callback, so it's
 * testable with fake tasks and no real network or timers.
 */
export async function runQueue<T>(
  tasks: readonly QueueTask<T>[],
  concurrency: number,
  onSettle?: (id: string, outcome: QueueOutcome<T>) => void,
): Promise<void> {
  let next = 0;
  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));

  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      try {
        const value = await task.run();
        onSettle?.(task.id, { ok: true, value });
      } catch (error) {
        onSettle?.(task.id, { ok: false, error });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
