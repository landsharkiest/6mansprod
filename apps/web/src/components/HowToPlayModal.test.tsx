import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HowToPlayModal, hasSeenHowToPlay, markHowToPlaySeen } from './HowToPlayModal';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open help</button>
      <HowToPlayModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

describe('hasSeenHowToPlay / markHowToPlaySeen', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is unseen until marked', () => {
    expect(hasSeenHowToPlay()).toBe(false);
    markHowToPlaySeen();
    expect(hasSeenHowToPlay()).toBe(true);
  });
});

describe('HowToPlayModal', () => {
  it('renders nothing when closed', () => {
    render(<HowToPlayModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an accessible dialog with the three panels when open', () => {
    render(<HowToPlayModal open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('The ranks')).toBeInTheDocument();
    expect(screen.getByText('The daily')).toBeInTheDocument();
    expect(screen.getByText('Tips')).toBeInTheDocument();
  });

  it('calls onClose on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HowToPlayModal open onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the element that opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const opener = screen.getByRole('button', { name: 'Open help' });
    await user.click(opener);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});
