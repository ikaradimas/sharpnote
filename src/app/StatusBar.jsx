import React, { useState, useEffect } from 'react';
import { isNotebookId } from '../utils.js';
import { registerCursorPosSetter } from '../components/editor/CodeEditor.jsx';

function MemorySparkline({ history }) {
  const W = 80, H = 22, PAD = 2;
  const BAR_W = 2, GAP = 1;
  const n = Math.min(history.length, Math.floor((W - PAD * 2) / (BAR_W + GAP)));
  const slice = history.slice(-n);

  if (slice.length === 0) {
    return <svg width={W} height={H} style={{ display: 'block', opacity: 0.2 }}><rect x={0} y={H/2} width={W} height={1} fill="currentColor"/></svg>;
  }

  const max = Math.max(...slice);
  const min = Math.min(...slice);
  const range = max - min || 1;
  const isLatest = (i) => i === slice.length - 1;

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {slice.map((v, i) => {
        const barH = Math.max(2, ((v - min) / range) * (H - PAD * 2));
        const x = PAD + i * (BAR_W + GAP);
        const y = H - PAD - barH;
        return (
          <rect
            key={i}
            x={x} y={y} width={BAR_W} height={barH}
            fill="var(--accent-primary)"
            opacity={isLatest(i) ? 1 : 0.45}
            rx="0.5"
          />
        );
      })}
    </svg>
  );
}

export function StatusBar({ notebooks, activeId }) {
  const nb = isNotebookId(activeId) ? notebooks.find((n) => n.id === activeId) : null;
  const history = nb?.memoryHistory ?? [];
  const current = history.length > 0 ? history[history.length - 1] : null;
  const peak    = history.length > 0 ? Math.max(...history) : null;
  const anyRunning = nb ? nb.running?.size > 0 : false;
  const totalCells = nb ? nb.cells?.filter((c) => c.type === 'code' || c.type === 'sql').length : 0;

  const [cursorPos, setCursorPos] = useState(null);
  useEffect(() => {
    registerCursorPosSetter(setCursorPos);
    return () => { registerCursorPosSetter(null); };
  }, []);

  return (
    <div className="status-bar">
      <span className="status-label">MEM</span>
      <MemorySparkline history={history} />
      <span className="status-mem-value">
        {current != null ? `${current.toFixed(1)} MB` : '— MB'}
      </span>
      {peak != null && (
        <span className="status-mem-peak">peak {peak.toFixed(1)}</span>
      )}
      {nb?.memoryWarning && (
        <span className="status-mem-warning" title="Kernel memory usage is high">⚠ {nb.memoryWarning}</span>
      )}
      <span className="status-spacer" />
      {nb && (
        <span className={`status-save-dot${nb.isDirty ? ' status-save-unsaved' : ''}`}
              title={nb.isDirty ? 'Unsaved changes' : 'Saved'} />
      )}
      {anyRunning && <span className="status-running-spinner" title="Cell executing" />}
      {cursorPos && (
        <span className="status-cursor-pos">
          {cursorPos.cellIndex != null ? `Cell ${cursorPos.cellIndex + 1}/${totalCells}  ` : ''}Ln {cursorPos.line}  Col {cursorPos.col}
        </span>
      )}
    </div>
  );
}
