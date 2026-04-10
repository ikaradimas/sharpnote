import React, { useEffect } from 'react';

const SHORTCUT_GROUPS = [
  {
    title: 'File',
    items: [
      ['New Notebook', '⌘N'],
      ['Open…', '⌘O'],
      ['Save', '⌘S'],
      ['Save As…', '⌘⇧S'],
      ['Import Data File', '⌘⇧I'],
      ['Export as HTML', ''],
      ['Export as PDF', ''],
    ],
  },
  {
    title: 'Execution',
    items: [
      ['Run Cell', '⌃↩'],
      ['Run All', '⌘⇧↩'],
      ['Stop / Interrupt', ''],
      ['Reset Kernel', ''],
      ['Clear All Output', ''],
    ],
  },
  {
    title: 'Navigation',
    items: [
      ['Command Palette', '⌘K'],
      ['Find in Notebook', '⌘F'],
      ['Settings', '⌘,'],
      ['Keyboard Shortcuts', '⌘⇧?'],
    ],
  },
  {
    title: 'Panels',
    items: [
      ['Logs', '⌘⇧G'],
      ['Packages', '⌘⇧P'],
      ['Config', '⌘⇧,'],
      ['Database', '⌘⇧D'],
      ['Variables', '⌘⇧V'],
      ['Table of Contents', '⌘⇧T'],
      ['Library', '⌘⇧L'],
      ['File Explorer', '⌘⇧E'],
      ['Graph', '⌘⇧R'],
    ],
  },
];

export function KeyboardShortcutsOverlay({ onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="shortcuts-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <span>Keyboard Shortcuts</span>
          <button className="shortcuts-close" onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <div className="shortcuts-group-title">{group.title}</div>
              {group.items.map(([label, keys]) => (
                <div key={label} className="shortcuts-row">
                  <span className="shortcuts-label">{label}</span>
                  {keys && <span className="cmd-palette-keys">{keys}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
