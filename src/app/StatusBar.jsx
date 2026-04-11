import React, { useState, useEffect, useMemo, useRef } from 'react';
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

const FISH_VARIANTS = [
  { color: '#2ec4b6', tailColor: '#2ec4b6', finColor: '#22a89c' },                   // teal (original)
  { color: '#e0943a', tailColor: '#e0943a', finColor: '#c47a20' },                   // orange
  { color: '#c084d0', tailColor: '#c084d0', finColor: '#a060b0' },                   // purple
  { color: '#569cd6', tailColor: '#569cd6', finColor: '#4080b8' },                   // blue
];

function OneFish({ variant, scale, offsetY, driftDelay, wiggleSpeed }) {
  const s = scale;
  return (
    <span
      className="status-fish"
      aria-hidden="true"
      style={{
        transform: `scale(${s})`,
        transformOrigin: 'left center',
        marginTop: offsetY,
        animationDelay: `${driftDelay}s`,
        opacity: Math.min(1, s + 0.2),
      }}
    >
      <span className="fish-body" style={{ background: variant.color, animationDuration: `${wiggleSpeed}s` }}>
        <span className="fish-eye" />
        <span className="fish-tail" style={{ borderLeftColor: variant.tailColor }} />
        <span className="fish-fin" style={{ borderTopColor: variant.finColor }} />
      </span>
    </span>
  );
}

function FishSwarm() {
  const [swarm, setSwarm] = useState([]);
  const phaseRef = useRef('solo'); // solo → growing → full → shrinking → solo
  const timerRef = useRef(null);

  useEffect(() => {
    const cycle = () => {
      const phase = phaseRef.current;
      if (phase === 'solo') {
        // After 8-15s, start spawning
        timerRef.current = setTimeout(() => {
          phaseRef.current = 'growing';
          cycle();
        }, 8000 + Math.random() * 7000);
      } else if (phase === 'growing') {
        // Add fish one at a time, up to 3 extra
        const count = Math.floor(Math.random() * 3) + 1; // 1-3 extra fish
        const newFish = [];
        for (let i = 0; i < count; i++) {
          newFish.push({
            id: i,
            variant: FISH_VARIANTS[1 + (i % 3)],
            scale: 0.65 - i * 0.15,   // 0.65, 0.50, 0.35 — clearly smaller each
            offsetY: (i % 2 === 0 ? -1 : 1) * (3 + i * 2),
            driftDelay: 0.3 + i * 0.5,
            wiggleSpeed: 0.6 + i * 0.2,
            spawnDelay: i * 600,
          });
        }
        // Stagger spawns
        newFish.forEach((f) => {
          setTimeout(() => setSwarm((prev) => [...prev, f]), f.spawnDelay);
        });
        // Stay full for 6-10s
        timerRef.current = setTimeout(() => {
          phaseRef.current = 'shrinking';
          cycle();
        }, (newFish.length * 600) + 6000 + Math.random() * 4000);
      } else if (phase === 'shrinking') {
        // Remove fish one at a time
        const shrink = (remaining) => {
          if (remaining <= 0) {
            setSwarm([]);
            phaseRef.current = 'solo';
            cycle();
            return;
          }
          setTimeout(() => {
            setSwarm((prev) => prev.slice(0, -1));
            shrink(remaining - 1);
          }, 800);
        };
        setSwarm((prev) => {
          shrink(prev.length);
          return prev;
        });
      }
    };
    cycle();
    return () => clearTimeout(timerRef.current);
  }, []);

  // Bubbles: 3 tiny circles that rise and fade, staggered
  const bubbles = [0, 1, 2];

  return (
    <span className="status-fish-swarm">
      <span className="fish-wave fish-wave-1" />
      <span className="fish-wave fish-wave-2" />
      {bubbles.map((i) => (
        <span key={i} className={`fish-bubble fish-bubble-${i}`} />
      ))}
      <OneFish variant={FISH_VARIANTS[0]} scale={1} offsetY={0} driftDelay={0} wiggleSpeed={0.8} />
      {swarm.map((f) => (
        <OneFish key={f.id} variant={f.variant} scale={f.scale} offsetY={f.offsetY}
                 driftDelay={f.driftDelay} wiggleSpeed={f.wiggleSpeed} />
      ))}
    </span>
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
      {showFish && <FishSwarm />}
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
