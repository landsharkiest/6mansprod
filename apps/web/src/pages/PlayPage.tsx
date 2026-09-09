import { useCallback, useEffect, useState } from 'react';
import type { GuessResponse, PlayableClip } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { GameBoard } from '../components/GameBoard';
import { ChallengeButton } from '../components/ChallengeButton';

export function PlayPage() {
  const { user } = useAuth();
  const [clip, setClip] = useState<PlayableClip | null>(null);
  const [result, setResult] = useState<GuessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const load = useCallback(async (exclude?: string) => {
    setError(null);
    setClip(null);
    setResult(null);
    try {
      setClip(await api.randomClip(exclude));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load a clip');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleNext = useCallback(() => {
    if (!clip) return;
    setRound((r) => r + 1);
    void load(clip.clipId);
  }, [clip, load]);

  return (
    <div className="page container">
      <h1 className="page-title">Endless</h1>
      <p className="page-subtitle">Random clips, no limits. Results here don't affect your daily streak.</p>

      {error && <div className="notice error">{error}</div>}
      {!clip && !error && <div className="spinner" />}
      {clip && (
        <GameBoard
          key={`${clip.clipId}-${round}`}
          clip={clip}
          mode="endless"
          onResult={setResult}
          onNext={handleNext}
          footer={
            <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
              {user && result && <ChallengeButton clipId={clip.clipId} guessedRank={result.guessedRank} />}
              <button className="btn btn-green btn-lg" onClick={handleNext}>
                Next clip
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}
