// ── Tab color palette ─────────────────────────────────────────────────────────

// Preset palette shown in the tab color picker (null = clear color)
export const TAB_COLORS = [null, '#e05a6e', '#e0884e', '#c4c44a', '#5bb870', '#4eb8c4', '#6889a0', '#8b6ec4', '#c46e88'];

// 4 pixel-ghost variants; 5×5 grid, 0=empty 1=body (gaps become eyes/bottom)
export const GHOST_PATTERNS = [
  [[0,1,1,1,0],[1,1,1,1,1],[1,0,1,0,1],[1,1,1,1,1],[1,0,1,0,1]], // normal
  [[0,1,1,1,0],[1,1,1,1,1],[0,1,0,1,0],[1,1,1,1,1],[1,0,1,0,1]], // wide-eyed
  [[0,1,1,1,0],[1,1,1,1,1],[1,1,0,1,1],[1,1,1,1,1],[1,0,1,0,1]], // cyclops
  [[0,1,1,1,0],[1,0,1,0,1],[1,1,1,1,1],[1,1,1,1,1],[1,0,1,0,1]], // top-eyes
];

// 4 pixel-spaceship variants; 5×5 grid
export const SPACESHIP_PATTERNS = [
  [[0,0,1,0,0],[0,1,1,1,0],[1,1,1,1,1],[1,0,1,0,1],[0,1,0,1,0]], // fighter
  [[0,0,1,0,0],[0,1,1,1,0],[1,0,1,0,1],[1,1,1,1,1],[0,1,0,1,0]], // scout
  [[0,1,1,1,0],[1,1,1,1,1],[0,1,1,1,0],[1,0,1,0,1],[1,0,0,0,1]], // cruiser
  [[0,0,1,0,0],[0,1,1,1,0],[1,1,0,1,1],[0,1,1,1,0],[1,0,1,0,1]], // interceptor
];
