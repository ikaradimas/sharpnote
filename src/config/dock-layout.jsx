import React from 'react';

// ── Dock Layout System ────────────────────────────────────────────────────────

export const DEFAULT_DOCK_LAYOUT = {
  assignments: { log: 'right', nuget: 'bottom', config: 'bottom', db: 'bottom', library: 'left', vars: 'right', toc: 'left', files: 'left', api: 'right' },
  order:       { log: 0, nuget: 0, config: 1, db: 2, library: 0, vars: 1, toc: 1, files: 2, api: 2 },
  sizes:       { left: 300, right: 320, bottom: 280 },
  floatPos:    {},
  zoneTab:     { left: 'library', right: 'log', bottom: 'nuget' },
};

export const DEFAULT_FLOAT_W = 360;
export const DEFAULT_FLOAT_H = 300;

// ── Inline icon components for PANEL_META ─────────────────────────────────────

const _ic = { width: '13', height: '13', viewBox: '0 0 13 13', fill: 'none', style: { display: 'block', flexShrink: 0 } };

function IconConfig() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <line x1="2" y1="3.5" x2="11" y2="3.5"/>
    <circle cx="4.5" cy="3.5" r="1.3" fill="currentColor" stroke="none"/>
    <line x1="2" y1="6.5" x2="11" y2="6.5"/>
    <circle cx="8.5" cy="6.5" r="1.3" fill="currentColor" stroke="none"/>
    <line x1="2" y1="9.5" x2="11" y2="9.5"/>
    <circle cx="5" cy="9.5" r="1.3" fill="currentColor" stroke="none"/>
  </svg>;
}
function IconPackages() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
    <path d="M6.5 1.5L11.5 4V9L6.5 11.5L1.5 9V4L6.5 1.5z"/>
    <path d="M1.5 4L6.5 6.5L11.5 4"/>
    <line x1="6.5" y1="6.5" x2="6.5" y2="11.5"/>
  </svg>;
}
function IconLogs() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <rect x="1.5" y="1.5" width="10" height="10" rx="1" strokeWidth="1.1"/>
    <path d="M4 5l2 1.5L4 8" strokeLinejoin="round"/>
    <line x1="7" y1="8" x2="10" y2="8"/>
  </svg>;
}
function IconDB() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1">
    <ellipse cx="6.5" cy="3.5" rx="4" ry="1.6"/>
    <path d="M2.5 3.5v6c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6v-6"/>
    <path d="M2.5 6.5c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6"/>
  </svg>;
}
function IconLibrary() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <path d="M6.5 11V3.5a.5.5 0 00-.5-.5H2a.5.5 0 00-.5.5V11"/>
    <path d="M6.5 11V3.5a.5.5 0 01.5-.5H11a.5.5 0 01.5.5V11"/>
    <line x1="1.5" y1="11" x2="11.5" y2="11"/>
  </svg>;
}
function IconVars() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <rect x="1.5" y="2" width="4" height="9" rx="0.5"/>
    <line x1="7" y1="4" x2="11.5" y2="4"/>
    <line x1="7" y1="6.5" x2="11.5" y2="6.5"/>
    <line x1="7" y1="9" x2="10" y2="9"/>
  </svg>;
}
function IconToC() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <line x1="1.5" y1="3" x2="11.5" y2="3"/>
    <line x1="3.5" y1="6" x2="11.5" y2="6"/>
    <line x1="3.5" y1="9" x2="11.5" y2="9"/>
    <line x1="1.5" y1="3" x2="1.5" y2="9"/>
  </svg>;
}
function IconFiles() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="3" width="8" height="10" rx="1" />
      <path d="M4 3V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1" />
      <line x1="3" y1="7" x2="7" y2="7" />
      <line x1="3" y1="9.5" x2="7" y2="9.5" />
    </svg>
  );
}
function IconApi() {
  return (
    <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <rect x="1.5" y="3" width="10" height="7.5" rx="1" />
      <line x1="4" y1="6" x2="5.5" y2="6" />
      <line x1="7" y1="6" x2="9" y2="6" />
      <path d="M3 3V2m7 1V2" />
      <line x1="1.5" y1="8" x2="11.5" y2="8" />
    </svg>
  );
}

export const PANEL_META = {
  log:     { label: 'Logs',       icon: <IconLogs /> },
  nuget:   { label: 'Packages',   icon: <IconPackages /> },
  config:  { label: 'Config',     icon: <IconConfig /> },
  db:      { label: 'DB',         icon: <IconDB /> },
  library: { label: 'Library',    icon: <IconLibrary /> },
  vars:    { label: 'Variables',  icon: <IconVars /> },
  toc:     { label: 'Table of Contents', icon: <IconToC /> },
  files:   { label: 'Files',      icon: <IconFiles /> },
  api:     { label: 'API Browser', icon: <IconApi /> },
};

// ── Dock drop zones ───────────────────────────────────────────────────────────

export const DOCK_DROP_ZONES = [
  { key: 'left',   label: '← Left'   },
  { key: 'right',  label: 'Right →'  },
  { key: 'bottom', label: '↓ Bottom' },
  { key: 'float',  label: 'Float'    },
];
