import React, { useEffect, useRef, useCallback, useState } from 'react';

const IDLE_START = 20_000;
const FADE_MS = 3000;
const BUILD_SPEED = 0.75;
const LAYER_OFFSETS = [0, 30, 55];
const MAX_LAYERS = 3;
const CYCLE_FRAMES = 2400; // full day-night cycle
const SCREEN_COLORS = ['#e04060', '#40a0e0', '#40c080', '#e0a030', '#c060d0'];
const BILLBOARD_TEXTS = ['NEON', 'CYBER', 'PIXEL', 'DATA', 'FLUX', 'SYNC', 'GRID', 'NOVA'];

// Night → dawn → day → dusk → night
// t: 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk, 1=midnight
function ambientColor(t) {
  // Building base colors per phase
  if (t < 0.2)       return { r: 20, g: 20, b: 30 };   // deep night
  if (t < 0.35)      { const p = (t - 0.2) / 0.15; return lerpC({ r: 20, g: 20, b: 30 }, { r: 50, g: 40, b: 45 }, p); } // dawn
  if (t < 0.5)       { const p = (t - 0.35) / 0.15; return lerpC({ r: 50, g: 40, b: 45 }, { r: 60, g: 55, b: 50 }, p); } // morning
  if (t < 0.65)      return { r: 60, g: 55, b: 50 };   // noon
  if (t < 0.8)       { const p = (t - 0.65) / 0.15; return lerpC({ r: 60, g: 55, b: 50 }, { r: 45, g: 30, b: 40 }, p); } // dusk
  const p = (t - 0.8) / 0.2; return lerpC({ r: 45, g: 30, b: 40 }, { r: 20, g: 20, b: 30 }, p); // evening
}

