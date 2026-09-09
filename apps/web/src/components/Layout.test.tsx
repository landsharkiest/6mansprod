import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { AuthProvider } from '../auth/AuthContext';

vi.mock('../api/client', () => ({
  api: {
    loginUrl: 'https://example.test/login',
    me: vi.fn().mockResolvedValue({ user: null }),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/daily" element={<div>Daily page content</div>} />
            <Route path="/leaderboard" element={<div>Leaderboard page content</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Layout / how-to-play auto-open', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens the how-to-play modal on a first-ever visit to /daily', async () => {
    renderAt('/daily');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not reopen on a later visit once the flag is set', async () => {
    localStorage.setItem('sixmansdle.seenHowToPlay', '1');
    renderAt('/daily');
    await screen.findByText('Daily page content');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not auto-open on a route that is not daily/play', async () => {
    renderAt('/leaderboard');
    await screen.findByText('Leaderboard page content');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens from the nav "?" button regardless of the seen flag', async () => {
    localStorage.setItem('sixmansdle.seenHowToPlay', '1');
    const user = userEvent.setup();
    renderAt('/leaderboard');
    await screen.findByText('Leaderboard page content');

    await user.click(screen.getByRole('button', { name: 'How to play' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('Layout / nav accessibility', () => {
  beforeEach(() => {
    localStorage.setItem('sixmansdle.seenHowToPlay', '1'); // keep the how-to-play modal out of the way
  });

  it('marks the active section via aria-current, and only that one', async () => {
    renderAt('/leaderboard');
    await screen.findByText('Leaderboard page content');

    expect(screen.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Daily' })).not.toHaveAttribute('aria-current');
  });

  it('names the primary nav landmark so it is distinguishable from other nav regions', async () => {
    renderAt('/daily');
    await screen.findByText('Daily page content');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });
});
