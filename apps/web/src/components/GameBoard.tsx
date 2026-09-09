import { useState, type ReactNode } from 'react';
import type { GameMode, GuessResponse, PlayableClip, Rank } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RankPicker } from './RankPicker';
import { DistributionChart } from './DistributionChart';
import { ReportClipForm } from './ReportClipForm';

interface Props {
  clip: PlayableClip;
  mode: GameMode;
  /** Pre-existing result (daily already played). */
  initialResult?: GuessResponse | null;
  onResult?: (result: GuessResponse) => void;
  /** Rendered under the verdict (e.g. "Play another" or the countdown). */
  footer?: ReactNode;
}

const VERDICTS: Record<number, string> = {
  0: 'Correct!',
  1: 'So close, one rank off',
  2: 'Two ranks off',
};

export function GameBoard({ clip, mode, initialResult = null, onResult, footer }: Props) {
  const { user } = useAuth();
  const [result, setResult] = useState<GuessResponse | null>(initialResult);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="game">
      <div className="video-frame">
        <video key={clip.clipId} src={clip.videoUrl} controls autoPlay playsInline preload="auto" />
      </div>

      {!result && (
        <div className="card">
          <div className="card-title center">What rank is this player?</div>
          <RankPicker onPick={(r) => void guess(r)} disabled={pending} />
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
