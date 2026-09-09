import { describe, expect, it } from 'vitest';
import { buildShareText } from './share';

const base = { number: 42, date: '2026-09-09' } as const;

describe('buildShareText', () => {
  it('formats a correct guess', () => {
    const text = buildShareText({ ...base, correct: true, guessedRank: 'B', actualRank: 'B', distance: 0 });
    expect(text).toBe(['6mansdle #42 · 2026-09-09', '🟩 B  (correct)', 'https://6mansdle.com/daily'].join('\n'));
  });

  it('formats a wrong guess one rank off', () => {
    const text = buildShareText({ ...base, correct: false, guessedRank: 'A', actualRank: 'B+', distance: 1 });
    expect(text).toContain('🟥 A → 🟩 B+  (1 rank off)');
  });

  it('formats a wrong guess several ranks off with plural wording', () => {
    const text = buildShareText({ ...base, correct: false, guessedRank: 'S', actualRank: 'H', distance: 8 });
    expect(text).toContain('🟥 S → 🟩 H  (8 ranks off)');
  });

  it('formats every possible distance with correct singular/plural wording', () => {
    for (let distance = 1; distance <= 8; distance++) {
      const text = buildShareText({ ...base, correct: false, guessedRank: 'X', actualRank: 'H', distance });
      const expected = distance === 1 ? '1 rank off' : `${distance} ranks off`;
      expect(text).toContain(`(${expected})`);
    }
  });

  it('includes a streak line when a positive streak is given', () => {
    const text = buildShareText({ ...base, correct: true, guessedRank: 'S', actualRank: 'S', distance: 0, streak: 5 });
    expect(text.split('\n')).toEqual(['6mansdle #42 · 2026-09-09', '🟩 S  (correct)', '🔥 streak 5', 'https://6mansdle.com/daily']);
  });

  it('omits the streak line when streak is undefined (e.g. a guest)', () => {
    const text = buildShareText({ ...base, correct: true, guessedRank: 'S', actualRank: 'S', distance: 0 });
    expect(text).not.toContain('streak');
    expect(text.split('\n')).toHaveLength(3);
  });

  it('omits the streak line when streak is 0', () => {
    const text = buildShareText({ ...base, correct: false, guessedRank: 'C', actualRank: 'D', distance: 1, streak: 0 });
    expect(text).not.toContain('streak');
  });

  it('never includes a clip id or any clip-identifying field', () => {
    const text = buildShareText({ ...base, correct: true, guessedRank: 'S', actualRank: 'S', distance: 0, streak: 3 });
    expect(text).not.toMatch(/clip/i);
  });

  it('ends with the daily URL by default', () => {
    const text = buildShareText({ ...base, correct: true, guessedRank: 'S', actualRank: 'S', distance: 0 });
    expect(text.endsWith('https://6mansdle.com/daily')).toBe(true);
  });

  it('accepts a custom url', () => {
    const text = buildShareText({
      ...base,
      correct: true,
      guessedRank: 'S',
      actualRank: 'S',
      distance: 0,
      url: 'https://example.com/daily',
    });
    expect(text.endsWith('https://example.com/daily')).toBe(true);
  });

  it('leads with the daily number and date', () => {
    const text = buildShareText({ number: 7, date: '2026-01-01', correct: true, guessedRank: 'H', actualRank: 'H', distance: 0 });
    expect(text.split('\n')[0]).toBe('6mansdle #7 · 2026-01-01');
  });
});
