import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayableClip, WhoGuessResponse, WhoPlayer } from '@6mansdle/shared';
import { api, ApiRequestError } from '../api/client';
import { ClipPlayer } from '../components/ClipPlayer';
import { fireConfetti } from '../lib/confetti';

export function WhoPage() {
  const [players, setPlayers] = useState<WhoPlayer[]>([]);
  const [clip, setClip] = useState<PlayableClip | null>(null);
  const [result, setResult] = useState<WhoGuessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (exclude?: string) => {
    setError(null);
    setClip(null);
    setResult(null);
    try {
      setClip(await api.whoClip(exclude));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load a clip');
    }
  }, []);

  useEffect(() => {
    void load();
    api.whoPlayers().then(setPlayers).catch(() => undefined);
  }, [load]);

  const next = () => clip && void load(clip.clipId);

  return (
    <div className="page container">
      <h1 className="page-title">Who's that player?</h1>
      <p className="page-subtitle">Watch the clip and name the 6mans player. Results here don't affect your rank streaks.</p>

      {error && <div className="notice error">{error}</div>}
      {!clip && !error && <div className="spinner" />}
      {clip && (
        <div className="game">
          <WhoRound key={clip.clipId} clip={clip} players={players} onResult={setResult} />
          {result && (
            <div className="center" style={{ marginTop: 16 }}>
              <button className="btn btn-green btn-lg" onClick={next}>
                Next clip
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WhoRound({
  clip,
  players,
  onResult,
}: {
  clip: PlayableClip;
  players: WhoPlayer[];
  onResult: (r: WhoGuessResponse) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<WhoGuessResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players.slice(0, 12);
    // Prefix matches first, then substring matches.
    const pre = players.filter((p) => p.name.toLowerCase().startsWith(q));
    const sub = players.filter((p) => !p.name.toLowerCase().startsWith(q) && p.name.toLowerCase().includes(q));
    return [...pre, ...sub].slice(0, 12);
  }, [players, query]);

  useEffect(() => {
    if (result?.correct) return fireConfetti();
  }, [result?.correct]);

  const guess = async (player: WhoPlayer) => {
    if (pending || result) return;
    setPending(true);
    setError(null);
    try {
      const res = await api.whoGuess({ clipId: clip.clipId, playerId: player.id });
      setResult(res);
      onResult(res);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not submit your guess');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <ClipPlayer videoRef={videoRef} src={clip.videoUrl} />

      {!result ? (
        <div className="card">
          <div className="card-title center">Who is this?</div>
          <input
            type="search"
            className="who-search"
            placeholder="Start typing a player's name…"
            aria-label="Search players"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                e.preventDefault();
                void guess(matches[0]);
              }
            }}
          />
          <div className="who-options" role="group" aria-label="Players">
            {matches.map((p) => (
              <button key={p.id} type="button" className="btn" disabled={pending} onClick={() => void guess(p)}>
                {p.name}
              </button>
            ))}
            {matches.length === 0 && <p className="muted">No player matches “{query}”.</p>}
          </div>
          {error && (
            <div className="notice error" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className={`verdict ${result.correct ? 'correct' : 'wrong'}`} role="status" aria-live="polite">
            <h2>{result.correct ? 'Correct!' : 'Not this time'}</h2>
            <p>
              {result.correct ? 'It was' : (
                <>
                  You guessed <span className="pill">{result.guessedPlayer.name}</span> but it was
                </>
              )}{' '}
              <span className="pill">{result.actualPlayer.name}</span> (rank <span className="pill">{result.actualRank}</span>)
            </p>
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
                You'd already answered this clip, so this one doesn't affect your run.
              </p>
            )}
          </div>
          <div style={{ marginTop: 20 }}>
            <div className="card-title">How everyone guessed</div>
            <ul className="who-top">
              {result.topGuesses.map((g) => (
                <li key={g.player.id}>
                  <span>{g.player.name}</span>
                  <b>{g.count}</b>
                </li>
              ))}
            </ul>
            <p className="muted center" style={{ margin: '8px 0 0' }}>
              {result.totalGuesses} guesses, {result.accuracy}% correct
            </p>
          </div>
        </div>
      )}
    </>
  );
}
