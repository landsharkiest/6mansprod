import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClipPlayer } from './ClipPlayer';

function renderPlayer(src = 'https://example.test/clip.mp4') {
  const videoRef = createRef<HTMLVideoElement>();
  const utils = render(<ClipPlayer videoRef={videoRef} src={src} />);
  const video = document.querySelector('video') as HTMLVideoElement;
  return { videoRef, video, ...utils };
}

describe('ClipPlayer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults loop to on and persists the toggle to localStorage', () => {
    renderPlayer();
    const loopBtn = screen.getByRole('button', { name: /^loop/i });
    expect(loopBtn).toHaveTextContent('Loop On');
    expect(loopBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(loopBtn);

    expect(loopBtn).toHaveTextContent('Loop Off');
    expect(localStorage.getItem('sixmansdle.clipPlayer.loop')).toBe('0');
  });

  it('starts a new player honoring a previously persisted loop-off preference', () => {
    localStorage.setItem('sixmansdle.clipPlayer.loop', '0');
    renderPlayer();
    expect(screen.getByRole('button', { name: /^loop/i })).toHaveTextContent('Loop Off');
  });

  it('toggles speed between 1x and 0.5x and persists it to localStorage', () => {
    renderPlayer();
    const speedBtn = screen.getByRole('button', { name: '1x' });

    fireEvent.click(speedBtn);
    expect(screen.getByRole('button', { name: '0.5x' })).toBeInTheDocument();
    expect(localStorage.getItem('sixmansdle.clipPlayer.speed')).toBe('0.5');

    fireEvent.click(screen.getByRole('button', { name: '0.5x' }));
    expect(screen.getByRole('button', { name: '1x' })).toBeInTheDocument();
    expect(localStorage.getItem('sixmansdle.clipPlayer.speed')).toBe('1');
  });

  it('shows a loading state, then an error state with a working Retry button on failure', () => {
    const { video } = renderPlayer();
    expect(screen.getByText(/loading clip/i)).toBeInTheDocument();

    fireEvent.error(video);
    expect(screen.getByText(/couldn.t load this clip/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading clip/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText(/loading clip/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load this clip/i)).not.toBeInTheDocument();
  });

  it('clears the error state once the clip can play', () => {
    const { video } = renderPlayer();
    fireEvent.error(video);
    expect(screen.getByText(/couldn.t load this clip/i)).toBeInTheDocument();

    fireEvent.canPlay(video);
    expect(screen.queryByText(/couldn.t load this clip/i)).not.toBeInTheDocument();
  });

  it('shows an "Unmute" chip when autoplay with sound is rejected, and clears it on click', async () => {
    const playMock = vi.fn().mockRejectedValueOnce(new Error('blocked by autoplay policy')).mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(playMock);

    const { video } = renderPlayer();

    await waitFor(() => expect(screen.getByRole('button', { name: /unmute/i })).toBeInTheDocument());
    expect(video.muted).toBe(true);
    expect(localStorage.getItem('sixmansdle.clipPlayer.muted')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: /unmute/i }));
    expect(screen.queryByRole('button', { name: /unmute/i })).not.toBeInTheDocument();
    expect(video.muted).toBe(false);
    expect(localStorage.getItem('sixmansdle.clipPlayer.muted')).toBe('0');
  });

  it('does not show the "Unmute" chip when play() succeeds', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    renderPlayer();
    expect(screen.queryByRole('button', { name: /unmute/i })).not.toBeInTheDocument();
  });

  it('counts a watch each time playback starts', () => {
    const { video } = renderPlayer();
    expect(screen.getByText(/watched 0 times/i)).toBeInTheDocument();

    fireEvent.play(video);
    expect(screen.getByText(/watched 1 time\b/i)).toBeInTheDocument();

    fireEvent.play(video);
    expect(screen.getByText(/watched 2 times/i)).toBeInTheDocument();
  });
});
