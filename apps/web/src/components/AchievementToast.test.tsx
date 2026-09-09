import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Achievement } from '@6mansdle/shared';
import { AchievementToast } from './AchievementToast';

const onFire: Achievement = {
  id: 'endless_run_10',
  name: 'On Fire',
  description: '10 in a row.',
  emoji: '🔥',
  tier: 'silver',
};

describe('AchievementToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there are no new achievements', () => {
    const { container } = render(<AchievementToast achievements={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces an unlocked achievement via aria-live', () => {
    render(<AchievementToast achievements={[onFire]} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText(/Achievement unlocked/)).toBeInTheDocument();
    expect(screen.getByText('On Fire')).toBeInTheDocument();
  });

  it('auto-dismisses after a few seconds', () => {
    render(<AchievementToast achievements={[onFire]} />);
    expect(screen.getByText('On Fire')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('On Fire')).not.toBeInTheDocument();
  });

  it('can be dismissed immediately by the close button', () => {
    render(<AchievementToast achievements={[onFire]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('On Fire')).not.toBeInTheDocument();
  });
});
