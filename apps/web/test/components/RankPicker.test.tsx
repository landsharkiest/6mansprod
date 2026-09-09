import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RANKS } from '@6mansdle/shared';
import { RankPicker } from '../../src/components/RankPicker';

// Buttons are labelled "Guess rank <rank>" (not just the bare letter) so a screen reader
// announces something meaningful — "B" alone reads as noise.
const nameFor = (rank: string) => `Guess rank ${rank}`;

describe('RankPicker', () => {
  it('renders a button for every rank', () => {
    render(<RankPicker onPick={() => {}} />);
    for (const rank of RANKS) {
      expect(screen.getByRole('button', { name: nameFor(rank) })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button')).toHaveLength(RANKS.length);
  });

  it('calls onPick with the clicked rank', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<RankPicker onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: nameFor('S') }));
    expect(onPick).toHaveBeenCalledWith('S');
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('disables every button when disabled', () => {
    render(<RankPicker onPick={() => {}} disabled />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('marks the guessed rank with aria-pressed while the picker is still live', () => {
    render(<RankPicker onPick={() => {}} />);
    expect(screen.getByRole('button', { name: nameFor('S') })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the guessed rank with is-guess and the answer with is-answer', () => {
    render(<RankPicker onPick={() => {}} disabled guessed="X" answer="S" />);
    expect(screen.getByRole('button', { name: nameFor('X') })).toHaveClass('is-guess');
    expect(screen.getByRole('button', { name: nameFor('S') })).toHaveClass('is-answer');
    expect(screen.getByRole('button', { name: nameFor('A') })).not.toHaveClass('is-guess');
    expect(screen.getByRole('button', { name: nameFor('A') })).not.toHaveClass('is-answer');
  });

  it('marks a single rank with both classes when the guess was correct', () => {
    render(<RankPicker onPick={() => {}} disabled guessed="B" answer="B" />);
    const btn = screen.getByRole('button', { name: nameFor('B') });
    expect(btn).toHaveClass('is-guess');
    expect(btn).toHaveClass('is-answer');
  });
});
