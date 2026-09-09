import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClipStats, GuessResponse, PlayableClip } from '@6mansdle/shared';

vi.mock('../../src/api/client', () => {
  class ApiRequestError extends Error {
    status: number;
    details?: unknown;
    constructor(status: number, message: string, details?: unknown) {
      super(message);
      this.name = 'ApiRequestError';
      this.status = status;
      this.details = details;
    }
  }
  return { api: { guess: vi.fn() }, ApiRequestError };
});

// GameBoard reads the signed-in user for the report form; render as a guest here.
vi.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, refresh: vi.fn(), logout: vi.fn() }),
}));

vi.mock('../../src/components/DistributionChart', () => ({
  DistributionChart: () => <div data-testid="distribution-chart" />,
}));

const { api } = await import('../../src/api/client');
const { GameBoard } = await import('../../src/components/GameBoard');

const clip: PlayableClip = { clipId: 'clip-1', videoUrl: 'https://example.test/clip.mp4', contentType: 'video/mp4' };

function stats(overrides: Partial<ClipStats> = {}): ClipStats {
  return {
    clipId: 'clip-1',
    actualRank: 'S',
    totalGuesses: 10,
    correctGuesses: 4,
    accuracy: 40,
    distribution: [],
    ...overrides,
  };
}

describe('GameBoard', () => {
  it('submits a guess via the api client when a rank is picked', async () => {
    const user = userEvent.setup();
    const result: GuessResponse = {
      correct: true,
      guessedRank: 'S',
      actualRank: 'S',
      distance: 0,
      stats: stats({ actualRank: 'S' }),
      counted: true,
      newAchievements: [],
    };
    vi.mocked(api.guess).mockResolvedValueOnce(result);

    render(<GameBoard clip={clip} mode="endless" />);
    await user.click(screen.getByRole('button', { name: 'S' }));

    expect(api.guess).toHaveBeenCalledWith({ clipId: 'clip-1', rank: 'S', mode: 'endless' });
    await waitFor(() => expect(screen.getByText('Correct!')).toBeInTheDocument());
  });

  it('shows "Correct!" for distance 0', async () => {
    render(
      <GameBoard
        clip={clip}
        mode="endless"
        initialResult={{ correct: true, guessedRank: 'S', actualRank: 'S', distance: 0, stats: stats(), counted: true, newAchievements: [] }}
      />,
    );
    expect(screen.getByText('Correct!')).toBeInTheDocument();
  });

  it('shows the one-off message for distance 1', async () => {
    render(
      <GameBoard
        clip={clip}
        mode="endless"
        initialResult={{ correct: false, guessedRank: 'X', actualRank: 'S', distance: 1, stats: stats(), counted: true, newAchievements: [] }}
      />,
    );
    expect(screen.getByText('So close, one rank off')).toBeInTheDocument();
  });

  it('shows the two-off message for distance 2', async () => {
    render(
      <GameBoard
        clip={clip}
        mode="endless"
        initialResult={{ correct: false, guessedRank: 'A', actualRank: 'S', distance: 2, stats: stats(), counted: true, newAchievements: [] }}
      />,
    );
    expect(screen.getByText('Two ranks off')).toBeInTheDocument();
  });

  it('shows an "already answered" notice when counted is false', () => {
    render(
      <GameBoard
        clip={clip}
        mode="endless"
        initialResult={{ correct: true, guessedRank: 'S', actualRank: 'S', distance: 0, stats: stats(), counted: false, newAchievements: [] }}
      />,
    );
    expect(screen.getByText(/already answered this clip/i)).toBeInTheDocument();
  });

  it('shows the streak banner for daily results', () => {
    render(
      <GameBoard
        clip={clip}
        mode="daily"
        initialResult={{
          correct: true,
          guessedRank: 'S',
          actualRank: 'S',
          distance: 0,
          stats: stats(),
          counted: true,
          newAchievements: [],
          streak: { current: 3, best: 7 },
        }}
      />,
    );
    expect(screen.getByText('Streak')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Best')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows the run banner for endless results', () => {
    render(
      <GameBoard
        clip={clip}
        mode="endless"
        initialResult={{
          correct: true,
          guessedRank: 'S',
          actualRank: 'S',
          distance: 0,
          stats: stats(),
          counted: true,
          newAchievements: [],
          run: { current: 4, best: 9 },
        }}
      />,
    );
    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Best run')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('shows an error message when the guess request fails', async () => {
    const user = userEvent.setup();
    const { ApiRequestError } = await import('../../src/api/client');
    vi.mocked(api.guess).mockRejectedValueOnce(new ApiRequestError(429, 'Too many guesses'));

    render(<GameBoard clip={clip} mode="endless" />);
    await user.click(screen.getByRole('button', { name: 'S' }));

    await waitFor(() => expect(screen.getByText('Too many guesses')).toBeInTheDocument());
  });
});
