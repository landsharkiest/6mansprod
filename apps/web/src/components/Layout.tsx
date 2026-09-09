import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { HowToPlayModal, hasSeenHowToPlay, markHowToPlaySeen } from './HowToPlayModal';
import { Footer } from './Footer';

/** Routes where a first-time visitor should see the how-to-play modal automatically. */
const AUTO_HELP_ROUTES = new Set(['/daily', '/play']);

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);

  useEffect(() => {
    if (AUTO_HELP_ROUTES.has(location.pathname) && !hasSeenHowToPlay()) {
      markHowToPlaySeen();
      setHowToPlayOpen(true);
    }
    // Only re-check when the route changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link to="/" className="brand" aria-label="6mansdle home">
            <span className="brand-mark">6</span>
            <span>
              6mans<em>dle</em>
            </span>
          </Link>

          <nav className="nav-links" aria-label="Primary">
            <NavLink to="/daily" className="nav-link">
              Daily
            </NavLink>
            <NavLink to="/play" className="nav-link">
              Play
            </NavLink>
            <NavLink to="/leaderboard" className="nav-link">
              Leaderboard
            </NavLink>
            <NavLink to="/stats" className="nav-link">
              Stats
            </NavLink>
            {user && (
              <NavLink to="/upload" className="nav-link">
                Upload
              </NavLink>
            )}
            {user?.isAdmin && (
              <NavLink to="/admin" className="nav-link">
                Review
              </NavLink>
            )}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost help-btn"
              onClick={() => setHowToPlayOpen(true)}
              aria-label="How to play"
              title="How to play"
            >
              ?
            </button>
            {loading ? null : user ? (
              <>
                <Link to="/profile" className="user-chip" title="Your profile">
                  {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span className="avatar" />}
                  <span>{user.username}</span>
                </Link>
                <button className="btn btn-ghost" onClick={() => void logout()} title="Log out">
                  Log out
                </button>
              </>
            ) : (
              <a className="btn btn-blurple" href={api.loginUrl}>
                <DiscordIcon /> Sign in
              </a>
            )}
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <Footer />
      <HowToPlayModal open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
    </>
  );
}

export function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18 18 0 0 1 4.5 2.3 15.6 15.6 0 0 0-15.4 0A18 18 0 0 1 8.8 3.4L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9.1-.2 13.7.2 18.2A19.9 19.9 0 0 0 6.3 21l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4a12.7 12.7 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6.1-2.8c.5-5.2-.8-9.7-3.5-13.8ZM8.5 15.4c-1.2 0-2.2-1.1-2.2-2.5s1-2.5 2.2-2.5 2.2 1.1 2.2 2.5-1 2.5-2.2 2.5Zm7 0c-1.2 0-2.2-1.1-2.2-2.5s1-2.5 2.2-2.5 2.2 1.1 2.2 2.5-1 2.5-2.2 2.5Z" />
    </svg>
  );
}
