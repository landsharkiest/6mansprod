import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityDay } from '@6mansdle/shared';

const WEEKS = 53;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** GitHub / LeetCode style year heatmap. Columns are weeks, rows Sunday..Saturday, all in UTC days. */
export function ActivityCalendar({ activity }: { activity: ActivityDay[] }) {
  const [hover, setHover] = useState<{ day: ActivityDay | null; date: string; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // On narrow screens the grid overflows; start at the right edge so today is visible.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [activity]);

  const { cells, monthLabels, totals } = useMemo(() => {
    const byDate = new Map(activity.map((a) => [a.date, a]));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    // Start on the Sunday that begins the window so columns line up as full weeks.
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (WEEKS * 7 - 1) - today.getUTCDay());

    const cells: Array<{ date: string; week: number; dow: number; day: ActivityDay | null; future: boolean }> = [];
    const monthLabels: Array<{ week: number; label: string }> = [];
    let lastMonth = -1;
    const cursor = new Date(start);
    for (let i = 0; i < WEEKS * 7; i++) {
      const week = Math.floor(i / 7);
      const dow = cursor.getUTCDay();
      const date = isoDay(cursor);
      if (dow === 0 && cursor.getUTCMonth() !== lastMonth) {
        lastMonth = cursor.getUTCMonth();
        monthLabels.push({ week, label: MONTHS[lastMonth]! });
      }
      cells.push({ date, week, dow, day: byDate.get(date) ?? null, future: cursor > today });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const activeDays = activity.filter((a) => a.guesses > 0 || a.daily !== 'none').length;
    const guesses = activity.reduce((s, a) => s + a.guesses, 0);
    return { cells, monthLabels, totals: { activeDays, guesses } };
  }, [activity]);

  const max = Math.max(1, ...activity.map((a) => a.guesses));
  const level = (g: number) => (g === 0 ? 0 : Math.min(4, 1 + Math.floor((g / max) * 3.999)));

  const CELL = 11;
  const GAP = 3;
  const width = WEEKS * (CELL + GAP);
  const height = 7 * (CELL + GAP);

  return (
    <div className="activity">
      <div className="activity-head">
        <span>
          <b>{totals.guesses}</b> {totals.guesses === 1 ? 'guess' : 'guesses'} on <b>{totals.activeDays}</b>{' '}
          {totals.activeDays === 1 ? 'day' : 'days'} in the last year
        </span>
        <span className="activity-legend">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={`activity-swatch lvl-${l}`} />
          ))}
          More
        </span>
      </div>
      <div className="activity-scroll" ref={scrollRef}>
        <svg width={width + 30} height={height + 20} className="activity-svg" role="img" aria-label="Activity calendar">
          {monthLabels.map((m) => (
            <text key={`${m.label}-${m.week}`} x={30 + m.week * (CELL + GAP)} y={10} className="activity-month">
              {m.label}
            </text>
          ))}
          {[1, 3, 5].map((dow) => (
            <text key={dow} x={0} y={20 + dow * (CELL + GAP) + CELL - 2} className="activity-month">
              {['', 'Mon', '', 'Wed', '', 'Fri', ''][dow]}
            </text>
          ))}
          {cells.map((c) => {
            const cls = c.future
              ? 'future'
              : c.day
                ? `lvl-${level(c.day.guesses)}${c.day.daily === 'correct' ? ' daily-ok' : c.day.daily === 'wrong' ? ' daily-miss' : ''}`
                : 'lvl-0';
            return (
              <rect
                key={c.date}
                x={30 + c.week * (CELL + GAP)}
                y={20 + c.dow * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                className={`activity-cell ${cls}`}
                onMouseEnter={(e) => setHover({ day: c.day, date: c.date, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
      </div>
      {hover && (
        <div className="activity-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <b>{hover.date}</b>
          <br />
          {hover.day ? `${hover.day.guesses} guess${hover.day.guesses === 1 ? '' : 'es'}` : 'No activity'}
          {hover.day && hover.day.daily !== 'none' && (
            <>
              <br />
              Daily: {hover.day.daily === 'correct' ? 'correct' : 'missed'}
            </>
          )}
        </div>
      )}
    </div>
  );
}
