import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ACHIEVEMENTS } from '@6mansdle/shared';
import { AchievementsSection } from './AchievementsSection';

describe('AchievementsSection', () => {
  it('renders the full catalogue and shows the earned count', () => {
    render(<AchievementsSection earned={[]} />);
    expect(screen.getByText(`0/${ACHIEVEMENTS.length}`, { exact: false })).toBeInTheDocument();
    for (const a of ACHIEVEMENTS) {
      expect(screen.getByText(a.name)).toBeInTheDocument();
    }
  });

  it('marks earned achievements as earned and the rest as locked', () => {
    const earnedIds = ['first_guess', 'first_correct'];
    render(
      <AchievementsSection
        earned={earnedIds.map((id) => ({ id, earnedAt: '2026-01-01T00:00:00.000Z' }))}
      />,
    );

    const firstGuess = screen.getByText('First Steps').closest('.achievement');
    const nightOwl = screen.getByText('Night Owl').closest('.achievement');
    expect(firstGuess).toHaveClass('earned');
    expect(firstGuess).not.toHaveClass('locked');
    expect(nightOwl).toHaveClass('locked');
    expect(nightOwl).not.toHaveClass('earned');
  });

  it('sorts earned achievements before locked ones', () => {
    render(<AchievementsSection earned={[{ id: 'contributor', earnedAt: '2026-01-01T00:00:00.000Z' }]} />);
    const names = screen.getAllByText(/.+/, { selector: '.achievement-name' }).map((el) => el.textContent);
    expect(names[0]).toBe('Contributor');
  });

  it('shows the earned date for unlocked achievements only', () => {
    render(<AchievementsSection earned={[{ id: 'first_guess', earnedAt: '2026-03-15T00:00:00.000Z' }]} />);
    const firstGuess = screen.getByText('First Steps').closest('.achievement')!;
    expect(firstGuess.querySelector('.achievement-date')).not.toBeNull();
    const nightOwl = screen.getByText('Night Owl').closest('.achievement')!;
    expect(nightOwl.querySelector('.achievement-date')).toBeNull();
  });
});
