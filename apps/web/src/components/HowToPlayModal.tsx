import { useEffect, useRef } from 'react';
import { RANKS, RANK_COLORS } from '@6mansdle/shared';

const SEEN_KEY = 'sixmansdle.seenHowToPlay';

/** True the first time this browser has ever seen the modal (localStorage, best-effort). */
export function hasSeenHowToPlay(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // storage unavailable: don't force the modal open on every visit
  }
}

export function markHowToPlaySeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage unavailable, nothing to do */
  }
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * "How to play" dialog: ranks, how the daily works, and tips. Opened automatically on a
 * visitor's first visit to /daily or /play, and manually from the nav "?" button.
 * Accessible: role=dialog, traps Tab focus, Esc closes, and focus returns to the opener.
 */
export function HowToPlayModal({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? dialog)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="how-to-play-title">How to play</h2>
          <button type="button" className="btn btn-ghost modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <section className="modal-panel">
            <h3>The ranks</h3>
            <p className="muted">From best to worst:</p>
            <ul className="modal-rank-list">
              {RANKS.map((rank) => (
                <li key={rank}>
                  <span className="rank-swatch" style={{ background: RANK_COLORS[rank] }} aria-hidden="true" />
                  {rank}
                </li>
              ))}
            </ul>
          </section>

          <section className="modal-panel">
            <h3>The daily</h3>
            <p>
              Everyone gets one clip per UTC day. Guess right and come back tomorrow to keep a streak going &mdash;
              streaks need consecutive days. Sign in with Discord to keep your streak and appear on the
              leaderboard.
            </p>
          </section>

          <section className="modal-panel">
            <h3>Tips</h3>
            <ul>
              <li>
                Press <kbd>1</kbd>&ndash;<kbd>9</kbd> to pick a rank (S through H) without clicking.
              </li>
              <li>
                Press <kbd>R</kbd> to replay the clip.
              </li>
              <li>After you guess, share your result with the Share button.</li>
            </ul>
          </section>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-blurple" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