function lerpC(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function windowAlpha(t) {
  // Brighter at night, dimmer during day
  if (t < 0.2 || t > 0.8) return 0.4;
  if (t > 0.35 && t < 0.65) return 0.15;
  return 0.25;
}

function windowColor(t) {
  // Night: white/blue. Day: warm yellow
  if (t < 0.25 || t > 0.75) return { r: 200, g: 210, b: 240 }; // cool white
  return { r: 255, g: 230, b: 170 }; // warm
}

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
    const antenna = Math.random() > 0.55 ? 3 + Math.floor(Math.random() * 12) : 0;
    let billboard = null, screen = null;
    if (layerIdx === 0 && w > 18 && h > 35) {
      if (Math.random() < 0.12) billboard = { text: BILLBOARD_TEXTS[Math.floor(Math.random() * BILLBOARD_TEXTS.length)], y: 8 + Math.floor(Math.random() * 10) };
      else if (Math.random() < 0.10) screen = { color: SCREEN_COLORS[Math.floor(Math.random() * SCREEN_COLORS.length)], y: 6 + Math.floor(Math.random() * 8), h: 8 + Math.floor(Math.random() * 6) };
    }
    const columnLight = layerIdx === 0 && Math.random() < 0.25;
    // Per-building color variation seed
    const colorSeed = Math.random();
    buildings.push({ x, w, h, windows: makeWindows(w, h), antenna, billboard, screen, columnLight, colorSeed });
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
  const [isActive, setIsActive] = useState(false);
  const stateRef = useRef({
    active: false, opacity: 1,
    layers: [], currentLayer: 0, buildCursor: 0,
    skyPhase: false, cycleFrame: 0,
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

  const handleDismiss = useCallback(() => {
    const s = stateRef.current;
    if (s.active && !s.fadingOut) {
      s.fadingOut = true; s.fadeStart = Date.now();
    }
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
        s.layers = [{ buildings: generateBuildings(W, 0), offset: LAYER_OFFSETS[0], direction: -1 }];
        s.currentLayer = 0; s.buildCursor = 0;
        s.skyPhase = false; s.cycleFrame = 0;
        setIsActive(true);
      }

      if (s.fadingOut) {
        s.opacity = Math.max(0, 1 - (Date.now() - s.fadeStart) / FADE_MS);
        if (s.opacity <= 0) {
          s.active = false; s.fadingOut = false; s.opacity = 1;
          s.layers = []; s.skyPhase = false;
          setIsActive(false);
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
            s.layers.push({ buildings: generateBuildings(W, s.currentLayer), offset: LAYER_OFFSETS[s.currentLayer], direction: dir });
          } else if (!s.skyPhase) {
            s.skyPhase = true; s.cycleFrame = 0;
          }
        }
      }

      // Ambient cycle (0→1 over CYCLE_FRAMES, looping)
      let timeOfDay = 0; // start at night during build
      if (s.skyPhase) {
        s.cycleFrame++;
        timeOfDay = (s.cycleFrame % CYCLE_FRAMES) / CYCLE_FRAMES;
      }
      const amb = ambientColor(timeOfDay);
      const winAlpha = windowAlpha(timeOfDay);
      const winCol = windowColor(timeOfDay);

      // Draw layers back-to-front
      for (let li = s.layers.length - 1; li >= 0; li--) {
        const l = s.layers[li];
        const isCurrent = li === s.currentLayer;
        const cursor = isCurrent ? s.buildCursor : W + 40;
        // Layer depth darkening: back layers slightly lighter
        const depthMul = 1 + li * 0.15;

        for (const b of l.buildings) {
          let revealed;
          if (l.direction === -1) revealed = cursor >= (W - b.x);
          else revealed = cursor >= (b.x + b.w);
          if (!isCurrent) revealed = true;
          if (!revealed) continue;

          const bx = b.x, fullH = b.h + l.offset, by = H - fullH;

          // Building body — gradient from base color to slightly lighter top
          const br = Math.floor(amb.r * depthMul + b.colorSeed * 8);
          const bg = Math.floor(amb.g * depthMul + b.colorSeed * 6);
          const bb = Math.floor(amb.b * depthMul + b.colorSeed * 10);
          const grad = ctx.createLinearGradient(bx, by, bx, H);
          grad.addColorStop(0, `rgb(${Math.min(255, br + 12)},${Math.min(255, bg + 10)},${Math.min(255, bb + 14)})`);
          grad.addColorStop(1, `rgb(${br},${bg},${bb})`);
          ctx.fillStyle = grad;
          ctx.fillRect(bx, by, b.w, fullH);

          // Antenna
          if (b.antenna > 0) {
            ctx.strokeStyle = `rgba(${br+30},${bg+30},${bb+30},0.5)`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(bx+b.w/2, by); ctx.lineTo(bx+b.w/2, by-b.antenna); ctx.stroke();
            if (Math.sin(s.cycleFrame * 0.08 + bx) > 0.3) {
              ctx.fillStyle = 'rgba(255,60,60,0.8)';
              ctx.beginPath(); ctx.arc(bx+b.w/2, by-b.antenna, 1.2, 0, Math.PI*2); ctx.fill();
            }
          }

          // Billboard
          if (b.billboard && li === 0) {
            const bbd = b.billboard, bbY = by + bbd.y;
            ctx.fillStyle = `rgb(${Math.max(0,br-10)},${Math.max(0,bg-10)},${Math.max(0,bb-10)})`;
            ctx.fillRect(bx+1, bbY, b.w-2, 8);
            const hue = (s.cycleFrame * 0.5 + bx) % 360;
            ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
            ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center';
            ctx.fillText(bbd.text, bx + b.w/2, bbY + 6);
            ctx.textAlign = 'start';
          }

          // Screen
          if (b.screen && li === 0) {
            const sc = b.screen, scY = by + sc.y;
            const flicker = Math.sin(s.cycleFrame * 0.1 + bx * 0.3);
            const ci = Math.floor(((s.cycleFrame * 0.02 + bx) % SCREEN_COLORS.length + SCREEN_COLORS.length) % SCREEN_COLORS.length);
            ctx.fillStyle = SCREEN_COLORS[ci];
            ctx.globalAlpha *= (0.4 + flicker * 0.15);
            ctx.fillRect(bx+2, scY, b.w-4, sc.h);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(bx+2, scY + ((s.cycleFrame * 0.5 + bx) % sc.h), b.w-4, 1);
            ctx.globalAlpha = s.fadingOut ? s.opacity : 1;
          }

          // Column lights
          if (b.columnLight && li === 0) {
            const isDay = timeOfDay > 0.3 && timeOfDay < 0.7;
            const lc = isDay ? `rgba(255,220,160,0.25)` : `rgba(160,180,220,0.2)`;
            ctx.fillStyle = lc;
            ctx.beginPath(); ctx.arc(bx+2, H-1, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(bx+b.w-2, H-1, 2, 0, Math.PI*2); ctx.fill();
            const lg = ctx.createLinearGradient(bx, H, bx, by+fullH*0.4);
            lg.addColorStop(0, lc); lg.addColorStop(1, 'transparent');
            ctx.fillStyle = lg;
            ctx.fillRect(bx, by+fullH*0.4, b.w, fullH*0.6);
          }

          // Windows — color and brightness follow ambient
          for (const win of b.windows) {
            const a = winAlpha + Math.random() * 0.06;
            ctx.fillStyle = `rgba(${winCol.r},${winCol.g},${winCol.b},${a})`;
            ctx.fillRect(bx+win.wx, by+win.wy, 2, 2);
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

  return <canvas ref={canvasRef} className={`idle-skyline${isActive ? ' idle-skyline-active' : ''}`} onClick={handleDismiss} width={800} height={140} />;
}
