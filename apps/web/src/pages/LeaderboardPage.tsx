import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BlitzLeaderboardPeriod, BlitzLeaderboardResponse, GameMode, LeaderboardResponse, LeaderboardSort } from '@6mansdle/shared';
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

const BLITZ_PERIODS: Array<{ id: BlitzLeaderboardPeriod; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All time' },
];

type Board = GameMode | 'blitz';

export function LeaderboardPage() {
  const [board, setBoard] = useState<Board>('daily');
  const [sort, setSort] = useState<LeaderboardSort>('streak');
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  const [period, setPeriod] = useState<BlitzLeaderboardPeriod>('all');
  const [blitzData, setBlitzData] = useState<BlitzLeaderboardResponse | null>(null);

  useEffect(() => {
    if (board === 'blitz') return;
    setData(null);
    api
      .leaderboard(board, sort)
      .then(setData)
      .catch(() => setData({ mode: board, sort, minPlaysForAccuracy: 0, entries: [] }));
  }, [board, sort]);

  useEffect(() => {
    if (board !== 'blitz') return;
    setBlitzData(null);
    api
      .blitzLeaderboard(period)
      .then(setBlitzData)
      .catch(() => setBlitzData({ period, entries: [] }));
  }, [board, period]);

  const isDaily = board === 'daily';

  const subtitle =
    board === 'blitz'
      ? 'Top Blitz runs from signed-in players.'
      : isDaily
        ? 'Daily challenge results for signed-in players.'
        : 'Endless mode runs: consecutive correct guesses.';

  return (
    <div className="page container">
      <h1 className="page-title">Leaderboard</h1>
      <p className="page-subtitle">{subtitle}</p>

      <div className="tabs" role="tablist" aria-label="Mode">
        {(['daily', 'endless', 'blitz'] as Board[]).map((m) => (
          <button key={m} role="tab" className={`tab ${board === m ? 'active' : ''}`} onClick={() => setBoard(m)}>
            {m === 'daily' ? 'Daily' : m === 'endless' ? 'Endless' : 'Blitz'}
          </button>
        ))}
      </div>

      {board === 'blitz' ? (
        <div className="tabs" role="tablist" aria-label="Period">
          {BLITZ_PERIODS.map((p) => (
            <button key={p.id} role="tab" className={`tab ${period === p.id ? 'active' : ''}`} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="tabs" role="tablist" aria-label="Sort">
          {SORTS[board].map((t) => (
            <button key={t.id} role="tab" className={`tab ${sort === t.id ? 'active' : ''}`} onClick={() => setSort(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {board !== 'blitz' && sort === 'accuracy' && data && data.minPlaysForAccuracy > 0 && (
        <p className="center muted" style={{ marginTop: -8, marginBottom: 16, fontSize: '0.85rem' }}>
          Listed after {data.minPlaysForAccuracy} {isDaily ? 'dailies' : 'counted clips'}.
        </p>
      )}

      {board === 'blitz' ? (
        <div className="card" style={{ padding: 0 }}>
          {!blitzData ? (
            <div className="spinner" />
          ) : blitzData.entries.length === 0 ? (
            <p className="center muted" style={{ padding: 32 }}>
              No Blitz runs yet for this period. Sign in and give it a shot.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Score</th>
                    <th>Correct</th>
                    <th>Best streak</th>
                  </tr>
                </thead>
                <tbody>
                  {blitzData.entries.map((r, i) => (
                    <tr key={r.user.id}>
                      <td className={`rank-cell ${i < 3 ? 'top' : ''}`}>{i + 1}</td>
                      <td>
                        <Link to={`/u/${r.user.id}`} className="user-cell user-link">
                          {r.user.avatarUrl ? <img className="avatar" src={r.user.avatarUrl} alt="" /> : <span className="avatar" />}
                          {r.user.username}
                        </Link>
                      </td>
                      <td>{r.score}</td>
                      <td>
                        {r.correctCount}/{r.totalCount}
                      </td>
                      <td>{r.bestStreak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
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
      )}
    </div>
  );
}
