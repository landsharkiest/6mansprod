import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameMode, GuessResponse, PlayableClip, Rank } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RankPicker } from './RankPicker';
import { DistributionChart } from './DistributionChart';
import { fireConfetti } from '../lib/confetti';
import { isConfirmKey, isNativeActivationTarget, isReplayKey, isTypingTarget, rankForKey } from '../lib/shortcuts';
import { ReportClipForm } from './ReportClipForm';

interface Props {
  clip: PlayableClip;
  mode: GameMode;
  /** Pre-existing result (daily already played). */
  initialResult?: GuessResponse | null;
  onResult?: (result: GuessResponse) => void;
  /** Rendered under the verdict (e.g. "Play another" or the countdown). */
  footer?: ReactNode;
  /** Endless mode only: Enter/Space on the result screen triggers this ("Next clip"). */
  onNext?: () => void;
}

const VERDICTS: Record<number, string> = {
  0: 'Correct!',
  1: 'So close, one rank off',
  2: 'Two ranks off',
};

export function GameBoard({ clip, mode, initialResult = null, onResult, footer, onNext }: Props) {
  const { user } = useAuth();
  const [result, setResult] = useState<GuessResponse | null>(initialResult);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const guess = async (rank: Rank) => {
    if (pending || result) return;
    setPending(true);
    setError(null);
    try {
      const res = await api.guess({ clipId: clip.clipId, rank, mode });
      setResult(res);
      onResult?.(res);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not submit your guess');
    } finally {
      setPending(false);
    }
  };

  // Confetti on a correct guess, in either mode. Cleans up on unmount / re-fire.
  useEffect(() => {
    if (!result?.correct) return;
    const stop = fireConfetti();
    return stop;
  }, [result?.correct, clip.clipId]);

  // Keyboard shortcuts: 1-9 pick a rank, R replays the clip, Enter/Space on the result
  // screen advances to the next clip in endless mode. Disabled while typing in a form field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;

      if (!result) {
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
          return;
        }
      } else if (mode === 'endless' && onNext && isConfirmKey(e.key) && !isNativeActivationTarget(document.activeElement)) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, mode, onNext, pending]);

  return (
    <div className="game">
      <div className="video-frame">
        <video
          ref={videoRef}
          key={clip.clipId}
          src={clip.videoUrl}
          controls
          autoPlay
          playsInline
          preload="auto"
        />
      </div>

      {!result && (
        <div className="card">
          <div className="card-title center">What rank is this player?</div>
          <RankPicker onPick={(r) => void guess(r)} disabled={pending} />
          <p className="shortcut-hint">Tip: press 1–9 to pick a rank, R to replay</p>
          {error && (
            <div className="notice error" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="card">
          <div className={`verdict ${result.correct ? 'correct' : 'wrong'}`}>
            <h2>{VERDICTS[result.distance] ?? 'Not this time'}</h2>
            <p>
              You guessed <span className="pill">{result.guessedRank}</span> and the answer was{' '}
              <span className="pill">{result.actualRank}</span>
            </p>
            {result.streak && (
              <div className="streak-banner">
                <span>
                  Streak <b>{result.streak.current}</b>
                </span>
                <span>
                  Best <b>{result.streak.best}</b>
                </span>
              </div>
            )}
            {result.run && (
              <div className="streak-banner">
                <span>
                  Run <b>{result.run.current}</b>
                </span>
                <span>
                  Best run <b>{result.run.best}</b>
                </span>
              </div>
            )}
            {!result.counted && (
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                You'd already answered this clip, so this one doesn't affect your run or accuracy.
              </p>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <RankPicker onPick={() => undefined} disabled guessed={result.guessedRank} answer={result.actualRank} />
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="card-title">How everyone guessed</div>
            <DistributionChart stats={result.stats} />
            <p className="muted center" style={{ margin: '8px 0 0' }}>
              {result.stats.totalGuesses} guesses, {result.stats.accuracy}% correct
            </p>
          </div>

          {user && (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <ReportClipForm clipId={clip.clipId} />
            </div>
          )}

          {footer && <div style={{ marginTop: 20, textAlign: 'center' }}>{footer}</div>}
        </div>
      )}
    </div>
  );
}
