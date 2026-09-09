import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlitzRunSummary, PlayableClip, Rank } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RankPicker } from '../components/RankPicker';
import { ShareButton } from '../components/ShareButton';
import { fireConfetti } from '../lib/confetti';
import { buildBlitzShareText } from '../lib/share';
import { isTypingTarget, rankForKey } from '../lib/shortcuts';
import { applyGuessDelta, INITIAL_BLITZ_STATE, isRunOver, msUntilEnds, secondsRemaining, type BlitzRunningState } from '../lib/blitz';

type Phase = 'intro' | 'loading' | 'playing' | 'ended';

/** How long the ✓/✗ verdict flash covers the next clip before it loads. */
const FLASH_MS = 600;

interface FlashState {
  correct: boolean;
  actualRank: Rank;
}

export function BlitzPage() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);

  const [runId, setRunId] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [clip, setClip] = useState<PlayableClip | null>(null);
  const [run, setRun] = useState<BlitzRunningState>(INITIAL_BLITZ_STATE);
  const [flash, setFlash] = useState<FlashState | null>(null);
  const [pending, setPending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [summary, setSummary] = useState<BlitzRunSummary | null>(null);
  const [personalBest, setPersonalBest] = useState<BlitzRunSummary | null>(null);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);

  const finish = useCallback(async (id: number, fallback: BlitzRunSummary | null) => {
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      const body = await api.blitzFinish(id);
      setSummary(body);
    } catch {
      if (fallback) setSummary(fallback);
    }
    setPhase('ended');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPhase('loading');
    endedRef.current = false;
    setSummary(null);
    setRun(INITIAL_BLITZ_STATE);
    setFlash(null);
    try {
      const res = await api.blitzStart();
      setRunId(res.runId);
      setEndsAt(res.endsAt);
      setClip(res.clip);
      setPhase('playing');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start a run');
      setPhase('intro');
    }
  }, []);

  // Local countdown display, driven off the server-authoritative endsAt.
  useEffect(() => {
    if (phase !== 'playing' || !endsAt || !runId) return;
    const tick = () => {
      const now = new Date();
      setSecondsLeft(secondsRemaining(msUntilEnds(endsAt, now)));
      if (isRunOver(endsAt, now)) {
        void finish(runId, { runId, ...run });
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, endsAt, runId]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const guess = useCallback(
    async (rank: Rank) => {
      if (pending || flash || !clip || !runId) return;
      setPending(true);
      try {
        const res = await api.blitzGuess(runId, clip.clipId, rank);
        if (res.expired) {
          setSummary(res.summary);
          endedRef.current = true;
          setPhase('ended');
          return;
        }
        const { result } = res;
        setRun((prev) => applyGuessDelta(prev, result));
        setEndsAt(result.endsAt);
        setFlash({ correct: result.correct, actualRank: result.actualRank });
        if (result.correct) {
          const stop = fireConfetti();
          setTimeout(stop, FLASH_MS);
        }

        if (result.finished || !result.nextClip) {
          flashTimer.current = setTimeout(() => {
            void finish(runId, {
              runId,
              score: result.score,
              correctCount: result.correctCount,
              totalCount: result.totalCount,
              bestStreak: result.bestStreak,
            });
          }, FLASH_MS);
          return;
        }

        flashTimer.current = setTimeout(() => {
          setClip(result.nextClip);
          setFlash(null);
        }, FLASH_MS);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Could not submit your guess');
      } finally {
        setPending(false);
      }
    },
    [pending, flash, clip, runId, finish],
  );

  // 1-9 pick a rank while playing, same shortcut convention as endless/daily.
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      const rank = rankForKey(e.key);
      if (rank) {
        e.preventDefault();
        void guess(rank);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, guess]);

  // Personal best, signed-in only, fetched once the run ends.
  useEffect(() => {
    if (phase !== 'ended' || !user) return;
    api
      .blitzMeBest()
      .then((res) => setPersonalBest(res.best))
      .catch(() => setPersonalBest(null));
  }, [phase, user]);

  return (
    <div className="page container">
      <h1 className="page-title">Blitz</h1>
      <p className="page-subtitle">90 seconds. As many clips as you can guess. Speed pays.</p>

      {error && <div className="notice error">{error}</div>}

      {phase === 'intro' && (
        <div className="card">
          <div className="card-title">How it works</div>
          <ul style={{ lineHeight: 1.8, margin: '8px 0 20px', paddingLeft: 20 }}>
            <li>90 seconds on the clock, as many clips as you can get through.</li>
            <li>Correct guess: 100 points, plus up to 50 more for answering fast (the bonus decays over your first 5 seconds).</li>
            <li>Wrong guess: 0 points, and 3 seconds come off your remaining time.</li>
            <li>The run ends the instant the clock hits zero.</li>
          </ul>
          {!user && (
            <p className="muted" style={{ marginBottom: 16 }}>
              Sign in to save your score and appear on the leaderboard — you can still play as a guest.
            </p>
          )}
          <div className="center">
            <button className="btn btn-green btn-lg" onClick={() => void start()}>
              Start
            </button>
          </div>
        </div>
      )}

      {phase === 'loading' && <div className="spinner" />}

      {phase === 'playing' && clip && (
        <div className="game">
          <div className="streak-banner" style={{ marginBottom: 12 }}>
            <span>
              Time <b>{secondsLeft}s</b>
            </span>
            <span>
              Score <b>{run.score}</b>
            </span>
            <span>
              Streak <b>{run.currentStreak}</b>
            </span>
          </div>

          <div className="video-frame">
            <video key={clip.clipId} src={clip.videoUrl} autoPlay muted playsInline preload="auto" />
          </div>

          <div className="card">
            {flash ? (
              <div className={`verdict ${flash.correct ? 'correct' : 'wrong'}`}>
                <h2>{flash.correct ? 'Correct!' : `It was ${flash.actualRank}`}</h2>
              </div>
            ) : (
              <>
                <div className="card-title center">What rank is this player?</div>
                <RankPicker onPick={(r) => void guess(r)} disabled={pending} />
                <p className="shortcut-hint">Tip: press 1–9 to pick a rank</p>
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'ended' && summary && (
        <div className="card">
          <div className="verdict correct">
            <h2>Run over</h2>
            <p>
              <span className="pill">{summary.score} pts</span>
            </p>
          </div>

          <div className="streak-banner" style={{ marginTop: 12 }}>
            <span>
              Accuracy{' '}
              <b>
                {summary.correctCount}/{summary.totalCount}
              </b>
            </span>
            <span>
              Best streak <b>{summary.bestStreak}</b>
            </span>
          </div>

          {user ? (
            personalBest && (
              <p className="muted center" style={{ marginTop: 12 }}>
                {personalBest.score === summary.score ? 'New personal best!' : `Personal best: ${personalBest.score} pts`}
              </p>
            )
          ) : (
            <p className="muted center" style={{ marginTop: 12 }}>
              Sign in to save your score and appear on the leaderboard.
            </p>
          )}

          <div className="center" style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <ShareButton
              text={buildBlitzShareText({
                score: summary.score,
                correctCount: summary.correctCount,
                totalCount: summary.totalCount,
                bestStreak: summary.bestStreak,
              })}
            />
            <button className="btn btn-green btn-lg" onClick={() => void start()}>
              Play again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
