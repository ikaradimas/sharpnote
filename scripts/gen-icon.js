#!/usr/bin/env node
/**
 * Generates assets/icon.png (1024×1024) for Polyglot Notebook.
 * Pure Node.js — only zlib (stdlib) required.
 *
 * Design: dark rounded-square background with a warm amber `>_` prompt glyph
 * suggesting a live code REPL / notebook environment.
 */

'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const SIZE = 1024;

// ── Colour palette ────────────────────────────────────────────────────────────
const BG_INNER = [20, 16, 14];      // #14100e  – near-black warm tinted
const BG_OUTER = [8,  6,  5];       // #080605  – deep edge
const GOLD     = [196, 150, 74];    // #c4964a  – app accent
const GLOW     = [160, 100, 30];    // warm amber glow

// ── Pixel buffer ──────────────────────────────────────────────────────────────
const buf = new Uint8Array(SIZE * SIZE * 4); // RGBA

function setPixel(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  // Alpha-blend onto existing
  const aa = a / 255;
  buf[i]   = Math.round(buf[i]   * (1 - aa) + r * aa);
  buf[i+1] = Math.round(buf[i+1] * (1 - aa) + g * aa);
  buf[i+2] = Math.round(buf[i+2] * (1 - aa) + b * aa);
  buf[i+3] = Math.min(255, buf[i+3] + Math.round(a * aa));
}

// ── Background: dark radial gradient + rounded-square mask ───────────────────
const CX = SIZE / 2, CY = SIZE / 2;
const RADIUS = SIZE * 0.46;   // rounded-square corner radius guide
const CORNER = SIZE * 0.18;   // CSS-style border-radius in px

function inRoundedSquare(x, y) {
  const rx = Math.abs(x - CX), ry = Math.abs(y - CY);
  if (rx > RADIUS || ry > RADIUS) return false;
  if (rx <= RADIUS - CORNER || ry <= RADIUS - CORNER) return true;
  const dx = rx - (RADIUS - CORNER), dy = ry - (RADIUS - CORNER);
  return dx * dx + dy * dy <= CORNER * CORNER;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundedSquare(x, y)) continue;
    // Radial distance from center (0–1)
    const d = Math.sqrt((x - CX) ** 2 + (y - CY) ** 2) / (RADIUS * 1.3);
    const t = Math.min(1, d);
    const r = Math.round(BG_INNER[0] * (1 - t) + BG_OUTER[0] * t);
    const g = Math.round(BG_INNER[1] * (1 - t) + BG_OUTER[1] * t);
    const b = Math.round(BG_INNER[2] * (1 - t) + BG_OUTER[2] * t);
    const i = (y * SIZE + x) * 4;
    buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = 255;
  }
}

// ── Signed distance / drawing helpers ────────────────────────────────────────

// Distance from point (px,py) to line segment (ax,ay)→(bx,by)
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Paint a thick anti-aliased line (glow first, core on top)
function paintLine(ax, ay, bx, by, thickness, [r, g, b]) {
  const glowR = 18;
  const margin = thickness + glowR + 2;
  const x0 = Math.floor(Math.min(ax, bx) - margin);
  const x1 = Math.ceil (Math.max(ax, bx) + margin);
  const y0 = Math.floor(Math.min(ay, by) - margin);
  const y1 = Math.ceil (Math.max(ay, by) + margin);
  // Pass 1: outer glow (only beyond core edge)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = distToSeg(x, y, ax, ay, bx, by);
      if (d > thickness && d < thickness + glowR) {
        const ga = Math.round(110 * Math.max(0, 1 - (d - thickness) / glowR));
        if (ga > 0) setPixel(x, y, GLOW[0], GLOW[1], GLOW[2], ga);
      }
    }
  }
  // Pass 2: core fill (fully opaque so no background bleed)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = distToSeg(x, y, ax, ay, bx, by);
      if (d <= thickness + 1.5) {
        const alpha = Math.round(255 * Math.max(0, Math.min(1, (thickness + 1.5 - d) / 2)));
        if (alpha > 0) setPixel(x, y, r, g, b, alpha);
      }
    }
  }
}

// Paint a filled rectangle (glow first, fill on top)
function paintRect(x0, y0, x1, y1, [r, g, b]) {
  const pad = 18;
  // Pass 1: glow outside rect
  for (let y = Math.floor(y0 - pad); y <= Math.ceil(y1 + pad); y++) {
    for (let x = Math.floor(x0 - pad); x <= Math.ceil(x1 + pad); x++) {
      const edgeDist = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      if (edgeDist < 0) {
        const ga = Math.round(110 * Math.max(0, 1 - Math.abs(edgeDist) / pad));
        if (ga > 0) setPixel(x, y, GLOW[0], GLOW[1], GLOW[2], ga);
      }
    }
  }
  // Pass 2: core fill
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const edgeDist = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      const alpha = Math.round(255 * Math.max(0, Math.min(1, edgeDist + 1.5)));
      if (alpha > 0) setPixel(x, y, r, g, b, alpha);
    }
  }
}

// ── Draw `>_` centred slightly left ──────────────────────────────────────────
//
//  Layout: the two characters together span ~550px, centred at (512,512)
//  `>` : chevron, arms ~200px tall, tip at right
//  gap : ~50px
//  `_` : rectangle, ~200px wide × 40px tall, baseline at chevron bottom

const THICK = 56;      // stroke thickness (bold weight)
const charH = 240;     // total character height
const charW = 200;     // width of chevron
const totalW = charW + 60 + 200;  // > + gap + _
const startX = CX - totalW / 2;
const midY = CY + 10;  // nudge very slightly below center

// `>` chevron: (startX, midY-charH/2) → tip → (startX, midY+charH/2)
const tipX = startX + charW;
const topY  = midY - charH / 2;
const botY  = midY + charH / 2;

paintLine(startX, topY, tipX, midY, THICK, GOLD);
paintLine(tipX, midY, startX, botY, THICK, GOLD);

// `_` underscore bar
const barX0 = tipX + 60;
const barX1 = barX0 + 200;
const barY0 = botY - THICK;
const barY1 = botY;
paintRect(barX0, barY0, barX1, barY1, GOLD);

// ── Encode PNG ────────────────────────────────────────────────────────────────

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++)
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([uint32BE(data.length), typeB, data, c]);
}

const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = chunk('IHDR', Buffer.concat([
  uint32BE(SIZE), uint32BE(SIZE),
  Buffer.from([8, 6, 0, 0, 0])  // 8-bit RGBA
]));

// Raw scanlines: filter byte 0 (None) + RGBA row
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0;
  for (let x = 0; x < SIZE; x++) {
    const src = (y * SIZE + x) * 4;
    const dst = y * (1 + SIZE * 4) + 1 + x * 4;
    raw[dst]   = buf[src];
    raw[dst+1] = buf[src+1];
    raw[dst+2] = buf[src+2];
    raw[dst+3] = buf[src+3];
  }
}

const idat = chunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
const iend = chunk('IEND', Buffer.alloc(0));

const png = Buffer.concat([sig, ihdr, idat, iend]);
const outPath = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(outPath, png);
console.log(`Written ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
