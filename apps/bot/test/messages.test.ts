import { describe, expect, it } from 'vitest';
import { formatDailyAnnouncement, formatDailyReply, formatSubmitReply, formatUploadsReply } from '../src/lib/messages.js';

describe('formatDailyAnnouncement', () => {
  it('includes the daily number and link', () => {
    const text = formatDailyAnnouncement({ number: 42, url: 'https://6mansdle.com/daily' });
    expect(text).toBe('New 6mansdle daily #42 is live: https://6mansdle.com/daily');
  });
});

describe('formatDailyReply', () => {
  it('pluralizes played count correctly', () => {
    const meta = { date: '2026-03-01', number: 5, playedCount: 0, url: 'https://6mansdle.com/daily' };
    expect(formatDailyReply(meta)).toContain('0 people have played');
    expect(formatDailyReply({ ...meta, playedCount: 1 })).toContain('1 person has played');
    expect(formatDailyReply({ ...meta, playedCount: 7 })).toContain('7 people have played');
  });

  it('includes the number, date, and link', () => {
    const text = formatDailyReply({ date: '2026-03-01', number: 5, playedCount: 3, url: 'https://6mansdle.com/daily' });
    expect(text).toContain('Daily #5');
    expect(text).toContain('2026-03-01');
    expect(text).toContain('https://6mansdle.com/daily');
  });
});

describe('formatSubmitReply', () => {
  it('echoes the submitted rank', () => {
    expect(formatSubmitReply('S')).toBe('Submitted for review as rank S');
    expect(formatSubmitReply('B+')).toBe('Submitted for review as rank B+');
  });
});

describe('formatUploadsReply', () => {
  it('tells the user to submit when they have nothing yet', () => {
    expect(formatUploadsReply([])).toMatch(/haven't submitted/);
  });

  it('lists rank, status, and filename per upload', () => {
    const text = formatUploadsReply([
      { rank: 'S', status: 'pending', originalFilename: 'clip1.mp4' },
      { rank: 'A', status: 'approved', originalFilename: 'clip2.mp4' },
    ]);
    expect(text).toContain('**S** — pending (clip1.mp4)');
    expect(text).toContain('**A** — approved (clip2.mp4)');
  });
});
