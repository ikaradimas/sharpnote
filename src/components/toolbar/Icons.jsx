import React from 'react';

export const _ic = { width: '13', height: '13', viewBox: '0 0 13 13', fill: 'none', style: { display: 'block', flexShrink: 0 } };

export function IconSave() {
  return <svg {..._ic}>
    <rect x="1.5" y="1.5" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.1"/>
    <rect x="3" y="1.5" width="4.5" height="4" fill="currentColor"/>
    <rect x="3.5" y="7" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1"/>
  </svg>;
}
export function IconOpen() {
  return <svg {..._ic} viewBox="0 0 14 13">
    <path d="M1 4.5h3l1.2-1.8h5.3V4.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    <path d="M1 4.5v6.8h12l-2-6.8H1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
  </svg>;
}
export function IconReset() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M2.5 6.5A4 4 0 1 1 5.5 10.5"/>
    <path d="M2.5 4v2.5H5"/>
  </svg>;
}
export function IconConfig() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <line x1="2" y1="3.5" x2="11" y2="3.5"/>
    <circle cx="4.5" cy="3.5" r="1.3" fill="currentColor" stroke="none"/>
    <line x1="2" y1="6.5" x2="11" y2="6.5"/>
    <circle cx="8.5" cy="6.5" r="1.3" fill="currentColor" stroke="none"/>
    <line x1="2" y1="9.5" x2="11" y2="9.5"/>
    <circle cx="5" cy="9.5" r="1.3" fill="currentColor" stroke="none"/>
  </svg>;
}
export function IconPackages() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
    <path d="M6.5 1.5L11.5 4V9L6.5 11.5L1.5 9V4L6.5 1.5z"/>
    <path d="M1.5 4L6.5 6.5L11.5 4"/>
    <line x1="6.5" y1="6.5" x2="6.5" y2="11.5"/>
  </svg>;
}
export function IconLogs() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <rect x="1.5" y="1.5" width="10" height="10" rx="1" strokeWidth="1.1"/>
    <path d="M4 5l2 1.5L4 8" strokeLinejoin="round"/>
    <line x1="7" y1="8" x2="10" y2="8"/>
  </svg>;
}
export function IconDB() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1">
    <ellipse cx="6.5" cy="3.5" rx="4" ry="1.6"/>
    <path d="M2.5 3.5v6c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6v-6"/>
    <path d="M2.5 6.5c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6"/>
  </svg>;
}
export function IconLibrary() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <path d="M6.5 11V3.5a.5.5 0 00-.5-.5H2a.5.5 0 00-.5.5V11"/>
    <path d="M6.5 11V3.5a.5.5 0 01.5-.5H11a.5.5 0 01.5.5V11"/>
    <line x1="1.5" y1="11" x2="11.5" y2="11"/>
  </svg>;
}
export function IconTheme() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1">
    <circle cx="6.5" cy="6.5" r="5" />
    <path d="M6.5 1.5v10" strokeLinecap="round"/>
    <path d="M3.2 2.9A5 5 0 0 0 3.2 10.1" strokeLinecap="round"/>
    <path d="M1.5 6.5h5" strokeLinecap="round"/>
  </svg>;
}
export function IconVars() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <rect x="1.5" y="2" width="4" height="9" rx="0.5"/>
    <line x1="7" y1="4" x2="11.5" y2="4"/>
    <line x1="7" y1="6.5" x2="11.5" y2="6.5"/>
    <line x1="7" y1="9" x2="10" y2="9"/>
  </svg>;
}
export function IconToC() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <line x1="1.5" y1="3" x2="11.5" y2="3"/>
    <line x1="3.5" y1="6" x2="11.5" y2="6"/>
    <line x1="3.5" y1="9" x2="11.5" y2="9"/>
    <line x1="1.5" y1="3" x2="1.5" y2="9"/>
  </svg>;
}
export function IconLayout() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <rect x="1.5" y="1.5" width="10" height="10" rx="1"/>
    <line x1="4.5" y1="1.5" x2="4.5" y2="11.5"/>
    <line x1="1.5" y1="6.5" x2="11.5" y2="6.5"/>
  </svg>;
}
export function IconFiles() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="3" width="8" height="10" rx="1" />
      <path d="M4 3V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1" />
      <line x1="3" y1="7" x2="7" y2="7" />
      <line x1="3" y1="9.5" x2="7" y2="9.5" />
    </svg>
  );
}
export function IconApi() {
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
export function IconFolderSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" style={{ opacity: 0.75 }}>
      <path d="M1 3a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z" />
    </svg>
  );
}
export function IconGraph() {
  return (
    <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <polyline points="1.5,10 4,6 6.5,8 9,3.5 11.5,5" />
      <line x1="1.5" y1="11.5" x2="11.5" y2="11.5" />
      <line x1="1.5" y1="1.5" x2="1.5" y2="11.5" />
    </svg>
  );
}
export function IconTodo() {
  return (
    <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <polyline points="2,4 3.5,5.5 6,3" />
      <line x1="7.5" y1="4.5" x2="11.5" y2="4.5" />
      <polyline points="2,8 3.5,9.5 6,7" />
      <line x1="7.5" y1="8.5" x2="11.5" y2="8.5" />
    </svg>
  );
}
export function IconRegex() {
  return (
    <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="11" x2="2.5" y2="2" />
      <line x1="9" y1="11" x2="10.5" y2="2" />
      <circle cx="5.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
      <path d="M5 4 L6.5 2.5 L8 4" />
    </svg>
  );
}
export function IconKafka() {
  return (
    <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <circle cx="3" cy="6.5" r="1.5" />
      <circle cx="10" cy="2.5" r="1.5" />
      <circle cx="10" cy="10.5" r="1.5" />
      <line x1="4.4" y1="5.8" x2="8.6" y2="3.2" />
      <line x1="4.4" y1="7.2" x2="8.6" y2="9.8" />
    </svg>
  );
}
export function IconFileSvg({ isNotebook }) {
  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: isNotebook ? 0.9 : 0.5 }}>
      <path d="M2 1h6l2 2v9H2z" />
      <path d="M8 1v2h2" strokeWidth="1" />
      {isNotebook && <line x1="4" y1="6" x2="8" y2="6" strokeWidth="1" />}
      {isNotebook && <line x1="4" y1="8" x2="7" y2="8" strokeWidth="1" />}
    </svg>
  );
}
