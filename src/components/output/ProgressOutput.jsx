import React from 'react';

export function ProgressOutput({ spec }) {
  const { label, current, total, pct, done } = spec;
  const displayPct = Math.min(100, Math.max(0, pct ?? 0));
  return (
    <div className={`progress-output${done ? ' progress-output--done' : ''}`}>
      <div className="progress-header">
        {label && <span className="progress-label">{label}</span>}
        <span className="progress-pct">{done ? '✓ Done' : `${Math.round(displayPct)}%`}</span>
        {total > 0 && <span className="progress-count">{current} / {total}</span>}
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${displayPct}%` }} />
      </div>
    </div>
  );
}
