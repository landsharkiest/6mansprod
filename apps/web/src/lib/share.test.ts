import { describe, expect, it } from 'vitest';
import { buildBlitzShareText, buildProfileShareText, buildShareText } from './share';

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

describe('buildBlitzShareText', () => {
  it('formats score, accuracy, and best streak', () => {
    const text = buildBlitzShareText({ score: 780, correctCount: 6, totalCount: 8, bestStreak: 4 });
    expect(text.split('\n')).toEqual([
      '6mansdle Blitz ⚡',
      '780 pts · 6/8 correct',
      '🔥 best streak 4',
      'https://6mansdle.com/blitz',
    ]);
  });

  it('ends with the blitz URL by default', () => {
    const text = buildBlitzShareText({ score: 100, correctCount: 1, totalCount: 1, bestStreak: 1 });
    expect(text.endsWith('https://6mansdle.com/blitz')).toBe(true);
  });

  it('accepts a custom url', () => {
    const text = buildBlitzShareText({ score: 100, correctCount: 1, totalCount: 1, bestStreak: 1, url: 'https://example.com/blitz' });
    expect(text.endsWith('https://example.com/blitz')).toBe(true);
  });

  it('never includes a clip id or any clip-identifying field', () => {
    const text = buildBlitzShareText({ score: 500, correctCount: 4, totalCount: 5, bestStreak: 3 });
    expect(text).not.toMatch(/clip/i);
  });

  it('handles a zero score / zero correct run', () => {
    const text = buildBlitzShareText({ score: 0, correctCount: 0, totalCount: 2, bestStreak: 0 });
    expect(text).toContain('0 pts · 0/2 correct');
    expect(text).toContain('🔥 best streak 0');
  });
});

describe('buildProfileShareText', () => {
  const base = { username: 'Ranger', accuracy: 63.4, bestStreak: 12, bestRun: 30, badgeCount: 5 } as const;

  it('formats username, accuracy, best streak, best run, and badge count', () => {
    const text = buildProfileShareText(base);
    expect(text.split('\n')).toEqual([
      'Ranger on 6mansdle',
      '63.4% accuracy · 🔥 best streak 12 · best run 30',
      '🎖️ 5 badges',
      'https://6mansdle.com',
    ]);
  });

  it('includes the top strength line when given', () => {
    const text = buildProfileShareText({ ...base, topStrength: 'S' });
    expect(text).toContain('💪 strongest at S');
  });

  it('omits the top strength line when not given', () => {
    const text = buildProfileShareText(base);
    expect(text).not.toContain('strongest');
  });

  it('uses singular "badge" for a count of 1', () => {
    const text = buildProfileShareText({ ...base, badgeCount: 1 });
    expect(text).toContain('🎖️ 1 badge');
    expect(text).not.toContain('1 badges');
  });

  it('handles a zero badge count', () => {
    const text = buildProfileShareText({ ...base, badgeCount: 0 });
    expect(text).toContain('🎖️ 0 badges');
  });

  it('ends with the default profile URL', () => {
    const text = buildProfileShareText(base);
    expect(text.endsWith('https://6mansdle.com')).toBe(true);
  });

  it('accepts a custom url', () => {
    const text = buildProfileShareText({ ...base, url: 'https://example.com/u/42' });
    expect(text.endsWith('https://example.com/u/42')).toBe(true);
  });

  it('never includes a clip id or any clip-identifying field', () => {
    const text = buildProfileShareText({ ...base, topStrength: 'A' });
    expect(text).not.toMatch(/clip/i);
  });
});
