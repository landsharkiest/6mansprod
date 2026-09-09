import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { ActivityDay } from '@6mansdle/shared';
import { ActivityCalendar } from '../../src/components/ActivityCalendar';

// The component's window always ends on the Sunday that starts the current week (see
// ActivityCalendar.tsx's `start` calculation), so "today" only lands as the very last cell when
// today itself is a Sunday. 2026-09-06 is a Sunday — using it keeps these dates unambiguous.
describe('ActivityCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders 53 weeks of cells (53 * 7 days)', () => {
    const { container } = render(<ActivityCalendar activity={[]} />);
    const cells = container.querySelectorAll('rect.activity-cell');
    expect(cells.length).toBe(53 * 7);
    const weeks = new Set(Array.from(cells).map((c) => c.getAttribute('x')));
    expect(weeks.size).toBe(53);
  });

  it('marks a correct daily day with the daily-ok class', () => {
    const activity: ActivityDay[] = [{ date: '2026-09-06', guesses: 3, daily: 'correct' }];
    const { container } = render(<ActivityCalendar activity={activity} />);
    const cell = container.querySelector('rect[data-date="2026-09-06"]');
    expect(cell).not.toBeNull();
    expect(cell?.getAttribute('class')).toContain('daily-ok');
  });

  it('marks a wrong daily day with the daily-miss class', () => {
    const activity: ActivityDay[] = [{ date: '2026-09-05', guesses: 2, daily: 'wrong' }];
    const { container } = render(<ActivityCalendar activity={activity} />);
    const cell = container.querySelector('rect[data-date="2026-09-05"]');
    expect(cell?.getAttribute('class')).toContain('daily-miss');
  });

  it('leaves a no-daily-activity day without either class', () => {
    const activity: ActivityDay[] = [{ date: '2026-09-04', guesses: 4, daily: 'none' }];
    const { container } = render(<ActivityCalendar activity={activity} />);
    const cell = container.querySelector('rect[data-date="2026-09-04"]');
    expect(cell?.getAttribute('class')).not.toContain('daily-ok');
    expect(cell?.getAttribute('class')).not.toContain('daily-miss');
  });

  it('shows a tooltip with guess count and daily result on hover', () => {
    const activity: ActivityDay[] = [{ date: '2026-09-06', guesses: 5, daily: 'correct' }];
    const { container } = render(<ActivityCalendar activity={activity} />);
    const cell = container.querySelector('rect[data-date="2026-09-06"]')!;
    fireEvent.mouseEnter(cell, { clientX: 100, clientY: 100 });
    const tip = container.querySelector('.activity-tip');
    expect(tip?.textContent).toContain('2026-09-06');
    expect(tip?.textContent).toContain('5 guesses');
    expect(tip?.textContent).toContain('Daily: correct');
  });

  it('shows "No activity" for a day with no data', () => {
    const { container } = render(<ActivityCalendar activity={[]} />);
    const cell = container.querySelector('rect[data-date="2026-09-01"]')!;
    fireEvent.mouseEnter(cell, { clientX: 0, clientY: 0 });
    const tip = container.querySelector('.activity-tip');
    expect(tip?.textContent).toContain('No activity');
  });
});
