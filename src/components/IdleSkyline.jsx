import React, { useEffect, useRef, useCallback, useState } from 'react';

const IDLE_START = 20_000;
const FADE_MS = 3000;
const BUILD_SPEED = 0.75;   // 50% faster than 0.5
const LAYER_COLORS = ['#141418', '#1c1c24', '#262632'];
const LAYER_OFFSETS = [0, 30, 55];
const MAX_LAYERS = 3;
const BODY_R = 10;
const ARC_FRAMES = 1200;
const SCREEN_COLORS = ['#e04060', '#40a0e0', '#40c080', '#e0a030', '#c060d0'];
const BILLBOARD_TEXTS = ['NEON', 'CYBER', 'PIXEL', 'DATA', 'FLUX', 'SYNC', 'GRID', 'NOVA'];

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
    // 30% more antennas (0.75→0.55 threshold)
    const antenna = Math.random() > 0.55 ? 3 + Math.floor(Math.random() * 12) : 0;
    // Front layer: billboards on wide+tall buildings, screens on some
    let billboard = null, screen = null;
    if (layerIdx === 0 && w > 18 && h > 35) {
      if (Math.random() < 0.12) {
        billboard = { text: BILLBOARD_TEXTS[Math.floor(Math.random() * BILLBOARD_TEXTS.length)], y: 8 + Math.floor(Math.random() * 10) };
      } else if (Math.random() < 0.10) {
        screen = { color: SCREEN_COLORS[Math.floor(Math.random() * SCREEN_COLORS.length)], y: 6 + Math.floor(Math.random() * 8), h: 8 + Math.floor(Math.random() * 6) };
      }
    }
    // Front layer: column lights on some buildings
    const columnLight = layerIdx === 0 && Math.random() < 0.25;
    buildings.push({ x, w, h, windows: makeWindows(w, h), antenna, billboard, screen, columnLight });
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

  // Click anywhere to dismiss
  const handleDismiss = useCallback(() => {
    const s = stateRef.current;
    if (s.active && !s.fadingOut) {
      s.fadingOut = true;
      s.fadeStart = Date.now();
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
        s.layers = [{ buildings: generateBuildings(W, 0), color: LAYER_COLORS[0], offset: LAYER_OFFSETS[0], direction: -1 }];
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
            s.layers.push({ buildings: generateBuildings(W, s.currentLayer), color: LAYER_COLORS[s.currentLayer], offset: LAYER_OFFSETS[s.currentLayer], direction: dir });
          } else if (!s.skyPhase) {
            s.skyPhase = true; s.cycleFrame = 0;
          }
        }
      }

      // Celestial cycle
      let bodyX = -100, bodyY = -100, isSun = false, arcT = 0;
      if (s.skyPhase) {
        s.cycleFrame++;
        const fullCycle = ARC_FRAMES * 2;
        const phase = s.cycleFrame % fullCycle;
        isSun = phase >= ARC_FRAMES;
        arcT = (phase % ARC_FRAMES) / ARC_FRAMES;
        const skyTop = H - LAYER_OFFSETS[MAX_LAYERS - 1] - 50;
        const skyBase = H - LAYER_OFFSETS[MAX_LAYERS - 1] - 5;
        bodyY = skyBase - Math.sin(arcT * Math.PI) * (skyBase - skyTop);
        bodyX = isSun ? -20 + (W + 40) * arcT : W + 20 - (W + 40) * arcT;
      }
      const bodyInfluence = s.skyPhase ? Math.sin(arcT * Math.PI) : 0;

      // Draw celestial body
      if (s.skyPhase && bodyInfluence > 0.01) {
        const r = BODY_R;
        const pulse = 1 + Math.sin(s.cycleFrame * 0.03) * 0.1;
        if (isSun) {
          const glareR = r * 3 * pulse;
          const grad = ctx.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, glareR);
          grad.addColorStop(0, `rgba(255,136,68,${0.35*pulse})`); grad.addColorStop(0.3, `rgba(255,208,128,${0.15*pulse})`); grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(bodyX, bodyY, glareR, 0, Math.PI*2); ctx.fill();
          ctx.save(); ctx.translate(bodyX, bodyY); ctx.rotate(s.cycleFrame * 0.004);
          for (let i = 0; i < 8; i++) { const a=(i/8)*Math.PI*2, rl=r*(2+Math.sin(s.cycleFrame*0.05+i)*0.6); ctx.strokeStyle=`rgba(255,200,100,${0.06*pulse})`; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(Math.cos(a)*r*0.8,Math.sin(a)*r*0.8); ctx.lineTo(Math.cos(a)*rl,Math.sin(a)*rl); ctx.stroke(); }
          ctx.restore();
          ctx.fillStyle='#ff8844'; ctx.beginPath(); ctx.arc(bodyX,bodyY,r,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#ffd080'; ctx.beginPath(); ctx.arc(bodyX,bodyY,r*0.45,0,Math.PI*2); ctx.fill();
        } else {
          const glareR = r * 2.5 * pulse;
          const grad = ctx.createRadialGradient(bodyX,bodyY,0,bodyX,bodyY,glareR);
          grad.addColorStop(0,`rgba(180,200,240,${0.25*pulse})`); grad.addColorStop(0.4,`rgba(140,160,200,${0.1*pulse})`); grad.addColorStop(1,'transparent');
          ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(bodyX,bodyY,glareR,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#c8d4e8'; ctx.beginPath(); ctx.arc(bodyX,bodyY,r,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#1c1c24'; ctx.beginPath(); ctx.arc(bodyX+3,bodyY-1,r*0.8,0,Math.PI*2); ctx.fill();
        }
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

          const bx = b.x, fullH = b.h + l.offset, by = H - fullH;

          // Building body
          ctx.fillStyle = l.color;
          ctx.fillRect(bx, by, b.w, fullH);

          // Celestial tint
          if (bodyInfluence > 0.05) {
            const dist = Math.abs(bx + b.w/2 - bodyX) / W;
            const prox = Math.max(0, 1 - dist * 2.5);
            const str = bodyInfluence * (0.08 + li * 0.04) * prox;
            ctx.fillStyle = isSun ? `rgba(255,180,80,${str})` : `rgba(140,170,220,${str*0.7})`;
            ctx.fillRect(bx, by, b.w, fullH);
          }

          // Antenna
          if (b.antenna > 0) {
            ctx.strokeStyle = 'rgba(80,80,100,0.5)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(bx+b.w/2, by); ctx.lineTo(bx+b.w/2, by-b.antenna); ctx.stroke();
            // Blinking light on top
            if (Math.sin(s.cycleFrame * 0.08 + bx) > 0.3) {
              ctx.fillStyle = 'rgba(255,60,60,0.8)';
              ctx.beginPath(); ctx.arc(bx+b.w/2, by-b.antenna, 1.2, 0, Math.PI*2); ctx.fill();
            }
          }

          // Billboard
          if (b.billboard && li === 0) {
            const bb = b.billboard;
            const bbY = by + bb.y;
            // Neon sign above building
            ctx.fillStyle = '#0a0a10';
            ctx.fillRect(bx+1, bbY, b.w-2, 8);
            const hue = (s.cycleFrame * 0.5 + bx) % 360;
            ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
            ctx.font = 'bold 6px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(bb.text, bx + b.w/2, bbY + 6);
            ctx.textAlign = 'start';
          }

          // Giant screen (animated color cycling)
          if (b.screen && li === 0) {
            const sc = b.screen;
            const scY = by + sc.y;
            const flicker = Math.sin(s.cycleFrame * 0.1 + bx * 0.3);
            const colorIdx = Math.floor(((s.cycleFrame * 0.02 + bx) % SCREEN_COLORS.length + SCREEN_COLORS.length) % SCREEN_COLORS.length);
            ctx.fillStyle = SCREEN_COLORS[colorIdx];
            ctx.globalAlpha *= (0.4 + flicker * 0.15);
            ctx.fillRect(bx+2, scY, b.w-4, sc.h);
            // Scan line
            const scanY = scY + ((s.cycleFrame * 0.5 + bx) % sc.h);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(bx+2, scanY, b.w-4, 1);
            ctx.globalAlpha = s.fadingOut ? s.opacity : 1;
          }

          // Column lights (front row only)
          if (b.columnLight && li === 0) {
            const lightColor = bodyInfluence > 0.3 && isSun ? 'rgba(255,220,160,0.3)' : 'rgba(160,180,220,0.2)';
            ctx.fillStyle = lightColor;
            // Two lights at base of building
            ctx.beginPath(); ctx.arc(bx+2, H-1, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(bx+b.w-2, H-1, 2, 0, Math.PI*2); ctx.fill();
            // Upward glow cone
            const grad = ctx.createLinearGradient(bx, H, bx, by+fullH*0.4);
            grad.addColorStop(0, lightColor);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(bx, by+fullH*0.4, b.w, fullH*0.6);
          }

          // Windows
          for (const win of b.windows) {
            const v = win.brightness;
            let a = 0.2 + Math.random() * 0.1;
            if (bodyInfluence > 0.3) {
              const dist = Math.abs(bx+win.wx-bodyX) / W;
              if (dist < 0.12 && Math.random() > 0.6) a = isSun ? 0.6+bodyInfluence*0.4 : 0.3+bodyInfluence*0.3;
              else a = 0.2 + bodyInfluence * 0.2;
            }
            ctx.fillStyle = `rgba(${v},${v},${Math.min(255,v+10)},${a})`;
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
