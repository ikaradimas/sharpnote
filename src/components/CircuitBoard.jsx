import React, { useRef, useEffect } from 'react';

const W = 360, H = 200;
const TRACE_SPEED = 0.3;
const NODE_INTERVAL = 800;  // ms between new traces
const GRID = 16;
const TRACE_COLOR = 'rgba(140, 100, 180, 0.12)';   // faded purple
const NODE_COLOR = 'rgba(140, 100, 180, 0.2)';
const ACTIVE_COLOR = 'rgba(60, 140, 255, 0.4)';    // bright blue
const DIRS = [[1,0],[0,1],[-1,0],[0,-1]];

function snap(v) { return Math.round(v / GRID) * GRID; }

export function CircuitBoard() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const traces = [];   // completed: [{ x1, y1, x2, y2 }]
    const nodes = [];    // { x, y, r, pulse }
    const active = [];   // growing: { x, y, dx, dy, progress, length }
    let lastSpawn = 0;

    const spawnTrace = () => {
      // Start from a random grid point or existing node
      let sx, sy;
      if (nodes.length > 2 && Math.random() < 0.6) {
        const n = nodes[Math.floor(Math.random() * nodes.length)];
        sx = n.x; sy = n.y;
      } else {
        sx = snap(20 + Math.random() * (W - 40));
        sy = snap(20 + Math.random() * (H - 40));
      }
      const dir = DIRS[Math.floor(Math.random() * 4)];
      const segs = 1 + Math.floor(Math.random() * 3); // 1-3 segments in a row
      let cx = sx, cy = sy;
      for (let i = 0; i < segs; i++) {
        const len = GRID * (2 + Math.floor(Math.random() * 4));
        const d = i === 0 ? dir : DIRS[Math.floor(Math.random() * 4)];
        active.push({ x: cx, y: cy, dx: d[0], dy: d[1], progress: 0, length: len });
        cx += d[0] * len;
        cy += d[1] * len;
      }
      // Node at start
      if (!nodes.some(n => n.x === sx && n.y === sy)) {
        nodes.push({ x: sx, y: sy, r: 1.5 + Math.random() * 1.5, pulse: Math.random() * Math.PI * 2 });
      }
    };

    const loop = (time) => {
      // Spawn new traces periodically
      if (time - lastSpawn > NODE_INTERVAL && active.length < 15) {
        spawnTrace();
        lastSpawn = time;
      }

      ctx.clearRect(0, 0, W, H);

      // Draw completed traces
      ctx.strokeStyle = TRACE_COLOR;
      ctx.lineWidth = 1;
      for (const t of traces) {
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }

      // Advance and draw active traces
      ctx.strokeStyle = ACTIVE_COLOR;
      ctx.lineWidth = 1;
      for (let i = active.length - 1; i >= 0; i--) {
        const t = active[i];
        t.progress += TRACE_SPEED;
        const p = Math.min(t.progress, t.length);
        const ex = t.x + t.dx * p;
        const ey = t.y + t.dy * p;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Glow tip
        ctx.fillStyle = 'rgba(60, 140, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(ex, ey, 1.5, 0, Math.PI * 2);
        ctx.fill();

        if (t.progress >= t.length) {
          // Complete — move to permanent traces
          traces.push({ x1: t.x, y1: t.y, x2: t.x + t.dx * t.length, y2: t.y + t.dy * t.length });
          // Node at endpoint
          const nx = t.x + t.dx * t.length, ny = t.y + t.dy * t.length;
          if (nx > 2 && nx < W - 2 && ny > 2 && ny < H - 2 && !nodes.some(n => Math.abs(n.x - nx) < 4 && Math.abs(n.y - ny) < 4)) {
            nodes.push({ x: nx, y: ny, r: 1 + Math.random() * 1.5, pulse: Math.random() * Math.PI * 2 });
          }
          active.splice(i, 1);
        }
      }

      // Draw nodes with gentle pulse
      for (const n of nodes) {
        n.pulse += 0.015;
        const s = 1 + Math.sin(n.pulse) * 0.3;
        ctx.fillStyle = NODE_COLOR;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * s, 0, Math.PI * 2);
        ctx.fill();
      }

      // Trim old traces to prevent unbounded growth
      while (traces.length > 200) traces.shift();
      while (nodes.length > 60) nodes.shift();

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  return (
    <div className="circuit-board">
      <canvas ref={canvasRef} width={W} height={H} className="circuit-canvas" />
    </div>
  );
}
