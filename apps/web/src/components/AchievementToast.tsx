import { useEffect, useState } from 'react';
import type { Achievement } from '@6mansdle/shared';

interface Props {
  achievements: Achievement[];
}

const AUTO_DISMISS_MS = 5000;

/**
 * "Achievement unlocked" banner for achievements a guess just earned. Auto-dismisses after a
 * few seconds, can be dismissed early, and is announced via aria-live so it doesn't need focus.
 */
export function AchievementToast({ achievements }: Props) {
  const [visible, setVisible] = useState(achievements.length > 0);

  useEffect(() => {
    setVisible(achievements.length > 0);
    if (achievements.length === 0) return;
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [achievements]);

  if (!visible || achievements.length === 0) return null;

  return (
    <div className="achievement-toast" role="status" aria-live="polite">
      {achievements.map((a) => (
        <div key={a.id} className="achievement-toast-item">
          <span className="achievement-toast-emoji" aria-hidden="true">
            {a.emoji}
          </span>
          <span>
            Achievement unlocked: <b>{a.name}</b>
          </span>
          <button
            type="button"
            className="achievement-toast-close"
            aria-label="Dismiss"
            onClick={() => setVisible(false)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
