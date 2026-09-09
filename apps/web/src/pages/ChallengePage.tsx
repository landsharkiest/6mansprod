import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ChallengeResponse, ClipStats, Rank } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RankPicker } from '../components/RankPicker';
import { DistributionChart } from '../components/DistributionChart';
import { fireConfetti } from '../lib/confetti';
import { buildChallengeVerdictText } from '../lib/challenge';
import { isReplayKey, isTypingTarget, rankForKey } from '../lib/shortcuts';

/** Local shape both a fresh guess and a refreshed "already played" reveal collapse into. */
interface Verdict {
  myGuess: Rank;
  myCorrect: boolean;
  actualRank: Rank;
  creatorGuess: Rank;
  creatorCorrect: boolean;
  distribution: ClipStats['distribution'];
  totalAttempts: number;
}

function toStats(actualRank: Rank, distribution: ClipStats['distribution']): ClipStats {
  const totalGuesses = distribution.reduce((sum, d) => sum + d.count, 0);
  const correctGuesses = distribution.find((d) => d.rank === actualRank)?.count ?? 0;
  return {
    clipId: '',
    actualRank,
    totalGuesses,
    correctGuesses,
    accuracy: totalGuesses ? Math.round((correctGuesses / totalGuesses) * 1000) / 10 : 0,
    distribution,
  };
}

export function ChallengePage() {
  const { token = '' } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<'not-found' | 'other' | null>(null);
  const [pending, setPending] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .challenge(token)
      .then((res) => {
        if (cancelled) return;
        setChallenge(res);
        if (res.myAttempt && res.reveal) {
          setVerdict({
            myGuess: res.myAttempt.guessedRank,
            myCorrect: res.myAttempt.isCorrect,
            actualRank: res.reveal.actualRank,
            creatorGuess: res.reveal.creatorGuess,
            creatorCorrect: res.reveal.creatorCorrect,
            distribution: res.reveal.distribution,
            totalAttempts: res.attempts,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiRequestError && err.status === 404 ? 'not-found' : 'other');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const guess = useCallback(
    async (rank: Rank) => {
      if (pending || verdict || !challenge) return;
      setPending(true);
      try {
        const res = await api.challengeGuess(token, { rank });
        setVerdict({
          myGuess: rank,
          myCorrect: res.correct,
          actualRank: res.actualRank,
          creatorGuess: res.creatorGuess,
          creatorCorrect: res.creatorCorrect,
          distribution: res.distribution,
          totalAttempts: res.distribution.reduce((sum, d) => sum + d.count, 0),
        });
      } catch (err) {
        setError(err instanceof ApiRequestError && err.status === 404 ? 'not-found' : 'other');
      } finally {
        setPending(false);
      }
    },
    [pending, verdict, challenge, token],
  );

  useEffect(() => {
    if (verdict?.myCorrect) {
      const stop = fireConfetti();
      return stop;
    }
    return undefined;
  }, [verdict?.myCorrect]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      if (verdict || !challenge || challenge.expired) return;
      const rank = rankForKey(e.key);
      if (rank) {
        e.preventDefault();
        void guess(rank);
        return;
      }
      if (isReplayKey(e.key)) {
        e.preventDefault();
        const video = videoRef.current;
        if (video) {
          video.currentTime = 0;
          void video.play();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [verdict, challenge, guess]);

  if (error === 'not-found') {
    return (
      <div className="page container center">
        <h1 className="page-title">Challenge not found</h1>
        <p className="page-subtitle">This link doesn't lead anywhere — it may have been mistyped or the challenge deleted.</p>
        <Link to="/play" className="btn btn-lg">
          Play endless mode instead
        </Link>
      </div>
    );
  }

  if (error === 'other') {
    return (
      <div className="page container center">
        <h1 className="page-title">Something went wrong</h1>
        <p className="page-subtitle">Could not load this challenge. Try again in a moment.</p>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="page container">
        <div className="spinner" />
      </div>
    );
  }

  if (challenge.expired && !verdict) {
    return (
      <div className="page container center">
        <h1 className="page-title">Challenge expired</h1>
        <p className="page-subtitle">
          {challenge.creator.username}'s challenge link is more than 30 days old and can no longer be played.
        </p>
        <Link to="/play" className="btn btn-lg">
          Play endless mode instead
        </Link>
      </div>
    );
  }

  return (
    <div className="page container">
      <h1 className="page-title">{challenge.creator.username} challenged you</h1>
      <p className="page-subtitle">Guess the same clip they did, then see how you stack up.</p>

      {!user && !authLoading && !verdict && (
        <div className="notice" style={{ maxWidth: 900, margin: '0 auto 20px' }}>
          You're playing as a guest — your result won't be saved.{' '}
          <a href={api.loginUrl} style={{ color: '#fff', fontWeight: 600 }}>
            Sign in with Discord
          </a>{' '}
          to keep your streak and stats.
        </div>
      )}

      <div className="game">
        <div className="video-frame">
          <video ref={videoRef} key={challenge.clip.clipId} src={challenge.clip.videoUrl} controls autoPlay playsInline preload="auto" />
        </div>

        {!verdict && (
          <div className="card">
            <div className="card-title center">What rank is this player?</div>
            <RankPicker onPick={(r) => void guess(r)} disabled={pending} />
            <p className="shortcut-hint">Tip: press 1–9 to pick a rank, R to replay</p>
          </div>
        )}

        {verdict && (
          <div className="card">
            <div className={`verdict ${verdict.myCorrect ? 'correct' : 'wrong'}`}>
              <h2>{buildChallengeVerdictText(verdict.myCorrect, verdict.creatorCorrect, challenge.creator.username)}</h2>
              <p>
                The answer was <span className="pill">{verdict.actualRank}</span>
              </p>
            </div>

            <div className="challenge-comparison">
              <div className="challenge-comparison-row">
                <span className="muted">You guessed</span>
                <span className={`pill ${verdict.myCorrect ? 'is-answer' : ''}`}>{verdict.myGuess}</span>
              </div>
              <div className="challenge-comparison-row">
                <span className="muted">{challenge.creator.username} guessed</span>
                <span className={`pill ${verdict.creatorCorrect ? 'is-answer' : ''}`}>{verdict.creatorGuess}</span>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <RankPicker onPick={() => undefined} disabled guessed={verdict.myGuess} answer={verdict.actualRank} />
            </div>

            <div style={{ marginTop: 24 }}>
              <div className="card-title">How everyone who took this challenge guessed</div>
              <DistributionChart stats={toStats(verdict.actualRank, verdict.distribution)} />
              <p className="muted center" style={{ margin: '8px 0 0' }}>
                {verdict.totalAttempts} attempt{verdict.totalAttempts === 1 ? '' : 's'}
              </p>
            </div>

            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <Link to="/play" className="btn btn-green btn-lg">
                Play endless mode
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
