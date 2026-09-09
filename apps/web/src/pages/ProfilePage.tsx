import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { UserProfile } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { AchievementsSection } from '../components/AchievementsSection';
import { InsightsSection } from '../components/InsightsSection';

/** Renders /profile (own) and /u/:id (anyone's). Same data, same layout. */
export function ProfilePage() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(null);
    setError(null);
    const load = id ? api.userProfile(id) : api.profile();
    load.then(setProfile).catch((err) => setError(err instanceof ApiRequestError && err.status === 404 ? 'No such player.' : 'Could not load this profile'));
  }, [id]);

  if (error) {
    return (
      <div className="page container">
        <div className="notice error">{error}</div>
      </div>
    );
  }
  if (!profile) return <div className="spinner" />;

  const { user, totals, daily, endless, recent, activity } = profile;
  const isMe = me?.id === user.id;

  return (
    <div className="page container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            width={64}
            height={64}
            style={{ width: 64, height: 64, borderRadius: '50%' }}
          />
        ) : (
          <span className="avatar" style={{ width: 64, height: 64 }} />
        )}
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>
            {user.username}
            {isMe && <span className="pill" style={{ marginLeft: 10, verticalAlign: 'middle' }}>you</span>}
          </h1>
          <span className="muted">
            {user.isAdmin ? 'Reviewer' : 'Player'} · since {new Date(profile.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <ActivityCalendar activity={activity} />
      </div>

      <InsightsSection userId={user.id} profile={profile} />

      <div className="profile-columns" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-title">Daily challenge</div>
          <div className="stat-grid">
            <Stat value={daily.currentStreak} label="Current streak" />
            <Stat value={daily.bestStreak} label="Best streak" />
            <Stat value={`${daily.correct}/${daily.played}`} label="Correct" />
            <Stat value={`${pct(daily.correct, daily.played)}%`} label="Accuracy" />
          </div>
        </div>
        <div className="card">
          <div className="card-title">Endless</div>
          <div className="stat-grid">
            <Stat value={endless.currentRun} label="Current run" />
            <Stat value={endless.bestRun} label="Best run" />
            <Stat value={`${endless.correct}/${endless.played}`} label="Correct" />
            <Stat value={`${pct(endless.correct, endless.played)}%`} label="Accuracy" />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginTop: 20 }}>
        <div className="card-title" style={{ padding: '20px 20px 0' }}>
          Recent guesses <span className="muted" style={{ fontWeight: 400 }}>· {totals.guesses} counted, {totals.accuracy}% correct</span>
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

      <AchievementsSection earned={profile.achievements} />
    </div>
  );
}

const pct = (c: number, t: number) => (t ? Math.round((c / t) * 1000) / 10 : 0);

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
