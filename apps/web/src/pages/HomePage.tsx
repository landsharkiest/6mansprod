import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { DiscordIcon } from '../components/Layout';

const CHANGELOG = [
  {
    version: 'v2.0.0',
    date: 'Sep 2026',
    changes: [
      'Complete rewrite with real accounts, daily challenge, streaks and a leaderboard',
      'Ranks are no longer visible in the video URL',
      'Clip uploads go through an approval queue',
      'New look inspired by rl6mans.com',
    ],
  },
  { version: 'v1.2.1', date: 'Aug 2025', changes: ['Discord login', 'Mobile improvements', 'Video encoding fixes'] },
  { version: 'v1.0.0', date: 'Aug 2025', changes: ['Initial release'] },
];

export function HomePage() {
  const { user } = useAuth();
  const [dailyNumber, setDailyNumber] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .dailyMeta()
      .then((meta) => {
        if (!cancelled) setDailyNumber(meta.number);
      })
      .catch(() => {
        /* chip is a nice-to-have; ignore failures */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="hero">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
        <h1 className="hero-title">
          6mans<em>dle</em>
          <motion.span
            className="easter-egg"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, y: [0, -6, 0] }}
            transition={{
              opacity: { delay: 0.7, duration: 0.4 },
              scale: { delay: 0.7, duration: 0.4 },
              y: { delay: 1.2, duration: 2, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            tcawley = insta-dodge
          </motion.span>
        </h1>
        <div className="hero-rule" />
        {dailyNumber !== null && <div className="daily-chip">Today's daily: #{dailyNumber}</div>}
        <p className="hero-tagline">
          Watch a clip from a 6mans match and guess the rank.
          <br />
          <b>One daily challenge for everyone</b>, unlimited practice.
        </p>
        <div className="hero-actions">
          <Link to="/daily" className="btn btn-green btn-lg">
            Play today's daily
          </Link>
          <Link to="/play" className="btn btn-lg">
            Endless mode
          </Link>
          {!user && (
            <a href={api.loginUrl} className="btn btn-blurple btn-lg">
              <DiscordIcon /> Sign in with Discord
            </a>
          )}
        </div>
      </motion.div>

      <motion.div
        className="home-grid"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        <div className="card">
          <h3>Daily challenge</h3>
          <p>Everyone gets the same clip each day (UTC). Sign in to build a streak and climb the leaderboard.</p>
        </div>
        <div className="card">
          <h3>Endless mode</h3>
          <p>Random approved clips, as many as you like. See how the community guessed after every round.</p>
        </div>
        <div className="card">
          <h3>Submit clips</h3>
          <p>Signed-in players can upload their own 6mans clips. A reviewer checks the rank before it goes live.</p>
        </div>
      </motion.div>

      <div className="card changelog">
        <div className="card-title">Update log</div>
        {CHANGELOG.map((entry) => (
          <div className="changelog-entry" key={entry.version}>
            <div>
              <div className="changelog-version">{entry.version}</div>
              <div className="changelog-date">{entry.date}</div>
            </div>
            <ul>
              {entry.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
