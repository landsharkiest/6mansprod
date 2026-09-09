import { RANKS, RANK_COLORS, type Rank } from '@6mansdle/shared';

interface Props {
  onPick: (rank: Rank) => void;
  disabled?: boolean;
  guessed?: Rank | null;
  answer?: Rank | null;
}

export function RankPicker({ onPick, disabled, guessed, answer }: Props) {
  return (
    <div className="rank-grid" role="group" aria-label="Guess the rank">
      {RANKS.map((rank) => {
        const cls = ['rank-btn', rank === guessed && 'is-guess', rank === answer && 'is-answer'].filter(Boolean).join(' ');
        // On the result screen (disabled) the grid isn't a set of choices anymore, so it's not
        // meaningfully "pressed" — aria-pressed is reserved for the live picker.
        const pressedProps = disabled ? {} : { 'aria-pressed': rank === guessed };
        return (
          <button
            key={rank}
            type="button"
            className={cls}
            style={{ ['--rank' as string]: RANK_COLORS[rank] }}
            disabled={disabled}
            onClick={() => onPick(rank)}
            aria-label={`Guess rank ${rank}`}
            {...pressedProps}
          >
            {rank}
          </button>
        );
      })}
    </div>
  );
}
