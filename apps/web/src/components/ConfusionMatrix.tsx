import { useState } from 'react';
import { RANKS, RANK_COLORS, type ConfusionCell, type Rank } from '@6mansdle/shared';

/**
 * Actual rank (rows) vs guessed rank (columns), shaded by each cell's share of its row.
 * The diagonal (actual === guessed) is the "got it right" line. Used both for the community-wide
 * matrix on the stats page and for a single player's own matrix on their profile.
 */
export function ConfusionMatrix({ cells, title }: { cells: ConfusionCell[]; title?: string }) {
  const [hover, setHover] = useState<{ actual: Rank; guessed: Rank } | null>(null);

  const rowTotals = new Map<Rank, number>();
  for (const c of cells) rowTotals.set(c.actualRank, (rowTotals.get(c.actualRank) ?? 0) + c.count);

  const byPos = new Map<string, ConfusionCell>();
  for (const c of cells) byPos.set(`${c.actualRank}:${c.guessedRank}`, c);

  return (
    <div className="confusion-wrap">
      {title && <div className="card-title">{title}</div>}
      <div className="confusion-grid" role="table" aria-label={title ?? 'Actual rank versus guessed rank'}>
        <div className="confusion-corner" aria-hidden="true">
          <span>Actual \ Guessed</span>
        </div>
        {RANKS.map((rank) => (
          <div key={`col-${rank}`} className="confusion-head" style={{ color: RANK_COLORS[rank] }}>
            {rank}
          </div>
        ))}

        {RANKS.map((actualRank) => (
          <div className="confusion-row" role="row" key={actualRank}>
            <div className="confusion-head confusion-rowhead" style={{ color: RANK_COLORS[actualRank] }}>
              {actualRank}
            </div>
            {RANKS.map((guessedRank) => {
              const cell = byPos.get(`${actualRank}:${guessedRank}`);
              const count = cell?.count ?? 0;
              const total = rowTotals.get(actualRank) ?? 0;
              const share = total ? count / total : 0;
              const isDiagonal = actualRank === guessedRank;
              const isHovered = hover?.actual === actualRank && hover?.guessed === guessedRank;
              return (
                <div
                  key={guessedRank}
                  role="cell"
                  className={`confusion-cell ${isDiagonal ? 'is-diagonal' : ''} ${isHovered ? 'is-hovered' : ''}`}
                  style={{ background: `rgba(88, 101, 242, ${0.08 + share * 0.72})` }}
                  onMouseEnter={() => setHover({ actual: actualRank, guessed: guessedRank })}
                  onMouseLeave={() => setHover((h) => (h?.actual === actualRank && h?.guessed === guessedRank ? null : h))}
                  title={`Actual ${actualRank}, guessed ${guessedRank}: ${count} (${Math.round(share * 100)}% of ${actualRank} guesses)`}
                >
                  {count > 0 ? count : ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {hover && (
        <p className="confusion-tooltip muted">
          Actual <b style={{ color: RANK_COLORS[hover.actual] }}>{hover.actual}</b>, guessed{' '}
          <b style={{ color: RANK_COLORS[hover.guessed] }}>{hover.guessed}</b>:{' '}
          {(() => {
            const cell = byPos.get(`${hover.actual}:${hover.guessed}`);
            const count = cell?.count ?? 0;
            const total = rowTotals.get(hover.actual) ?? 0;
            const share = total ? Math.round((count / total) * 100) : 0;
            return `${count} guess${count === 1 ? '' : 'es'} (${share}% of actual ${hover.actual} clips)`;
          })()}
        </p>
      )}
    </div>
  );
}
