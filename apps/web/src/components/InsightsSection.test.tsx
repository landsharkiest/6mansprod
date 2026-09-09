import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProfileInsights, UserProfile } from '@6mansdle/shared';
import { InsightsSection } from './InsightsSection';

const userInsights = vi.fn<(id: number) => Promise<ProfileInsights>>();

vi.mock('../api/client', () => ({
  api: {
    userInsights: (id: number) => userInsights(id),
  },
}));

const baseProfile: UserProfile = {
  user: { id: 1, discordId: 'd1', username: 'Ranger', avatarUrl: null, isAdmin: false },
  activity: [],
  memberSince: '2026-01-01T00:00:00.000Z',
  totals: { guesses: 12, correct: 8, accuracy: 66.7 },
  daily: { played: 5, correct: 4, currentStreak: 2, bestStreak: 6 },
  endless: { played: 7, correct: 4, currentRun: 1, bestRun: 9 },
  recent: [],
  achievements: [{ id: 'first_guess', earnedAt: '2026-01-02T00:00:00.000Z' }],
};

function unlockedInsights(): Extract<ProfileInsights, { locked: false }> {
  return {
    locked: false,
    totals: { guesses: 12, correct: 8, accuracy: 66.7 },
    accuracyOverTime: Array.from({ length: 26 }, (_, i) => ({
      weekStart: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      guesses: i === 25 ? 4 : 0,
      correct: i === 25 ? 3 : 0,
      accuracy: i === 25 ? 75 : 0,
    })),
    personalConfusion: [],
    blindSpots: [
      { actualRank: 'A', totalGuesses: 5, correctGuesses: 2, accuracy: 40, mostCommonWrongGuess: 'B+', mostCommonWrongGuessCount: 2 },
    ],
    strengths: [{ rank: 'S', totalGuesses: 6, correctGuesses: 6, accuracy: 100 }],
    bias: { overall: 0.4, perRank: [] },
    vsCommunity: [{ rank: 'S', userAccuracy: 100, userGuesses: 6, communityAccuracy: 80 }],
    communityAccuracy: 55,
  };
}

describe('InsightsSection', () => {
  it('shows the locked empty state below the unlock threshold', async () => {
    userInsights.mockResolvedValueOnce({ locked: true, needed: 6 });
    render(<InsightsSection userId={1} profile={baseProfile} />);

    expect(await screen.findByText(/play 10 clips to unlock insights/i)).toBeInTheDocument();
    expect(screen.getByText(/4 of 10 counted guesses so far/i)).toBeInTheDocument();
  });

  it('renders the unlocked insights body with blind spots, strengths, and bias', async () => {
    userInsights.mockResolvedValueOnce(unlockedInsights());
    render(<InsightsSection userId={1} profile={baseProfile} />);

    expect(await screen.findByText(/strongest at/i)).toBeInTheDocument();
    expect(screen.getByText(/you call/i)).toBeInTheDocument();
    expect(screen.getByText(/your bias: you rate clips 0\.4 ranks too generous/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share result/i })).toBeInTheDocument();
  });

  it('toggles the section open and closed via the show/hide button', async () => {
    userInsights.mockResolvedValueOnce(unlockedInsights());
    const user = userEvent.setup();
    render(<InsightsSection userId={1} profile={baseProfile} />);

    await screen.findByText(/strongest at/i);
    const toggle = screen.getByRole('button', { name: /hide insights/i });
    await user.click(toggle);
    expect(screen.queryByText(/strongest at/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show insights/i })).toBeInTheDocument();
  });

  it('shows a fallback message if the request fails', async () => {
    userInsights.mockRejectedValueOnce(new Error('boom'));
    render(<InsightsSection userId={1} profile={baseProfile} />);
    await waitFor(() => expect(screen.getByText(/could not load insights/i)).toBeInTheDocument());
  });
});
