import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RANKS, type AdminDashboard, type Rank } from '@6mansdle/shared';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** Short "Sep 3" label for the day-series x-axis, from a yyyy-mm-dd string. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function AdminDashboardView({
  data,
  onFixRank,
  onToggleHidden,
}: {
  data: AdminDashboard;
  onFixRank: (id: string, rank: Rank) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
}) {
  const { counts, series, topUploaders, attentionClips, neverPlayedClips } = data;
  const seriesData = series.map((p) => ({ ...p, label: shortDate(p.date) }));

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <Stat value={counts.pendingClips} label="Pending clips" />
        <Stat value={counts.approvedClips} label="Approved clips" />
        <Stat value={counts.rejectedClips} label="Rejected clips" />
        <Stat value={counts.hiddenClips} label="Hidden clips" />
        <Stat value={counts.openReports} label="Open reports" />
        <Stat value={counts.usersTotal} label="Users" />
        <Stat value={counts.usersActive7d} label="Active 7d" />
        <Stat value={counts.guessesToday} label="Guesses today" />
        <Stat value={counts.guesses7d} label="Guesses 7d" />
        <Stat value={counts.guesses30d} label="Guesses 30d" />
      </div>

      <div className="dashboard-charts" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Guesses per day (30d, UTC)</div>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={seriesData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#737373', fontSize: 11 }} axisLine={{ stroke: '#333' }} tickLine={false} interval={4} />
                <YAxis allowDecimals={false} tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff' }}
                  labelFormatter={(label) => `${label}`}
                />
                <Line type="monotone" dataKey="guesses" stroke="#5865f2" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">New users per day (30d, UTC)</div>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={seriesData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#737373', fontSize: 11 }} axisLine={{ stroke: '#333' }} tickLine={false} interval={4} />
                <YAxis allowDecimals={false} tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff' }}
                />
                <Bar dataKey="newUsers" fill="#43a047" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Top uploaders</div>
        {topUploaders.length === 0 ? (
          <p className="muted">No approved uploads yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Uploader</th>
                  <th>Approved uploads</th>
                </tr>
              </thead>
              <tbody>
                {topUploaders.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.approvedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Clips needing attention</div>
        <p className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: '0.85rem' }}>
          Approved clips with under 20% accuracy over at least 20 guesses -- likely mislabeled.
        </p>
        {attentionClips.length === 0 ? (
          <p className="muted">Nothing flagged right now.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Accuracy</th>
                  <th>Guesses</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attentionClips.map((c) => (
                  <AttentionRow key={c.id} clip={c} onFixRank={onFixRank} onToggleHidden={onToggleHidden} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Never-played approved clips</div>
        {neverPlayedClips.length === 0 ? (
          <p className="muted">Every approved clip has been shown at least once.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {neverPlayedClips.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="pill">{c.rank}</span>
                    </td>
                    <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td>
                      <a className="btn btn-ghost" href={c.videoUrl} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function AttentionRow({
  clip,
  onFixRank,
  onToggleHidden,
}: {
  clip: AdminDashboard['attentionClips'][number];
  onFixRank: (id: string, rank: Rank) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
}) {
  const [rank, setRank] = useState<Rank>(clip.rank);

  return (
    <tr>
      <td>
        <span className="pill">{clip.rank}</span>
      </td>
      <td>{clip.accuracy}%</td>
      <td>{clip.guesses}</td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <a className="btn btn-ghost" href={clip.videoUrl} target="_blank" rel="noreferrer">
            Open
          </a>
          <select aria-label={`Fix rank for clip ${clip.id}`} value={rank} onChange={(e) => setRank(e.target.value as Rank)}>
            {RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button className="btn btn-green" onClick={() => onFixRank(clip.id, rank)} disabled={rank === clip.rank}>
            Fix rank
          </button>
          <button className="btn btn-ghost" onClick={() => onToggleHidden(clip.id, true)}>
            Hide
          </button>
        </div>
      </td>
    </tr>
  );
}
