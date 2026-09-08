import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RANK_COLORS, type ClipStats } from '@6mansdle/shared';

export function DistributionChart({ stats }: { stats: ClipStats }) {
  const data = stats.distribution.map((d) => ({
    ...d,
    pct: stats.totalGuesses ? Math.round((d.count / stats.totalGuesses) * 100) : 0,
    isAnswer: d.rank === stats.actualRank,
  }));

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
          <XAxis dataKey="rank" tick={{ fill: '#a3a3a3', fontSize: 13, fontWeight: 700 }} axisLine={{ stroke: '#333' }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: '#737373', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff' }}
            formatter={(value: number, _name, item) => [`${value} (${item.payload.pct}%)`, 'Guesses']}
            labelFormatter={(label) => `Rank ${label}`}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell
                key={d.rank}
                fill={RANK_COLORS[d.rank]}
                fillOpacity={d.isAnswer ? 1 : 0.45}
                stroke={d.isAnswer ? '#fff' : 'none'}
                strokeWidth={d.isAnswer ? 1.5 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
