import React, { useMemo, useState } from 'react';

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function Sparkline({ runs, width = 80, height = 18 }) {
  if (!runs?.length) return <svg width={width} height={height} />;
  const values = runs.map((r) => r.durationMs ?? 0);
  const max = Math.max(1, ...values);
  const step = runs.length > 1 ? width / (runs.length - 1) : 0;
  const points = values
    .map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="profile-sparkline">
      <polyline points={points} fill="none" stroke="#569cd6" strokeWidth="1" />
      {runs.map((r, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={height - ((r.durationMs ?? 0) / max) * (height - 2) - 1}
          r="1.5"
          fill={r.success ? '#4ec9b0' : '#e06070'}
        />
      ))}
    </svg>
  );
}

function summarise(cells, history) {
  return (cells || [])
    .filter((c) => c.type !== 'markdown')
    .map((cell) => {
      const runs = history?.[cell.id] ?? [];
      const last = runs.length ? runs[runs.length - 1].durationMs : null;
      const validDurations = runs.map((r) => r.durationMs).filter((d) => typeof d === 'number');
      const avg  = validDurations.length ? validDurations.reduce((s, d) => s + d, 0) / validDurations.length : null;
      const total = validDurations.reduce((s, d) => s + d, 0);
      return {
        cellId: cell.id,
        name: cell.name || cell.label || cell.id.slice(0, 8),
        last,
        avg,
        runs,
        runCount: runs.length,
        total,
      };
    })
    .filter((row) => row.runCount > 0);
}

export function ProfilePanel({ cells, cellRunHistory, onNavigateToCell }) {
  const [sortBy, setSortBy] = useState('last');
  const [sortDir, setSortDir] = useState('desc');

  const rows = useMemo(() => {
    const out = summarise(cells, cellRunHistory);
    const dir = sortDir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      const av = a[sortBy] ?? -Infinity;
      const bv = b[sortBy] ?? -Infinity;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
    return out;
  }, [cells, cellRunHistory, sortBy, sortDir]);

  const onSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'name' ? 'asc' : 'desc'); }
  };

  const arrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  if (rows.length === 0) {
    return (
      <div className="profile-panel">
        <div className="profile-panel-empty">
          Run any code cell to start collecting timing data here.
        </div>
      </div>
    );
  }

  return (
    <div className="profile-panel">
      <table className="profile-table">
        <thead>
          <tr>
            <th onClick={() => onSort('name')}>Cell{arrow('name')}</th>
            <th onClick={() => onSort('last')}  className="num">Last{arrow('last')}</th>
            <th onClick={() => onSort('avg')}   className="num">Avg{arrow('avg')}</th>
            <th onClick={() => onSort('runCount')} className="num">Runs{arrow('runCount')}</th>
            <th>Recent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.cellId}
              className="profile-row"
              onClick={() => onNavigateToCell?.(row.cellId)}
              role="button"
            >
              <td className="profile-cell-name">{row.name}</td>
              <td className="num">{fmtMs(row.last)}</td>
              <td className="num">{fmtMs(row.avg)}</td>
              <td className="num">{row.runCount}</td>
              <td><Sparkline runs={row.runs} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
