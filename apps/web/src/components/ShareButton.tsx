import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  className?: string;
}

type ShareState = 'idle' | 'copied' | 'shared' | 'error';

/**
 * "Share result" button. Uses the Web Share API when available (mobile browsers, mostly),
 * otherwise copies to the clipboard and shows a brief "Copied!" confirmation.
 */
export function ShareButton({ text, className }: Props) {
  const [state, setState] = useState<ShareState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const flash = (next: ShareState) => {
    setState(next);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState('idle'), 2000);
  };

  const handleClick = async () => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;

    if (nav?.share) {
      try {
        await nav.share({ text });
        flash('shared');
        return;
      } catch {
        // User cancelled the share sheet, or it's unsupported for this payload — fall back below.
      }
    }

    try {
      await nav?.clipboard?.writeText(text);
      flash('copied');
    } catch {
      flash('error');
    }
  };

  const label = state === 'copied' ? 'Copied!' : state === 'shared' ? 'Shared!' : state === 'error' ? "Couldn't share" : 'Share result';

  return (
    <button type="button" className={className ?? 'btn btn-blurple'} onClick={() => void handleClick()}>
      {label}
    </button>
  );
}
