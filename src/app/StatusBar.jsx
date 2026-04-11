import React, { useState, useEffect, useMemo } from 'react';
import { Cpu, Loader2, Save, AlertTriangle, Container, Server } from 'lucide-react';
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

export function StatusBar({ notebooks, activeId, showFish = true }) {
  const nb = isNotebookId(activeId) ? notebooks.find((n) => n.id === activeId) : null;
  const history = nb?.memoryHistory ?? [];
  const current = history.length > 0 ? history[history.length - 1] : null;
  const peak    = history.length > 0 ? Math.max(...history) : null;
  const anyRunning = nb ? nb.running?.size > 0 : false;
  const totalCells = nb ? nb.cells?.length : 0;

  const [cursorPos, setCursorPos] = useState(null);
  useEffect(() => {
    registerCursorPosSetter(setCursorPos);
    return () => { registerCursorPosSetter(null); };
  }, []);

  const dockerCount = useMemo(() =>
    notebooks.reduce((sum, n) =>
      sum + (n.cells || []).filter((c) => c.type === 'docker' && c.containerState === 'running').length, 0),
    [notebooks]);

  const [mockCount, setMockCount] = useState(0);
  useEffect(() => {
    const poll = () => {
      window.electronAPI?.listMockServers?.().then((list) => {
        const next = list?.length ?? 0;
        setMockCount((prev) => prev === next ? prev : next);
      }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="status-bar">
      {showFish && (
        <span className="status-fish" aria-hidden="true">
          <span className="fish-body">
            <span className="fish-eye" />
            <span className="fish-tail" />
            <span className="fish-fin" />
          </span>
        </span>
      )}
      <Cpu size={10} className="status-icon" />
      <span className="status-label">MEM</span>
      <MemorySparkline history={history} />
      <span className="status-mem-value">
        {current != null ? `${current.toFixed(1)} MB` : '— MB'}
      </span>
      {peak != null && (
        <span className="status-mem-peak">peak {peak.toFixed(1)}</span>
      )}
      {nb?.memoryWarning && (
        <span className="status-mem-warning" title="Kernel memory usage is high"><AlertTriangle size={10} /> {nb.memoryWarning}</span>
      )}
      <span className="status-spacer" />
      {dockerCount > 0 && (
        <span className="status-docker" title={`${dockerCount} Docker container${dockerCount > 1 ? 's' : ''} running`}>
          <Container size={11} /> {dockerCount}
        </span>
      )}
      {mockCount > 0 && (
        <span className="status-mock" title={`${mockCount} mock server${mockCount > 1 ? 's' : ''} running`}>
          <Server size={11} /> {mockCount}
        </span>
      )}
      {nb && (
        <Save size={10} className={`status-save-icon${nb.isDirty ? ' status-save-unsaved' : ''}`}
              title={nb.isDirty ? 'Unsaved changes' : 'Saved'} />
      )}
      {anyRunning && <Loader2 size={11} className="status-running-icon" title="Cell executing" />}
      {cursorPos && (
        <span className="status-cursor-pos">
          {cursorPos.cellIndex != null ? `Cell ${cursorPos.cellIndex + 1}/${totalCells}  ` : ''}Ln {cursorPos.line}  Col {cursorPos.col}
        </span>
      )}
    </div>
  );
}
