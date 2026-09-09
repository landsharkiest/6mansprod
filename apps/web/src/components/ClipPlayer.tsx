import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const LOOP_KEY = 'sixmansdle.clipPlayer.loop';
const SPEED_KEY = 'sixmansdle.clipPlayer.speed';
const MUTED_KEY = 'sixmansdle.clipPlayer.muted';

type Speed = 0.5 | 1;
type Status = 'loading' | 'ready' | 'error';

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable, nothing to do */
  }
}

interface Props {
  /** Forwarded straight to the <video> element so callers (the "R" shortcut) can drive playback. */
  videoRef: RefObject<HTMLVideoElement>;
  src: string;
}

/**
 * Clip player used by GameBoard. Wraps a native <video> (controls stay native, so fullscreen and
 * scrubbing keep working) with loop/speed/mute preferences persisted to localStorage, a loading
 * state, an error state with retry, a big mobile tap-to-replay overlay, and a "watched N times"
 * counter. Remounts per clip (parent keys it by clipId), so all of this state is naturally fresh
 * for each new clip while preferences are re-read from localStorage.
 */
export function ClipPlayer({ videoRef, src }: Props) {
  const [loop, setLoop] = useState(() => readPref(LOOP_KEY) !== '0'); // default ON
  const [speed, setSpeed] = useState<Speed>(() => (readPref(SPEED_KEY) === '0.5' ? 0.5 : 1));
  const [muted, setMuted] = useState(() => readPref(MUTED_KEY) === '1');
  const [status, setStatus] = useState<Status>('loading');
  const [paused, setPaused] = useState(false);
  const [watchedCount, setWatchedCount] = useState(0);
  const [showUnmuteChip, setShowUnmuteChip] = useState(false);

  // Keep the native playbackRate/loop in sync with our controlled preferences.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.loop = loop;
  }, [loop, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed, videoRef]);

  const attemptPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const playResult = video.play();
    if (playResult && typeof playResult.then === 'function') {
      playResult.catch(() => {
        // Autoplay with sound was blocked: fall back to muted autoplay and let the viewer
        // opt back in with the "Unmute" chip.
        const v = videoRef.current;
        if (!v) return;
        v.muted = true;
        setMuted(true);
        writePref(MUTED_KEY, '1');
        setShowUnmuteChip(true);
        v.play().catch(() => {
          /* still blocked (e.g. no user gesture yet); native controls can still start it */
        });
      });
    }
  }, [videoRef]);

  // Kick off playback once per mount (i.e. once per clip, since the parent remounts us by key).
  useEffect(() => {
    attemptPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleLoop = () => {
    setLoop((prev) => {
      const next = !prev;
      writePref(LOOP_KEY, next ? '1' : '0');
      return next;
    });
  };

  const toggleSpeed = () => {
    setSpeed((prev) => {
      const next: Speed = prev === 1 ? 0.5 : 1;
      writePref(SPEED_KEY, String(next));
      return next;
    });
  };

  const handleUnmute = () => {
    const video = videoRef.current;
    if (video) video.muted = false;
    setMuted(false);
    writePref(MUTED_KEY, '0');
    setShowUnmuteChip(false);
  };

  const handleVolumeChange = () => {
    const video = videoRef.current;
    if (!video) return;
    setMuted(video.muted);
    writePref(MUTED_KEY, video.muted ? '1' : '0');
  };

  const handleReplay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play();
  };

  const handleRetry = () => {
    const video = videoRef.current;
    setStatus('loading');
    setShowUnmuteChip(false);
    video?.load();
    attemptPlay();
  };

  const showTapOverlay = status === 'ready' && paused;

  return (
    <div className="video-frame clip-player">
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay
        playsInline
        muted={muted}
        preload="auto"
        onLoadStart={() => setStatus('loading')}
        onCanPlay={() => setStatus('ready')}
        onError={() => setStatus('error')}
        onPlay={() => {
          setPaused(false);
          setWatchedCount((c) => c + 1);
        }}
        onPause={() => setPaused(true)}
        onEnded={() => setPaused(true)}
        onVolumeChange={handleVolumeChange}
      />

      {status === 'loading' && (
        <div className="clip-status-overlay" role="status">
          <div className="spinner" style={{ margin: 0 }} />
          <p>Loading clip&hellip;</p>
        </div>
      )}

      {status === 'error' && (
        <div className="clip-status-overlay">
          <p>Couldn&rsquo;t load this clip.</p>
          <button type="button" className="btn btn-blurple" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {showTapOverlay && (
        <button type="button" className="clip-replay-overlay" onClick={handleReplay} aria-label="Replay clip">
          <ReplayIcon />
        </button>
      )}

      {showUnmuteChip && (
        <button type="button" className="clip-unmute-chip" onClick={handleUnmute}>
          🔇 Unmute
        </button>
      )}

      <div className="clip-toolbar">
        <button
          type="button"
          className={`clip-toggle ${loop ? 'is-on' : ''}`}
          onClick={toggleLoop}
          aria-pressed={loop}
        >
          Loop {loop ? 'On' : 'Off'}
        </button>
        <button type="button" className="clip-toggle" onClick={toggleSpeed} aria-pressed={speed === 0.5}>
          {speed}x
        </button>
        <span className="clip-watched muted">Watched {watchedCount} time{watchedCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

function ReplayIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"
        fill="currentColor"
      />
    </svg>
  );
}
