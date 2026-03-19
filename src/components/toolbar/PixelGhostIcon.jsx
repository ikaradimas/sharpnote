import React from 'react';
import { GHOST_PATTERNS } from '../../config/tab-colors.js';

export function PixelGhostIcon({ seed = 0 }) {
  const s = 2;
  const grid = GHOST_PATTERNS[seed % GHOST_PATTERNS.length];
  const rects = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell === 1) rects.push(<rect key={`${x}-${y}`} x={x * s} y={y * s} width={s} height={s} fill="currentColor" />);
  }));
  return (
    <svg width={5 * s} height={5 * s} viewBox={`0 0 ${5 * s} ${5 * s}`}
      style={{ display: 'block', imageRendering: 'pixelated' }}>
      {rects}
    </svg>
  );
}
