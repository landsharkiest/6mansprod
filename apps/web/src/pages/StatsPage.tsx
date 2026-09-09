import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RANK_COLORS, type CommunityStats } from '@6mansdle/shared';
import { api } from '../api/client';
import { ConfusionMatrix } from '../components/ConfusionMatrix';

export function StatsPage() {
  const [data, setData] = useState<CommunityStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .communityStats()
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="page container">
        <div className="notice error">Could not load community stats.</div>
      </div>
    );
  }
  if (!data) return <div className="spinner" />;

  const { totals } = data;
  const isEmpty = totals.totalGuesses === 0;

  return (
    <div className="page container">
      <h1 className="page-title">Community stats</h1>
      <p className="page-subtitle">How the whole community is guessing, updated about once a minute.</p>

      {isEmpty ? (
        <div className="card">
          <p className="center muted" style={{ padding: 32 }}>
            No guesses yet. Come back once people start playing.
          </p>
        </div>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            <Stat value={totals.totalGuesses.toLocaleString()} label="Guesses" />
            <Stat value={`${totals.accuracy}%`} label="Accuracy" />
            <Stat value={totals.players.toLocaleString()} label="Players" />
            <Stat value={totals.approvedClips.toLocaleString()} label="Clips" />
            <Stat value={totals.guessesToday.toLocaleString()} label="Today (UTC)" />
            <Stat value={totals.guessesThisWeek.toLocaleString()} label="This week (UTC)" />
          </div>

          {((data.mostOverratedRank && data.mostOverratedRank.avgSignedDistance > 0) ||
            (data.mostUnderratedRank && data.mostUnderratedRank.avgSignedDistance < 0)) && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title">Community bias</div>
              <div className="bias-callouts">
                {data.mostOverratedRank && data.mostOverratedRank.avgSignedDistance > 0 && (
                  <p>
                    Players think{' '}
                    <b style={{ color: RANK_COLORS[data.mostOverratedRank.rank] }}>{data.mostOverratedRank.rank}</b> is better than it
                    is — guesses skew {Math.abs(data.mostOverratedRank.avgSignedDistance).toFixed(1)} ranks too generous on average.
                  </p>
                )}
                {data.mostUnderratedRank && data.mostUnderratedRank.avgSignedDistance < 0 && (
                  <p>
                    Players sleep on{' '}
                    <b style={{ color: RANK_COLORS[data.mostUnderratedRank.rank] }}>{data.mostUnderratedRank.rank}</b> — guesses skew{' '}
                    {Math.abs(data.mostUnderratedRank.avgSignedDistance).toFixed(1)} ranks too harsh on average.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Accuracy by rank</div>
            <AccuracyByRankChart perRank={data.perRank} />
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Which ranks get mistaken for which</div>
            <p className="muted" style={{ marginTop: -6, marginBottom: 14, fontSize: '0.85rem' }}>
              Rows are the clip's actual rank, columns are what players guessed. Darker means a bigger share of that rank's guesses.
            </p>
            <ConfusionMatrix cells={data.confusionMatrix} />
          </div>

          <div className="clip-difficulty-grid">
            <div className="card">
              <div className="card-title">Hardest clips</div>
              <ClipDifficultyList clips={data.hardestClips} empty="Not enough plays yet." />
            </div>
            <div className="card">
              <div className="card-title">Easiest clips</div>
              <ClipDifficultyList clips={data.easiestClips} empty="Not enough plays yet." />
            </div>
          </div>
        </>
      )}
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

function AccuracyByRankChart({ perRank }: { perRank: CommunityStats['perRank'] }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={perRank} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
          <XAxis dataKey="rank" tick={{ fill: '#a3a3a3', fontSize: 13, fontWeight: 700 }} axisLine={{ stroke: '#333' }} tickLine={false} />
          <YAxis
            allowDecimals={false}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: '#737373', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff' }}
            formatter={(value: number, _name, item) => [`${value}% (${item.payload.correctGuesses}/${item.payload.totalGuesses})`, 'Accuracy']}
            labelFormatter={(label) => `Rank ${label}`}
          />
          <Bar dataKey="accuracy" radius={[6, 6, 0, 0]}>
            {perRank.map((d) => (
              <Cell key={d.rank} fill={RANK_COLORS[d.rank]} fillOpacity={d.totalGuesses ? 1 : 0.25} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ClipDifficultyList({ clips, empty }: { clips: CommunityStats['hardestClips']; empty: string }) {
  if (clips.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="clip-difficulty-list">
      {clips.map((c, i) => (
        <li key={`${c.actualRank}-${i}`}>
          <span className="pill" style={{ color: RANK_COLORS[c.actualRank], borderColor: RANK_COLORS[c.actualRank] }}>
            {c.actualRank}
          </span>
          <span className="clip-difficulty-accuracy">{c.accuracy}%</span>
          <span className="muted clip-difficulty-guesses">{c.totalGuesses} guesses</span>
        </li>
      ))}
    </ul>
  );
}
