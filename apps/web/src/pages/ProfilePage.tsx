import { useEffect, useState } from 'react';
import type { UserProfile } from '@6mansdle/shared';
import { api } from '../api/client';

export function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.profile().then(setProfile).catch(() => setError('Could not load your profile'));
  }, []);

  if (error) return <div className="page container notice error">{error}</div>;
  if (!profile) return <div className="spinner" />;

  const { user, totals, daily, recent } = profile;

  return (
    <div className="page container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%' }} />
        ) : (
          <span className="avatar" style={{ width: 64, height: 64 }} />
        )}
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{user.username}</h1>
          <span className="muted">{user.isAdmin ? 'Reviewer' : 'Player'}</span>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <Stat value={daily.currentStreak} label="Current streak" />
        <Stat value={daily.bestStreak} label="Best streak" />
        <Stat value={`${daily.correct}/${daily.played}`} label="Dailies correct" />
        <Stat value={totals.guesses} label="Total guesses" />
        <Stat value={`${totals.accuracy}%`} label="Overall accuracy" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="card-title" style={{ padding: '20px 20px 0' }}>
          Recent guesses
        </div>
        {recent.length === 0 ? (
          <p className="muted" style={{ padding: 20 }}>
            No guesses yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Mode</th>
                  <th>Guess</th>
                  <th>Answer</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((g) => (
                  <tr key={g.id}>
                    <td className="muted">{new Date(g.createdAt).toLocaleString()}</td>
                    <td style={{ textTransform: 'capitalize' }}>{g.mode}</td>
                    <td>
                      <span className="pill">{g.guessedRank}</span>
                    </td>
                    <td>
                      <span className="pill">{g.actualRank}</span>
                    </td>
                    <td style={{ color: g.isCorrect ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {g.isCorrect ? 'Correct' : 'Wrong'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
