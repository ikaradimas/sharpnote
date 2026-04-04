import React, { useState, useEffect, useRef } from 'react';
import { IconLogs, IconPackages, IconConfig, IconDB, IconVars, IconToC, IconLibrary, IconFiles, IconApi, IconGraph, IconTodo, IconRegex, IconKafka } from '../../components/toolbar/Icons.jsx';

const CATEGORY_ORDER = ['File', 'Execution', 'Panels', 'Settings'];

export const PALETTE_COMMANDS = [
  // File
  { id: 'new',              label: 'New Notebook',              keys: '⌘N',   category: 'File' },
  { id: 'open',             label: 'Open Notebook…',            keys: '⌘O',   category: 'File' },
  { id: 'save',             label: 'Save',                      keys: '⌘S',   category: 'File' },
  { id: 'save-as',          label: 'Save As…',                  keys: '⌘⇧S',  category: 'File' },
  { id: 'export-html',      label: 'Export as HTML…',                          category: 'File' },
  { id: 'import-data',      label: 'Import Data File…',         keys: '⌘⇧I',  category: 'File' },
  // Execution
  { id: 'run-all',          label: 'Run All Cells',             keys: '⌘⇧↩',  category: 'Execution' },
  { id: 'reset',            label: 'Reset Kernel',                             category: 'Execution' },
  { id: 'clear-output',     label: 'Clear All Output',                         category: 'Execution' },
  // Panels
  { id: 'toggle-logs',      label: 'Toggle Logs Panel',         keys: '⌘⇧G',  category: 'Panels', icon: <IconLogs /> },
  { id: 'toggle-packages',  label: 'Toggle Packages Panel',     keys: '⌘⇧P',  category: 'Panels', icon: <IconPackages /> },
  { id: 'toggle-config',    label: 'Toggle Config Panel',       keys: '⌘⇧,',  category: 'Panels', icon: <IconConfig /> },
  { id: 'toggle-db',        label: 'Toggle Database Panel',     keys: '⌘⇧D',  category: 'Panels', icon: <IconDB /> },
  { id: 'toggle-vars',      label: 'Toggle Variables Panel',    keys: '⌘⇧V',  category: 'Panels', icon: <IconVars /> },
  { id: 'toggle-toc',       label: 'Toggle Table of Contents',  keys: '⌘⇧T',  category: 'Panels', icon: <IconToC /> },
  { id: 'toggle-library',   label: 'Toggle Library Panel',      keys: '⌘⇧L',  category: 'Panels', icon: <IconLibrary /> },
  { id: 'toggle-files',     label: 'Toggle File Explorer',      keys: '⌘⇧E',  category: 'Panels', icon: <IconFiles /> },
  { id: 'toggle-api',       label: 'Toggle API Browser',        keys: '⌘⇧A',  category: 'Panels', icon: <IconApi /> },
  { id: 'toggle-graph',     label: 'Toggle Graph Panel',        keys: '⌘⇧R',  category: 'Panels', icon: <IconGraph /> },
  { id: 'toggle-todo',      label: 'Toggle To Do Panel',        keys: '⌘⇧O',  category: 'Panels', icon: <IconTodo /> },
  { id: 'toggle-regex',     label: 'Toggle Regex Panel',        keys: '⌘⇧X',  category: 'Panels', icon: <IconRegex /> },
  { id: 'toggle-kafka',     label: 'Toggle Kafka Panel',        keys: '⌘⇧K',  category: 'Panels', icon: <IconKafka /> },
  // Settings
  { id: 'docs',             label: 'Documentation',             keys: 'F1',    category: 'Settings' },
  { id: 'settings',         label: 'Settings…',                 keys: '⌘,',   category: 'Settings' },
  { id: 'about',            label: 'About SharpNote',                          category: 'Settings' },
  { id: 'shortcuts',        label: 'Keyboard Shortcuts',        keys: '⌘/',   category: 'Settings' },
  { id: 'dashboard',        label: 'Toggle Dashboard Mode',     keys: '⌘⇧B',  category: 'Settings' },
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
    list.querySelector('.cmd-palette-item.selected')?.scrollIntoView({ block: 'nearest' });
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
            (() => {
              const isSearching = query.trim().length > 0;
              if (isSearching) {
                return filtered.map((cmd, i) => (
                  <div
                    key={cmd.id}
                    className={`cmd-palette-item${i === selected ? ' selected' : ''}`}
                    onClick={() => { onExecute(cmd.id); onClose(); }}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span className="cmd-palette-label">
                      {cmd.icon && <span className="cmd-palette-icon">{cmd.icon}</span>}
                      {cmd.label}
                    </span>
                    {cmd.keys && <span className="cmd-palette-keys">{cmd.keys}</span>}
                  </div>
                ));
              }
              let itemIndex = 0;
              return CATEGORY_ORDER.map((cat) => {
                const items = filtered.filter((c) => c.category === cat);
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={cat}>
                    <div className="cmd-palette-category">{cat}</div>
                    {items.map((cmd) => {
                      const idx = itemIndex++;
                      return (
                        <div
                          key={cmd.id}
                          className={`cmd-palette-item${idx === selected ? ' selected' : ''}`}
                          onClick={() => { onExecute(cmd.id); onClose(); }}
                          onMouseEnter={() => setSelected(idx)}
                        >
                          <span className="cmd-palette-label">
                            {cmd.icon && <span className="cmd-palette-icon">{cmd.icon}</span>}
                            {cmd.label}
                          </span>
                          {cmd.keys && <span className="cmd-palette-keys">{cmd.keys}</span>}
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              });
            })()
          )}
        </div>
      </div>
    </div>
  );
}
