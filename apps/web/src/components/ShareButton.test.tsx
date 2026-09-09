import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButton } from './ShareButton';

// user-event's setup() installs its own clipboard stub on `navigator.clipboard`, so our
// mock must be applied *after* setup() runs (not in beforeEach) or it gets clobbered.
function mockClipboard(user: ReturnType<typeof userEvent.setup>) {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('ShareButton', () => {
  beforeEach(() => {
    // No Web Share API by default, so most tests exercise the clipboard path.
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('copies the given text to the clipboard and shows Copied!', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard(user);
    render(<ShareButton text="6mansdle #42 · 2026-09-09" />);

    const button = screen.getByRole('button', { name: 'Share result' });
    await user.click(button);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('6mansdle #42 · 2026-09-09'));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('uses navigator.share when available instead of the clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    const user = userEvent.setup();
    const writeText = mockClipboard(user);
    render(<ShareButton text="hello" />);
    await user.click(screen.getByRole('button', { name: 'Share result' }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: 'hello' }));
    expect(writeText).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Shared!' })).toBeInTheDocument();
  });

  it('falls back to the clipboard when navigator.share rejects (e.g. user cancels)', async () => {
    const share = vi.fn().mockRejectedValue(new Error('cancelled'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    const user = userEvent.setup();
    const writeText = mockClipboard(user);
    render(<ShareButton text="hello" />);
    await user.click(screen.getByRole('button', { name: 'Share result' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('hello'));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('shows an error state when the clipboard also fails', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard(user);
    writeText.mockRejectedValueOnce(new Error('denied'));
    render(<ShareButton text="hello" />);
    await user.click(screen.getByRole('button', { name: 'Share result' }));

    expect(await screen.findByRole('button', { name: "Couldn't share" })).toBeInTheDocument();
  });
});
