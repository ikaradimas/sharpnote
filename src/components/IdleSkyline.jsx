import React, { useEffect, useRef } from 'react';

const IDLE_START = 20_000;
const FADE_MS = 3000;
const BUILD_SPEED = 0.5;
const LAYER_COLORS = ['#141418', '#1c1c24', '#262632'];
const LAYER_OFFSETS = [0, 50, 100]; // each layer rises higher
const SUN_COLOR = '#ff8844';
const SUN_GLOW = '#ffd080';
const MAX_LAYERS = 3;
const MAX_SUN_R = 28;

function generateBuildings(width) {
  const buildings = [];
  let x = -10;
  while (x < width + 30) {
    const w = 14 + Math.floor(Math.random() * 30);
    const h = 18 + Math.floor(Math.random() * 60);
    const gap = 3 + Math.floor(Math.random() * 8);
    buildings.push({ x, w, h, windows: makeWindows(w, h), antenna: Math.random() > 0.75 ? 3 + Math.floor(Math.random() * 10) : 0 });
    x += w + gap;
  }
  return buildings;
}

function makeWindows(bw, bh) {
  const wins = [];
  const colStep = 5 + Math.floor(Math.random() * 4);
  const rowStep = 6 + Math.floor(Math.random() * 5);
  for (let wy = 5 + Math.floor(Math.random() * 4); wy < bh - 4; wy += rowStep)
    for (let wx = 2 + Math.floor(Math.random() * 3); wx < bw - 3; wx += colStep)
      if (Math.random() < 0.2)
        wins.push({ wx, wy, brightness: 120 + Math.floor(Math.random() * 136) });
  return wins;
}

export function IdleSkyline() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const stateRef = useRef({
    active: false,
    opacity: 1,
    layers: [],       // { buildings, color, offset, direction: 1|-1 }
    currentLayer: 0,
    buildCursor: 0,   // how far the reveal has progressed in pixels
    sunY: 0,
    sunPhase: false,
    fadingOut: false,
    fadeStart: 0,
  });

  useEffect(() => {
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('mousedown', onActivity);
    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('mousedown', onActivity);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = 120; };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const s = stateRef.current;
      const W = canvas.width, H = canvas.height;
      const idle = Date.now() - lastActivityRef.current;

      if (idle > IDLE_START && !s.active && !s.fadingOut) {
        s.active = true;
        s.opacity = 1;
        // Layer 0: right-to-left, layer 1: left-to-right, layer 2: right-to-left
        s.layers = [{
          buildings: generateBuildings(W),
          color: LAYER_COLORS[0],
          offset: LAYER_OFFSETS[0],
          direction: -1, // right to left
        }];
        s.currentLayer = 0;
        s.buildCursor = 0;
        s.sunY = 0;
        s.sunPhase = false;
      }

      if (idle < IDLE_START && s.active && !s.fadingOut) {
        s.fadingOut = true;
        s.fadeStart = Date.now();
      }

      if (s.fadingOut) {
        s.opacity = Math.max(0, 1 - (Date.now() - s.fadeStart) / FADE_MS);
        if (s.opacity <= 0) {
          s.active = false; s.fadingOut = false; s.opacity = 1;
          s.layers = []; s.sunY = 0; s.sunPhase = false;
        }
      }

      ctx.clearRect(0, 0, W, H);

      if (!s.active && !s.fadingOut) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }

      ctx.globalAlpha = s.fadingOut ? s.opacity : 1;

      // Advance build cursor
      if (s.active && !s.fadingOut) {
        s.buildCursor += BUILD_SPEED;

        // Layer complete when cursor exceeds screen width + margin
        if (s.buildCursor >= W + 40) {
          if (s.currentLayer < MAX_LAYERS - 1) {
            s.currentLayer++;
            s.buildCursor = 0;
            const dir = s.currentLayer % 2 === 0 ? -1 : 1; // alternate direction
            s.layers.push({
              buildings: generateBuildings(W),
              color: LAYER_COLORS[s.currentLayer],
              offset: LAYER_OFFSETS[s.currentLayer],
              direction: dir,
            });
          } else if (!s.sunPhase) {
            s.sunPhase = true;
          }
        }
      }

      // Sun
      if (s.sunPhase && s.sunY < MAX_SUN_R) s.sunY += 0.12;
      if (s.sunY > 0) {
        const sunX = W * 0.75, sunCY = H - LAYER_OFFSETS[MAX_LAYERS - 1] - s.sunY * 1.5;
        const r = Math.min(s.sunY, MAX_SUN_R);
        const grad = ctx.createRadialGradient(sunX, sunCY, 0, sunX, sunCY, r * 2.5);
        grad.addColorStop(0, SUN_COLOR);
        grad.addColorStop(0.4, SUN_GLOW);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sunX, sunCY, r * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = SUN_COLOR;
        ctx.beginPath(); ctx.arc(sunX, sunCY, r, 0, Math.PI * 2); ctx.fill();
      }

      const sunInfluence = s.sunPhase ? Math.min(1, s.sunY / MAX_SUN_R) : 0;

      // Draw layers back-to-front (index 0 = back)
      for (let li = 0; li < s.layers.length; li++) {
        const l = s.layers[li];
        const isCurrent = li === s.currentLayer;
        const cursor = isCurrent ? s.buildCursor : W + 40; // past layers fully revealed

        for (const b of l.buildings) {
          // Check if this building is revealed based on direction
          // direction -1 (right-to-left): reveal from right edge, so building at right side of screen appears first
          // direction +1 (left-to-right): reveal from left edge
          let revealed;
          if (l.direction === -1) {
            // Right-to-left: building is revealed when cursor has swept past (W - b.x)
            revealed = cursor >= (W - b.x);
          } else {
            // Left-to-right: building is revealed when cursor has swept past (b.x + b.w)
            revealed = cursor >= (b.x + b.w);
          }
          if (!isCurrent) revealed = true; // past layers fully visible

          if (!revealed) continue;

          const bx = b.x;
          const by = H - l.offset - b.h;

          ctx.fillStyle = l.color;
          ctx.fillRect(bx, by, b.w, b.h + l.offset); // extend down to bottom
          if (sunInfluence > 0) {
            ctx.fillStyle = `rgba(255, 180, 80, ${sunInfluence * (0.12 + li * 0.08)})`;
            ctx.fillRect(bx, by, b.w, b.h + l.offset);
          }

          if (b.antenna > 0) {
            ctx.strokeStyle = 'rgba(80, 80, 100, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + b.w / 2, by);
            ctx.lineTo(bx + b.w / 2, by - b.antenna);
            ctx.stroke();
          }

          for (const win of b.windows) {
            const v = win.brightness;
            const a = sunInfluence > 0.5 ? 0.5 + sunInfluence * 0.4 : 0.2 + Math.random() * 0.15;
            ctx.fillStyle = `rgba(${v}, ${v}, ${Math.min(255, v + 10)}, ${a})`;
            ctx.fillRect(bx + win.wx, by + win.wy, 2, 2);
          }
        }
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="idle-skyline" width={800} height={120} />;
}
