import React, { useState, useEffect, useRef } from 'react';

const IDLE_START = 20_000;
const FADE_MS = 3000;
const BUILD_SPEED = 0.4;       // pixels per frame of city growth (right to left)
const LAYER_COLORS = ['#1a1a24', '#2a2a38', '#3a3a50'];
const SUN_COLOR_START = '#ff8844';
const SUN_COLOR_END = '#ffd080';
const MAX_LAYERS = 3;
const MAX_SUN_R = 28;

function generateBuildings(width) {
  const buildings = [];
  let x = width;
  while (x > -20) {
    const w = 12 + Math.floor(Math.random() * 28);
    const h = 20 + Math.floor(Math.random() * 55);
    const gap = 2 + Math.floor(Math.random() * 5);
    x -= w + gap;
    // Random windows
    const windows = [];
    for (let wy = 6; wy < h - 4; wy += 7) {
      for (let wx = 3; wx < w - 3; wx += 6) {
        if (Math.random() > 0.35) windows.push({ wx, wy, lit: Math.random() > 0.5 });
      }
    }
    // Occasional antenna
    const antenna = Math.random() > 0.7 ? 4 + Math.floor(Math.random() * 10) : 0;
    buildings.push({ x, w, h, windows, antenna });
  }
  return buildings;
}

export function IdleSkyline() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const stateRef = useRef({
    active: false,
    opacity: 0,
    layers: [],           // each: { buildings, revealX (builds right to left), color }
    currentLayer: 0,
    sunY: 0,              // 0 = hidden, grows as sun rises
    sunPhase: false,
    fadingOut: false,
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

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = 120;
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const s = stateRef.current;
      const W = canvas.width, H = canvas.height;
      const idle = Date.now() - lastActivityRef.current;

      // Activate when idle long enough
      if (idle > IDLE_START && !s.active && !s.fadingOut) {
        s.active = true;
        s.layers = [{ buildings: generateBuildings(W), revealX: W, color: LAYER_COLORS[0] }];
        s.currentLayer = 0;
        s.sunY = 0;
        s.sunPhase = false;
      }

      // Deactivate when user returns
      if (idle < IDLE_START && s.active && !s.fadingOut) {
        s.fadingOut = true;
        s.fadeStart = Date.now();
      }

      // Fade out
      if (s.fadingOut) {
        const elapsed = Date.now() - s.fadeStart;
        s.opacity = Math.max(0, 1 - elapsed / FADE_MS);
        if (s.opacity <= 0) {
          s.active = false;
          s.fadingOut = false;
          s.opacity = 0;
          s.layers = [];
          s.sunY = 0;
          s.sunPhase = false;
        }
      } else if (s.active) {
        s.opacity = Math.min(1, s.opacity + 0.02);
      }

      // Clear
      ctx.clearRect(0, 0, W, H);

      if (s.active || s.fadingOut) {
        ctx.globalAlpha = s.opacity;

        // Build current layer (right to left)
        const layer = s.layers[s.currentLayer];
        if (layer && layer.revealX > 0) {
          layer.revealX -= BUILD_SPEED;
        } else if (layer && s.currentLayer < MAX_LAYERS - 1 && !s.sunPhase) {
          // Start next layer
          s.currentLayer++;
          const nextColor = LAYER_COLORS[s.currentLayer] || '#4a4a60';
          s.layers.push({
            buildings: generateBuildings(W),
            revealX: W,
            color: nextColor,
          });
        } else if (layer && layer.revealX <= 0 && s.currentLayer >= MAX_LAYERS - 1 && !s.sunPhase) {
          s.sunPhase = true;
        }

        // Sun rises
        if (s.sunPhase && s.sunY < MAX_SUN_R) {
          s.sunY += 0.15;
        }

        // Draw sun behind buildings
        if (s.sunY > 0) {
          const sunX = W * 0.75;
          const sunCenterY = H - s.sunY * 1.5;
          const r = Math.min(s.sunY, MAX_SUN_R);
          const grad = ctx.createRadialGradient(sunX, sunCenterY, 0, sunX, sunCenterY, r * 2.5);
          grad.addColorStop(0, SUN_COLOR_START);
          grad.addColorStop(0.4, SUN_COLOR_END);
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sunX, sunCenterY, r * 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Sun disc
          ctx.fillStyle = SUN_COLOR_START;
          ctx.beginPath();
          ctx.arc(sunX, sunCenterY, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw each layer back-to-front
        for (let li = 0; li < s.layers.length; li++) {
          const l = s.layers[li];
          const sunInfluence = s.sunPhase ? Math.min(1, s.sunY / MAX_SUN_R) : 0;

          for (const b of l.buildings) {
            if (b.x > l.revealX) continue; // not yet revealed

            const bx = b.x, by = H - b.h;

            // Building body
            if (sunInfluence > 0) {
              // Warm tint from sun
              const warmth = sunInfluence * (0.15 + li * 0.1);
              ctx.fillStyle = l.color;
              ctx.fillRect(bx, by, b.w, b.h);
              ctx.fillStyle = `rgba(255, 180, 80, ${warmth})`;
              ctx.fillRect(bx, by, b.w, b.h);
            } else {
              ctx.fillStyle = l.color;
              ctx.fillRect(bx, by, b.w, b.h);
            }

            // Antenna
            if (b.antenna > 0 && li === s.layers.length - 1) {
              ctx.strokeStyle = l.color;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(bx + b.w / 2, by);
              ctx.lineTo(bx + b.w / 2, by - b.antenna);
              ctx.stroke();
            }

            // Windows
            for (const win of b.windows) {
              const litNow = win.lit || (sunInfluence > 0.5 && Math.random() > 0.7);
              ctx.fillStyle = litNow
                ? `rgba(255, 240, 180, ${0.3 + sunInfluence * 0.5})`
                : `rgba(60, 60, 80, ${0.3 + li * 0.1})`;
              ctx.fillRect(bx + win.wx, by + win.wy, 3, 3);
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

  return (
    <canvas
      ref={canvasRef}
      className="idle-skyline"
      width={800}
      height={120}
    />
  );
}
