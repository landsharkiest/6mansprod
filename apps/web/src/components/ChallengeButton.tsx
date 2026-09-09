import { useState } from 'react';
import type { Rank } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';
import { ShareButton } from './ShareButton';
import { buildChallengeShareText } from '../lib/challenge';

interface Props {
  clipId: string;
  guessedRank: Rank;
}

/**
 * "Challenge a friend" for the endless result screen. Creating the link is idempotent server
 * side, so a re-click after the first just re-fetches the same token instead of erroring.
 */
export function ChallengeButton({ clipId, guessedRank }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await api.createChallenge({ clipId });
      setUrl(res.url);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create a challenge link');
    } finally {
      setPending(false);
    }
  };

  if (url) {
    return <ShareButton text={buildChallengeShareText({ guessedRank, url })} className="btn btn-blurple" />;
  }

  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
      <button type="button" className="btn" onClick={() => void create()} disabled={pending}>
        {pending ? 'Creating link…' : 'Challenge a friend'}
      </button>
      {error && (
        <div className="notice error" style={{ fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
    </div>
  );
}
