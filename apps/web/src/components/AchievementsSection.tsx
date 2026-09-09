import { ACHIEVEMENTS } from '@6mansdle/shared';
import type { UserProfile } from '@6mansdle/shared';

interface Props {
  earned: UserProfile['achievements'];
}

/** Full catalogue, earned badges lit and sorted first (most recent first), the rest dimmed. */
export function AchievementsSection({ earned }: Props) {
  const earnedAt = new Map(earned.map((e) => [e.id, e.earnedAt]));
  const sorted = [...ACHIEVEMENTS].sort((a, b) => {
    const ea = earnedAt.get(a.id);
    const eb = earnedAt.get(b.id);
    if (!!ea !== !!eb) return ea ? -1 : 1;
    if (ea && eb) return new Date(eb).getTime() - new Date(ea).getTime();
    return 0;
  });

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-title">
        Achievements{' '}
        <span className="muted" style={{ fontWeight: 400 }}>
          · {earned.length}/{ACHIEVEMENTS.length}
        </span>
      </div>
      <div className="achievement-grid">
        {sorted.map((a) => {
          const when = earnedAt.get(a.id);
          return (
            <div
              key={a.id}
              className={`achievement tier-${a.tier} ${when ? 'earned' : 'locked'}`}
              title={a.description}
            >
              <span className="achievement-emoji" aria-hidden="true">
                {a.emoji}
              </span>
              <div className="achievement-body">
                <div className="achievement-name">{a.name}</div>
                <div className="achievement-desc">{a.description}</div>
                {when && <div className="achievement-date">Earned {new Date(when).toLocaleDateString()}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
