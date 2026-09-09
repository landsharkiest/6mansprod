import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AdminDashboard } from '@6mansdle/shared';
import { AdminDashboardView } from './AdminDashboardView';

const fixture: AdminDashboard = {
  counts: {
    pendingClips: 4,
    approvedClips: 120,
    rejectedClips: 9,
    hiddenClips: 1,
    openReports: 2,
    usersTotal: 58,
    usersActive7d: 21,
    guessesToday: 14,
    guesses7d: 96,
    guesses30d: 401,
  },
  series: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    guesses: i,
    newUsers: i % 3,
  })),
  topUploaders: [
    { id: 1, username: 'clipmaster', approvedCount: 30 },
    { id: 2, username: 'grinder', approvedCount: 12 },
  ],
  attentionClips: [
    { id: 'clip-1', rank: 'B', accuracy: 12.5, guesses: 24, videoUrl: 'https://example.test/clip-1.mp4' },
  ],
  neverPlayedClips: [{ id: 'clip-2', rank: 'S', createdAt: '2026-09-01T00:00:00.000Z', videoUrl: 'https://example.test/clip-2.mp4' }],
};

describe('AdminDashboardView', () => {
  it('renders every count as a stat tile', () => {
    render(<AdminDashboardView data={fixture} onFixRank={vi.fn()} onToggleHidden={vi.fn()} />);

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Pending clips')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Approved clips')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Hidden clips')).toBeInTheDocument();
    expect(screen.getByText('58')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('401')).toBeInTheDocument();
  });

  it('lists top uploaders', () => {
    render(<AdminDashboardView data={fixture} onFixRank={vi.fn()} onToggleHidden={vi.fn()} />);
    expect(screen.getByText('clipmaster')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('grinder')).toBeInTheDocument();
  });

  it('shows attention clips with quick actions wired to the callbacks', () => {
    const onFixRank = vi.fn();
    const onToggleHidden = vi.fn();
    render(<AdminDashboardView data={fixture} onFixRank={onFixRank} onToggleHidden={onToggleHidden} />);

    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();

    screen.getByRole('button', { name: /hide/i }).click();
    expect(onToggleHidden).toHaveBeenCalledWith('clip-1', true);
  });

  it('shows never-played clips with an Open link to the playback URL', () => {
    render(<AdminDashboardView data={fixture} onFixRank={vi.fn()} onToggleHidden={vi.fn()} />);
    const links = screen.getAllByRole('link', { name: /open/i });
    expect(links.some((l) => l.getAttribute('href') === 'https://example.test/clip-2.mp4')).toBe(true);
  });

  it('renders empty states when there is nothing to show', () => {
    const empty: AdminDashboard = { ...fixture, topUploaders: [], attentionClips: [], neverPlayedClips: [] };
    render(<AdminDashboardView data={empty} onFixRank={vi.fn()} onToggleHidden={vi.fn()} />);
    expect(screen.getByText(/no approved uploads yet/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing flagged right now/i)).toBeInTheDocument();
    expect(screen.getByText(/every approved clip has been shown/i)).toBeInTheDocument();
  });
});
