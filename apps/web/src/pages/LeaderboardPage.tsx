import { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '@6mansdle/shared';
import { api } from '../api/client';

type Sort = 'streak' | 'best' | 'accuracy' | 'played';
const TABS: Array<{ id: Sort; label: string }> = [
  { id: 'streak', label: 'Current streak' },
  { id: 'best', label: 'Best streak' },
  { id: 'accuracy', label: 'Accuracy' },
  { id: 'played', label: 'Most played' },
];

export function LeaderboardPage() {
  const [sort, setSort] = useState<Sort>('streak');
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    setRows(null);
    api.leaderboard(sort).then(setRows).catch(() => setRows([]));
  }, [sort]);

  return (
    <div className="page container">
      <h1 className="page-title">Leaderboard</h1>
      <p className="page-subtitle">Daily challenge results for signed-in players.</p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className={`tab ${sort === t.id ? 'active' : ''}`} onClick={() => setSort(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {!rows ? (
          <div className="spinner" />
        ) : rows.length === 0 ? (
          <p className="center muted" style={{ padding: 32 }}>
            Nobody has played a daily yet. Be the first.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Streak</th>
                  <th>Best</th>
                  <th>Played</th>
                  <th>Correct</th>
                  <th>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.user.id}>
                    <td className={`rank-cell ${i < 3 ? 'top' : ''}`}>{i + 1}</td>
                    <td>
                      <span className="user-cell">
                        {r.user.avatarUrl ? <img className="avatar" src={r.user.avatarUrl} alt="" /> : <span className="avatar" />}
                        {r.user.username}
                      </span>
                    </td>
                    <td>{r.currentStreak}</td>
                    <td>{r.bestStreak}</td>
                    <td>{r.dailyPlayed}</td>
                    <td>{r.dailyCorrect}</td>
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
