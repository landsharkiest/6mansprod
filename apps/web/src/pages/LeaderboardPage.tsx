import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameMode, LeaderboardResponse, LeaderboardSort } from '@6mansdle/shared';
import { api } from '../api/client';

const SORTS: Record<GameMode, Array<{ id: LeaderboardSort; label: string }>> = {
  daily: [
    { id: 'streak', label: 'Current streak' },
    { id: 'best', label: 'Best streak' },
    { id: 'accuracy', label: 'Accuracy' },
    { id: 'played', label: 'Most played' },
  ],
  endless: [
    { id: 'streak', label: 'Current run' },
    { id: 'best', label: 'Best run' },
    { id: 'accuracy', label: 'Accuracy' },
    { id: 'played', label: 'Most played' },
  ],
};

export function LeaderboardPage() {
  const [mode, setMode] = useState<GameMode>('daily');
  const [sort, setSort] = useState<LeaderboardSort>('streak');
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  useEffect(() => {
    setData(null);
    api
      .leaderboard(mode, sort)
      .then(setData)
      .catch(() => setData({ mode, sort, minPlaysForAccuracy: 0, entries: [] }));
  }, [mode, sort]);

  const isDaily = mode === 'daily';

  return (
    <div className="page container">
      <h1 className="page-title">Leaderboard</h1>
      <p className="page-subtitle">
        {isDaily ? 'Daily challenge results for signed-in players.' : 'Endless mode runs: consecutive correct guesses.'}
      </p>

      <div className="tabs" role="tablist" aria-label="Mode">
        {(['daily', 'endless'] as GameMode[]).map((m) => (
          <button key={m} role="tab" className={`tab ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
            {m === 'daily' ? 'Daily' : 'Endless'}
          </button>
        ))}
      </div>
      <div className="tabs" role="tablist" aria-label="Sort">
        {SORTS[mode].map((t) => (
          <button key={t.id} role="tab" className={`tab ${sort === t.id ? 'active' : ''}`} onClick={() => setSort(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {sort === 'accuracy' && data && data.minPlaysForAccuracy > 0 && (
        <p className="center muted" style={{ marginTop: -8, marginBottom: 16, fontSize: '0.85rem' }}>
          Listed after {data.minPlaysForAccuracy} {isDaily ? 'dailies' : 'counted clips'}.
        </p>
      )}

      <div className="card" style={{ padding: 0 }}>
        {!data ? (
          <div className="spinner" />
        ) : data.entries.length === 0 ? (
          <p className="center muted" style={{ padding: 32 }}>
            {isDaily ? 'Nobody has played a daily yet. Be the first.' : 'No endless runs yet. Sign in and play a few clips.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>{isDaily ? 'Streak' : 'Run'}</th>
                  <th>Best</th>
                  <th>Played</th>
                  <th>Correct</th>
                  <th>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((r, i) => (
                  <tr key={r.user.id}>
                    <td className={`rank-cell ${i < 3 ? 'top' : ''}`}>{i + 1}</td>
                    <td>
                      <Link to={`/u/${r.user.id}`} className="user-cell user-link">
                        {r.user.avatarUrl ? <img className="avatar" src={r.user.avatarUrl} alt="" /> : <span className="avatar" />}
                        {r.user.username}
                      </Link>
                    </td>
                    <td>{r.currentStreak}</td>
                    <td>{r.bestStreak}</td>
                    <td>{r.played}</td>
                    <td>{r.correct}</td>
                    <td>{r.accuracy}%</td>
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
