import React, { useMemo } from 'react';

const CELL  = 12;   // px per day cell (incl. 2px gap)
const GAP   = 2;
const ROWS  = 7;    // Sun..Sat
const TOP   = 22;   // header height for month labels
const LEFT  = 26;   // weekday label gutter
const HUE   = '#569cd6';
const MONTHS  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function parseDate(s) {
  // s is "yyyy-MM-dd" — Date constructor parses ISO; force UTC noon to avoid TZ shifts.
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function isoDay(d) { return d.toISOString().slice(0, 10); }
function dayOfWeek(d) { return d.getUTCDay(); }

export function CalendarHeatOutput({ spec }) {
  const layout = useMemo(() => {
    const values = spec?.values ?? [];
    if (!values.length) return null;

    const valueByDate = new Map(values.map(v => [v.date, v.value]));
    const dates = values.map(v => parseDate(v.date)).sort((a, b) => a - b);
    const start = spec?.startDate ? parseDate(spec.startDate) : dates[0];
    const end   = spec?.endDate   ? parseDate(spec.endDate)   : dates[dates.length - 1];

    // Snap start back to the previous Sunday so the column index is consistent.
    const gridStart = new Date(start);
    gridStart.setUTCDate(gridStart.getUTCDate() - dayOfWeek(gridStart));

    const cells = [];
    const monthLabels = [];
    let lastMonth = -1;
    let col = 0;
    for (let cur = new Date(gridStart); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
      const dow = dayOfWeek(cur);
      const inRange = cur >= start && cur <= end;
      cells.push({
        date: isoDay(cur),
        col,
        row: dow,
        value: valueByDate.get(isoDay(cur)) ?? 0,
        inRange,
      });
      if (cur.getUTCMonth() !== lastMonth && dow === 0) {
        lastMonth = cur.getUTCMonth();
        monthLabels.push({ col, label: MONTHS[lastMonth] });
      }
      if (dow === 6) col++;
    }
    const max = Math.max(1, ...values.map(v => v.value));
    const cols = col + 1;
    return { cells, monthLabels, max, cols };
  }, [spec]);

  if (!layout) {
    return <div className="output-calendar-empty">No data to render.</div>;
  }

  const width  = LEFT + layout.cols * CELL + 8;
  const height = TOP + ROWS * CELL + 8;

  return (
    <svg className="output-calendar" width={width} height={height}>
      {layout.monthLabels.map((m) => (
        <text key={`m-${m.col}`} x={LEFT + m.col * CELL} y={14} fontSize="10" fill="#888">
          {m.label}
        </text>
      ))}
      {WEEKDAYS.map((label, i) =>
        label ? (
          <text key={`d-${i}`} x={0} y={TOP + i * CELL + 9} fontSize="9" fill="#888">
            {label}
          </text>
        ) : null,
      )}
      {layout.cells.map((c) => {
        const intensity = layout.max ? c.value / layout.max : 0;
        const fill = c.inRange
          ? (c.value > 0 ? HUE : '#222')
          : 'transparent';
        const opacity = c.value > 0 ? 0.2 + 0.8 * intensity : 1;
        return (
          <rect
            key={c.date}
            x={LEFT + c.col * CELL}
            y={TOP + c.row * CELL}
            width={CELL - GAP}
            height={CELL - GAP}
            rx={2}
            fill={fill}
            fillOpacity={opacity}
          >
            <title>{`${c.date}: ${c.value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
