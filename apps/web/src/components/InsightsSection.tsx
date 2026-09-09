import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { INSIGHTS_MIN_GUESSES, RANK_COLORS, type ProfileInsights, type UserProfile } from '@6mansdle/shared';
import { api } from '../api/client';
import { buildProfileShareText } from '../lib/share';
import { ConfusionMatrix } from './ConfusionMatrix';
import { ShareButton } from './ShareButton';

const MOBILE_BREAKPOINT = 720;

/** Best-effort viewport check for the initial collapsed state — never throws if window is odd. */
function isNarrowViewport(): boolean {
  try {
    return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;
  } catch {
    return false;
  }
}

interface Props {
  userId: number;
  profile: UserProfile;
}

/** The profile page's "Insights" section: fetches its own data, collapsed by default on phones. */
export function InsightsSection({ userId, profile }: Props) {
  const [insights, setInsights] = useState<ProfileInsights | null>(null);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState(isNarrowViewport);

  useEffect(() => {
    setInsights(null);
    setError(false);
    api
      .userInsights(userId)
      .then(setInsights)
      .catch(() => setError(true));
  }, [userId]);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="insights-head">
        <div className="card-title">Insights</div>
        <button type="button" className="btn btn-ghost" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? 'Show insights' : 'Hide insights'}
        </button>
      </div>

      {!collapsed &&
        (error ? (
          <p className="muted">Could not load insights.</p>
        ) : !insights ? (
          <div className="spinner" />
        ) : insights.locked ? (
          <LockedInsights needed={insights.needed} />
        ) : (
          <UnlockedInsights insights={insights} profile={profile} />
        ))}
    </div>
  );
}

function LockedInsights({ needed }: { needed: number }) {
  const played = Math.max(0, INSIGHTS_MIN_GUESSES - needed);
  return (
    <div className="insights-locked">
      <p>Play {INSIGHTS_MIN_GUESSES} clips to unlock insights.</p>
      <p className="muted">
        {played} of {INSIGHTS_MIN_GUESSES} counted guesses so far.
      </p>
    </div>
  );
}

function UnlockedInsights({ insights, profile }: { insights: Extract<ProfileInsights, { locked: false }>; profile: UserProfile }) {
  const { accuracyOverTime, personalConfusion, blindSpots, strengths, bias, vsCommunity, communityAccuracy } = insights;

  const chartData = accuracyOverTime.map((b) => ({
    weekStart: b.weekStart,
    label: b.weekStart.slice(5), // MM-DD, the year rarely matters for a 26-week window
    accuracy: b.guesses > 0 ? b.accuracy : null,
    guesses: b.guesses,
  }));

  const vsCommunityData = vsCommunity
    .filter((v) => v.userGuesses > 0)
    .map((v) => ({ rank: v.rank, you: v.userAccuracy ?? 0, community: v.communityAccuracy }));

  const shareText = buildProfileShareText({
    username: profile.user.username,
    accuracy: profile.totals.accuracy,
    bestStreak: profile.daily.bestStreak,
    bestRun: profile.endless.bestRun,
    topStrength: strengths[0]?.rank,
    badgeCount: profile.achievements.length,
    url: typeof window !== 'undefined' ? `${window.location.origin}/u/${profile.user.id}` : undefined,
  });

  return (
    <div className="insights-body">
      <div className="insights-block">
        <div className="insights-subtitle">Accuracy over time</div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#737373', fontSize: 11 }} axisLine={{ stroke: '#333' }} tickLine={false} minTickGap={24} />
              <YAxis
                domain={[0, 100]}
                allowDecimals={false}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fill: '#737373', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff' }}
                formatter={(value) => [value === null || value === undefined ? 'No guesses' : `${value}%`, 'Accuracy']}
                labelFormatter={(label) => `Week of ${label}`}
              />
              <ReferenceLine
                y={communityAccuracy}
                stroke="#a3a3a3"
                strokeDasharray="4 4"
                label={{ value: `Community avg ${communityAccuracy}%`, position: 'insideTopRight', fill: '#a3a3a3', fontSize: 11 }}
              />
              <Line type="monotone" dataKey="accuracy" stroke="#5865f2" strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="insights-callout-grid">
        <div className="insights-block">
          <div className="insights-subtitle">Blind spots</div>
          {blindSpots.length === 0 ? (
            <p className="muted">No clear blind spots yet.</p>
          ) : (
            <ul className="insights-callout-list">
              {blindSpots.map((b) => (
                <li key={b.actualRank}>
                  You call <b style={{ color: RANK_COLORS[b.actualRank] }}>{b.actualRank}</b> clips{' '}
                  {b.mostCommonWrongGuess && (
                    <>
                      <b style={{ color: RANK_COLORS[b.mostCommonWrongGuess] }}>{b.mostCommonWrongGuess}</b>{' '}
                    </>
                  )}
                  {Math.round((b.mostCommonWrongGuessCount / b.totalGuesses) * 100)}% of the time.
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="insights-block">
          <div className="insights-subtitle">Strengths</div>
          {strengths.length === 0 ? (
            <p className="muted">Play a few more clips per rank to surface a strength.</p>
          ) : (
            <ul className="insights-callout-list">
              {strengths.map((s) => (
                <li key={s.rank}>
                  Strongest at <b style={{ color: RANK_COLORS[s.rank] }}>{s.rank}</b> — {s.accuracy}% accuracy ({s.totalGuesses} guesses).
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {vsCommunityData.length > 0 && (
        <div className="insights-block">
          <div className="insights-subtitle">You vs community</div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={vsCommunityData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="rank" tick={{ fill: '#a3a3a3', fontSize: 13, fontWeight: 700 }} axisLine={{ stroke: '#333' }} tickLine={false} />
                <YAxis
                  domain={[0, 100]}
                  allowDecimals={false}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fill: '#737373', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, color: '#fff' }}
                  formatter={(value: number, name: string) => [`${value}%`, name === 'you' ? 'You' : 'Community']}
                />
                <Legend formatter={(value: string) => (value === 'you' ? 'You' : 'Community')} />
                <Bar dataKey="you" fill="#5865f2" radius={[6, 6, 0, 0]} />
                <Bar dataKey="community" fill="#525252" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <ConfusionMatrix cells={personalConfusion} title="Your confusion matrix" />

      <BiasLine overall={bias.overall} />

      <div className="insights-share">
        <ShareButton text={shareText} className="btn btn-blurple" />
      </div>
    </div>
  );
}

function BiasLine({ overall }: { overall: number | null }) {
  if (overall === null) return null;
  if (overall === 0) {
    return <p className="muted insights-bias">Your bias: dead-on average, no lean either way.</p>;
  }
  const direction = overall > 0 ? 'generous' : 'harsh';
  return (
    <p className="muted insights-bias">
      Your bias: you rate clips {Math.abs(overall).toFixed(1)} ranks too {direction} on average.
    </p>
  );
}
