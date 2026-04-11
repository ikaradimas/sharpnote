import React, { useEffect, useRef } from 'react';

const IDLE_START = 20_000;
const FADE_MS = 3000;
const BUILD_SPEED = 0.35;
// Base matches status bar gradient: #141418 → #111116
const LAYER_COLORS = ['#141418', '#1c1c24', '#262632'];
const SUN_COLOR = '#ff8844';
const SUN_GLOW = '#ffd080';
const MAX_LAYERS = 3;
const MAX_SUN_R = 28;

function generateBuildings(width) {
  const buildings = [];
  let x = width + 10;
  while (x > -30) {
    const w = 14 + Math.floor(Math.random() * 30);
    const h = 18 + Math.floor(Math.random() * 60);
    const gap = 3 + Math.floor(Math.random() * 8);
    x -= w + gap;
    // Sparse, irregular windows — only ~20% of possible slots
    const windows = [];
    const colSpacing = 5 + Math.floor(Math.random() * 4);
    const rowSpacing = 6 + Math.floor(Math.random() * 5);
    for (let wy = 5 + Math.floor(Math.random() * 4); wy < h - 4; wy += rowSpacing) {
      for (let wx = 2 + Math.floor(Math.random() * 3); wx < w - 3; wx += colSpacing) {
        if (Math.random() < 0.2) {
          const brightness = 120 + Math.floor(Math.random() * 136); // 120-255: gray to white
          windows.push({ wx, wy, brightness });
        }
      }
    }
    const antenna = Math.random() > 0.75 ? 3 + Math.floor(Math.random() * 10) : 0;
    buildings.push({ x, w, h, windows, antenna });
  }
  // Sort right-to-left (highest X first) so we can reveal from right edge
  buildings.sort((a, b) => b.x - a.x);
  return buildings;
}

export function IdleSkyline() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const stateRef = useRef({
    active: false,
    opacity: 1,
    layers: [],
    currentLayer: 0,
    buildProgress: 0, // how far left we've built (pixels from right edge)
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

      // Activate
      if (idle > IDLE_START && !s.active && !s.fadingOut) {
        s.active = true;
        s.opacity = 1;
        s.layers = [{ buildings: generateBuildings(W), color: LAYER_COLORS[0] }];
        s.currentLayer = 0;
        s.buildProgress = 0;
        s.sunY = 0;
        s.sunPhase = false;
      }

      // Deactivate
      if (idle < IDLE_START && s.active && !s.fadingOut) {
        s.fadingOut = true;
        s.fadeStart = Date.now();
      }

      // Fade out
      if (s.fadingOut) {
        s.opacity = Math.max(0, 1 - (Date.now() - s.fadeStart) / FADE_MS);
        if (s.opacity <= 0) {
          s.active = false; s.fadingOut = false; s.opacity = 1;
          s.layers = []; s.sunY = 0; s.sunPhase = false;
        }
      }

      ctx.clearRect(0, 0, W, H);

      if (s.active || s.fadingOut) {
        ctx.globalAlpha = s.fadingOut ? s.opacity : 1;

        // Advance build progress
        if (s.active && !s.fadingOut) {
          s.buildProgress += BUILD_SPEED;

          // Check if current layer is fully built
          const curLayer = s.layers[s.currentLayer];
          const allRevealed = curLayer && s.buildProgress >= W + 40;
          if (allRevealed && s.currentLayer < MAX_LAYERS - 1) {
            s.currentLayer++;
            s.buildProgress = 0;
            s.layers.push({ buildings: generateBuildings(W), color: LAYER_COLORS[s.currentLayer] });
          } else if (allRevealed && s.currentLayer >= MAX_LAYERS - 1 && !s.sunPhase) {
            s.sunPhase = true;
          }
        }

        // Sun
        if (s.sunPhase && s.sunY < MAX_SUN_R) s.sunY += 0.12;
        if (s.sunY > 0) {
          const sunX = W * 0.75, sunCY = H - s.sunY * 1.5;
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

        // Draw layers back-to-front
        for (let li = 0; li < s.layers.length; li++) {
          const l = s.layers[li];
          const isCurrent = li === s.currentLayer;
          // Reveal threshold: buildings with x > (W - buildProgress) are visible
          const revealEdge = isCurrent ? W - s.buildProgress : -40; // past layers fully visible

          for (const b of l.buildings) {
            if (b.x > revealEdge) continue;

            const bx = b.x, by = H - b.h;

            // Building body
            ctx.fillStyle = l.color;
            ctx.fillRect(bx, by, b.w, b.h);
            if (sunInfluence > 0) {
              ctx.fillStyle = `rgba(255, 180, 80, ${sunInfluence * (0.12 + li * 0.08)})`;
              ctx.fillRect(bx, by, b.w, b.h);
            }

            // Antenna
            if (b.antenna > 0) {
              ctx.strokeStyle = `rgba(80, 80, 100, 0.6)`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(bx + b.w / 2, by);
              ctx.lineTo(bx + b.w / 2, by - b.antenna);
              ctx.stroke();
            }

            // Windows — gray to white tones
            for (const win of b.windows) {
              const v = win.brightness;
              const alpha = sunInfluence > 0.5 ? 0.5 + sunInfluence * 0.4 : 0.25 + Math.random() * 0.15;
              ctx.fillStyle = `rgba(${v}, ${v}, ${Math.min(255, v + 10)}, ${alpha})`;
              ctx.fillRect(bx + win.wx, by + win.wy, 2, 2);
            }
          }
        }

        ctx.globalAlpha = 1;
      }

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
