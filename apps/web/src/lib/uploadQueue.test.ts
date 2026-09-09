import { describe, expect, it } from 'vitest';
import { rankFromFilename, runQueue, type QueueOutcome } from './uploadQueue';

describe('rankFromFilename', () => {
  it('reads the rank prefix before the first underscore', () => {
    expect(rankFromFilename('B+_clip.mp4')).toBe('B+');
    expect(rankFromFilename('S_ranked.mp4')).toBe('S');
    expect(rankFromFilename('H_lowest.mov')).toBe('H');
  });

  it('is case-insensitive', () => {
    expect(rankFromFilename('s_ranked.mp4')).toBe('S');
    expect(rankFromFilename('b+_clip.webm')).toBe('B+');
  });

  it('returns undefined when there is no underscore, or the prefix is not a rank', () => {
    expect(rankFromFilename('clip.mp4')).toBeUndefined();
    expect(rankFromFilename('random_clip.mp4')).toBeUndefined();
    expect(rankFromFilename('_leading.mp4')).toBeUndefined();
  });

  it('only looks at the first underscore-delimited segment', () => {
    expect(rankFromFilename('A_ranked_gameplay_clip.mp4')).toBe('A');
  });
});

describe('runQueue', () => {
  it('runs every task and reports each outcome', async () => {
    const outcomes: Record<string, QueueOutcome<number>> = {};
    const tasks = [1, 2, 3, 4, 5].map((n) => ({ id: `t${n}`, run: () => Promise.resolve(n * 10) }));

    await runQueue(tasks, 2, (id, outcome) => {
      outcomes[id] = outcome;
    });

    expect(Object.keys(outcomes)).toHaveLength(5);
    expect(outcomes.t1).toEqual({ ok: true, value: 10 });
    expect(outcomes.t5).toEqual({ ok: true, value: 50 });
  });

  it('never runs more than `concurrency` tasks at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      run: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return i;
      },
    }));

    await runQueue(tasks, 3);

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // sanity: it actually ran some in parallel, not one at a time
  });

  it('reports a failing task without stopping the others', async () => {
    const outcomes: Record<string, QueueOutcome<string>> = {};
    const tasks = [
      { id: 'ok-1', run: () => Promise.resolve('done') },
      { id: 'bad', run: () => Promise.reject(new Error('boom')) },
      { id: 'ok-2', run: () => Promise.resolve('done') },
    ];

    await runQueue(tasks, 3, (id, outcome) => {
      outcomes[id] = outcome;
    });

    expect(outcomes['ok-1']).toEqual({ ok: true, value: 'done' });
    expect(outcomes['ok-2']).toEqual({ ok: true, value: 'done' });
    expect(outcomes.bad?.ok).toBe(false);
  });

  it('handles an empty task list', async () => {
    await expect(runQueue([], 3)).resolves.toBeUndefined();
  });
});
