import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';

vi.mock('./api/client', () => ({
  api: {
    loginUrl: 'https://example.test/login',
    me: vi.fn().mockResolvedValue({ user: null }),
    logout: vi.fn().mockResolvedValue(undefined),
    dailyMeta: vi.fn().mockResolvedValue({ date: '2026-09-08', number: 1 }),
  },
  ApiRequestError: class ApiRequestError extends Error {},
}));

describe('unknown routes', () => {
  it('renders a 404 page with a link home instead of silently redirecting', async () => {
    render(
      <MemoryRouter initialEntries={['/this-page-does-not-exist']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('404')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back home' })).toHaveAttribute('href', '/');
  });
});
