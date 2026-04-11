import React, { useEffect, useRef } from 'react';

const IDLE_START = 20_000;
const FADE_MS = 3000;
const BUILD_SPEED = 0.5;
const LAYER_COLORS = ['#141418', '#1c1c24', '#262632'];
const LAYER_OFFSETS = [0, 30, 55];
const SUN_COLOR = '#ff8844';
const SUN_GLOW = '#ffd080';
const MAX_LAYERS = 3;
const MAX_SUN_R = 14;

function generateBuildings(width, layerIdx = 0) {
  const buildings = [];
  let x = -10;
  const hMin = layerIdx === 0 ? 18 : layerIdx === 1 ? 14 : 10;
  const hMax = layerIdx === 0 ? 60 : layerIdx === 1 ? 40 : 25;
  const wMin = layerIdx === 0 ? 14 : 10;
  const wMax = layerIdx === 0 ? 30 : layerIdx === 1 ? 24 : 18;
  while (x < width + 30) {
    const w = wMin + Math.floor(Math.random() * (wMax - wMin));
    const h = hMin + Math.floor(Math.random() * (hMax - hMin));
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
    active: false, opacity: 1,
    layers: [], currentLayer: 0, buildCursor: 0,
    sunY: 0, sunPhase: false, sunFrame: 0,
    fadingOut: false, fadeStart: 0,
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

    const resize = () => { canvas.width = window.innerWidth; canvas.height = 140; };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const s = stateRef.current;
      const W = canvas.width, H = canvas.height;
      const idle = Date.now() - lastActivityRef.current;

      if (idle > IDLE_START && !s.active && !s.fadingOut) {
        s.active = true; s.opacity = 1;
        s.layers = [{ buildings: generateBuildings(W, 0), color: LAYER_COLORS[0], offset: LAYER_OFFSETS[0], direction: -1 }];
        s.currentLayer = 0; s.buildCursor = 0;
        s.sunY = 0; s.sunPhase = false; s.sunFrame = 0;
      }

      if (idle < IDLE_START && s.active && !s.fadingOut) {
        s.fadingOut = true; s.fadeStart = Date.now();
      }

      if (s.fadingOut) {
        s.opacity = Math.max(0, 1 - (Date.now() - s.fadeStart) / FADE_MS);
        if (s.opacity <= 0) {
          s.active = false; s.fadingOut = false; s.opacity = 1;
          s.layers = []; s.sunY = 0; s.sunPhase = false;
        }
      }

      ctx.clearRect(0, 0, W, H);
      if (!s.active && !s.fadingOut) { animRef.current = requestAnimationFrame(loop); return; }

      ctx.globalAlpha = s.fadingOut ? s.opacity : 1;

      if (s.active && !s.fadingOut) {
        s.buildCursor += BUILD_SPEED;
        if (s.buildCursor >= W + 40) {
          if (s.currentLayer < MAX_LAYERS - 1) {
            s.currentLayer++;
            s.buildCursor = 0;
            const dir = s.currentLayer % 2 === 0 ? -1 : 1;
            s.layers.push({ buildings: generateBuildings(W, s.currentLayer), color: LAYER_COLORS[s.currentLayer], offset: LAYER_OFFSETS[s.currentLayer], direction: dir });
          } else if (!s.sunPhase) {
            s.sunPhase = true;
          }
        }
      }

      // Sun — smaller, with animated glare
      if (s.sunPhase) { s.sunY = Math.min(s.sunY + 0.1, MAX_SUN_R); s.sunFrame++; }
      const sunInfluence = s.sunPhase ? Math.min(1, s.sunY / MAX_SUN_R) : 0;
      const sunX = W * 0.75;
      const sunCY = H - LAYER_OFFSETS[MAX_LAYERS - 1] - s.sunY * 2;

      if (s.sunY > 0) {
        const r = Math.min(s.sunY, MAX_SUN_R);
        // Animated glare pulse
        const pulse = 1 + Math.sin(s.sunFrame * 0.03) * 0.15;
        const glareR = r * 3 * pulse;

        // Outer glare
        const grad = ctx.createRadialGradient(sunX, sunCY, 0, sunX, sunCY, glareR);
        grad.addColorStop(0, `rgba(255, 136, 68, ${0.4 * pulse})`);
        grad.addColorStop(0.3, `rgba(255, 208, 128, ${0.2 * pulse})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sunX, sunCY, glareR, 0, Math.PI * 2); ctx.fill();

        // Light rays
        ctx.save();
        ctx.translate(sunX, sunCY);
        ctx.rotate(s.sunFrame * 0.004);
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const rayLen = r * (2 + Math.sin(s.sunFrame * 0.05 + i) * 0.8);
          ctx.strokeStyle = `rgba(255, 200, 100, ${0.08 * pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * r * 0.8, Math.sin(angle) * r * 0.8);
          ctx.lineTo(Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
          ctx.stroke();
        }
        ctx.restore();

        // Sun disc
        ctx.fillStyle = SUN_COLOR;
        ctx.beginPath(); ctx.arc(sunX, sunCY, r, 0, Math.PI * 2); ctx.fill();
        // Bright center
        ctx.fillStyle = SUN_GLOW;
        ctx.beginPath(); ctx.arc(sunX, sunCY, r * 0.5, 0, Math.PI * 2); ctx.fill();
      }

      // Draw layers back-to-front
      for (let li = s.layers.length - 1; li >= 0; li--) {
        const l = s.layers[li];
        const isCurrent = li === s.currentLayer;
        const cursor = isCurrent ? s.buildCursor : W + 40;

        for (const b of l.buildings) {
          let revealed;
          if (l.direction === -1) revealed = cursor >= (W - b.x);
          else revealed = cursor >= (b.x + b.w);
          if (!isCurrent) revealed = true;
          if (!revealed) continue;

          const bx = b.x;
          const fullH = b.h + l.offset; // taller for back layers so roofline peeks above
          const by = H - fullH;         // all buildings anchored at canvas bottom

          // Building body
          ctx.fillStyle = l.color;
          ctx.fillRect(bx, by, b.w, fullH);

          // Sun warm tint — animated intensity
          if (sunInfluence > 0) {
            const pulse = 1 + Math.sin(s.sunFrame * 0.03) * 0.1;
            const warmth = sunInfluence * (0.1 + li * 0.06) * pulse;
            // Gradient: warmer on the sun-facing side
            const distFromSun = Math.abs(bx + b.w / 2 - sunX) / W;
            const proximity = Math.max(0, 1 - distFromSun * 2);
            ctx.fillStyle = `rgba(255, 180, 80, ${warmth * (0.5 + proximity * 0.5)})`;
            ctx.fillRect(bx, by, b.w, fullH);
          }

          // Antenna
          if (b.antenna > 0) {
            ctx.strokeStyle = 'rgba(80, 80, 100, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + b.w / 2, by);
            ctx.lineTo(bx + b.w / 2, by - b.antenna);
            ctx.stroke();
          }

          // Windows
          for (const win of b.windows) {
            const v = win.brightness;
            let a = 0.2 + Math.random() * 0.1;
            if (sunInfluence > 0.3) {
              // Sun-facing windows can catch a glint
              const distFromSun = Math.abs(bx + win.wx - sunX) / W;
              if (distFromSun < 0.15 && Math.random() > 0.6) {
                a = 0.6 + sunInfluence * 0.4; // bright sun reflection
              } else {
                a = 0.25 + sunInfluence * 0.3;
              }
            }
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

  return <canvas ref={canvasRef} className="idle-skyline" width={800} height={140} />;
}
