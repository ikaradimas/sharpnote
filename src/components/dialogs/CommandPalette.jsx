import React, { useState, useEffect, useRef } from 'react';

export const PALETTE_COMMANDS = [
  { id: 'new',              label: 'New Notebook',              keys: '⌘N' },
  { id: 'open',             label: 'Open Notebook…',            keys: '⌘O' },
  { id: 'save',             label: 'Save',                      keys: '⌘S' },
  { id: 'save-as',          label: 'Save As…',                  keys: '⌘⇧S' },
  { id: 'export-html',      label: 'Export as HTML…' },
  { id: 'run-all',          label: 'Run All Cells',             keys: '⌘⇧↩' },
  { id: 'reset',            label: 'Reset Kernel' },
  { id: 'clear-output',     label: 'Clear All Output' },
  { id: 'docs',             label: 'Documentation',             keys: 'F1' },
  { id: 'toggle-logs',      label: 'Toggle Logs Panel',         keys: '⌘⇧G' },
  { id: 'toggle-packages',  label: 'Toggle Packages Panel',     keys: '⌘⇧P' },
  { id: 'toggle-config',    label: 'Toggle Config Panel' },
  { id: 'toggle-db',        label: 'Toggle Database Panel',     keys: '⌘⇧D' },
  { id: 'toggle-vars',      label: 'Toggle Variables Panel',    keys: '⌘⇧V' },
  { id: 'toggle-toc',       label: 'Toggle Table of Contents',  keys: '⌘⇧T' },
  { id: 'toggle-library',   label: 'Toggle Library Panel',      keys: '⌘⇧L' },
  { id: 'toggle-files',     label: 'Toggle File Explorer',      keys: '⌘⇧E' },
  { id: 'toggle-api',       label: 'Toggle API Browser',        keys: '⌘⇧A' },
  { id: 'settings',         label: 'Settings…',                 keys: '⌘,' },
];

export function CommandPalette({ onExecute, onClose }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filtered = query.trim()
    ? PALETTE_COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase()))
    : PALETTE_COMMANDS;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.children[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selected]) { onExecute(filtered[selected].id); onClose(); }
    }
  };

  return (
    <div className="cmd-palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd-palette">
        <input
          ref={inputRef}
          className="cmd-palette-input"
          placeholder="Search commands…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
        <div ref={listRef} className="cmd-palette-list">
          {filtered.length === 0 ? (
            <div className="cmd-palette-empty">No commands found</div>
          ) : (
            filtered.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`cmd-palette-item${i === selected ? ' selected' : ''}`}
                onClick={() => { onExecute(cmd.id); onClose(); }}
                onMouseEnter={() => setSelected(i)}
              >
                <span className="cmd-palette-label">{cmd.label}</span>
                {cmd.keys && <span className="cmd-palette-keys">{cmd.keys}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
