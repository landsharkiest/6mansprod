import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DailyResponse, GuessResponse } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { GameBoard } from '../components/GameBoard';
import { ShareButton } from '../components/ShareButton';
import { buildShareText } from '../lib/share';
import { formatCountdown, msUntilNextUtcMidnight } from '../lib/countdown';

const GUEST_KEY = 'sixmansdle.dailyGuest';

/** Guests get their daily result remembered in this browser only. */
function loadGuestResult(date: string): GuessResponse | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { date: string; result: GuessResponse };
    return saved.date === date ? saved.result : null;
  } catch {
    return null;
  }
}

function saveGuestResult(date: string, result: GuessResponse) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ date, result }));
  } catch {
    /* storage unavailable, nothing to do */
  }
}

function useCountdown() {
  const [text, setText] = useState('');
  useEffect(() => {
    const tick = () => {
      setText(formatCountdown(msUntilNextUtcMidnight(new Date())));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return text;
}

export function DailyPage() {
  const { user, loading: authLoading } = useAuth();
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [result, setResult] = useState<GuessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown();

  useEffect(() => {
    if (authLoading) return;
    api
      .daily()
      .then((d) => {
        const withGuestResult = user ? d : { ...d, result: d.result ?? loadGuestResult(d.date) };
        setDaily(withGuestResult);
        setResult(withGuestResult.result);
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load the daily'));
  }, [authLoading, user]);

  const shareText = daily && result
    ? buildShareText({
        number: daily.number,
        date: daily.date,
        correct: result.correct,
        guessedRank: result.guessedRank,
        actualRank: result.actualRank,
        distance: result.distance,
        streak: result.streak?.current,
      })
    : null;

  return (
    <div className="page container">
      <h1 className="page-title">Daily challenge</h1>
      <p className="page-subtitle">
        {daily ? `${daily.date} (UTC)` : ''} · next clip in <span className="countdown">{countdown}</span>
      </p>

      {!user && !authLoading && (
        <div className="notice" style={{ maxWidth: 900, margin: '0 auto 20px' }}>
          You're playing as a guest. <a href={api.loginUrl} style={{ color: '#fff', fontWeight: 600 }}>Sign in with Discord</a> to
          keep a streak and appear on the <Link to="/leaderboard" style={{ color: '#fff', fontWeight: 600 }}>leaderboard</Link>.
        </div>
      )}

      {error && <div className="notice error">{error}</div>}
      {!daily && !error && <div className="spinner" />}
      {daily && (
        <GameBoard
          clip={daily.clip}
          mode="daily"
          initialResult={daily.result}
          onResult={(r) => {
            if (!user) saveGuestResult(daily.date, r);
            setResult(r);
          }}
          footer={
            <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
              {shareText && <ShareButton text={shareText} />}
              <span className="muted">Come back tomorrow for a new clip.</span>
              <Link to="/play" className="btn btn-lg">
                Keep playing in endless mode
              </Link>
            </div>
          }
        />
      )}
    </div>
  );
}
