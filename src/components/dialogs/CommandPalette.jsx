import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Command, Wrench } from 'lucide-react';
import { IconLogs, IconPackages, IconConfig, IconDB, IconVars, IconToC, IconLibrary, IconFiles, IconApi, IconGraph, IconTodo, IconRegex, IconKafka, IconGit, IconApiEditor, IconDeps, IconHistory } from '../../components/toolbar/Icons.jsx';
import { extractHeadings } from '../../utils.js';

// ── Command definitions ──────────────────────────────────────────────────────

const COMMANDS = [
  { id: 'new',              label: 'New Notebook',              keys: '⌘N',   category: 'File' },
  { id: 'open',             label: 'Open Notebook…',            keys: '⌘O',   category: 'File' },
  { id: 'save',             label: 'Save',                      keys: '⌘S',   category: 'File' },
  { id: 'save-as',          label: 'Save As…',                  keys: '⌘⇧S',  category: 'File' },
  { id: 'export-html',      label: 'Export as HTML…',                          category: 'File' },
  { id: 'export-exe',       label: 'Export as Executable…',                    category: 'File' },
  { id: 'import-data',      label: 'Import Data File…',         keys: '⌘⇧I',  category: 'File' },
  { id: 'run-all',          label: 'Run All Cells',             keys: '⌘⇧↩',  category: 'Execution' },
  { id: 'reset',            label: 'Reset Kernel',                             category: 'Execution' },
  { id: 'clear-output',     label: 'Clear All Output',                         category: 'Execution' },
  { id: 'docs',             label: 'Documentation',             keys: 'F1',    category: 'Settings' },
  { id: 'settings',         label: 'Settings…',                 keys: '⌘,',   category: 'Settings' },
  { id: 'about',            label: 'About SharpNote',                          category: 'Settings' },
  { id: 'shortcuts',        label: 'Keyboard Shortcuts',        keys: '⌘⇧?',  category: 'Settings' },
  { id: 'dashboard',        label: 'Toggle Dashboard Mode',     keys: '⌘⇧B',  category: 'Settings' },
];

const COMMAND_CATEGORIES = ['File', 'Execution', 'Settings'];

const TOOLS = [
  { id: 'toggle-logs',       label: 'Logs',              keys: '⌘⇧G',  icon: <IconLogs /> },
  { id: 'toggle-packages',   label: 'Packages',          keys: '⌘⇧P',  icon: <IconPackages /> },
  { id: 'toggle-config',     label: 'Config',            keys: '⌘⇧,',  icon: <IconConfig /> },
  { id: 'toggle-db',         label: 'Database',          keys: '⌘⇧D',  icon: <IconDB /> },
  { id: 'toggle-vars',       label: 'Variables',         keys: '⌘⇧V',  icon: <IconVars /> },
  { id: 'toggle-toc',        label: 'Table of Contents', keys: '⌘⇧T',  icon: <IconToC /> },
  { id: 'toggle-library',    label: 'Library',           keys: '⌘⇧L',  icon: <IconLibrary /> },
  { id: 'toggle-files',      label: 'File Explorer',     keys: '⌘⇧E',  icon: <IconFiles /> },
  { id: 'toggle-api',        label: 'API Browser',       keys: '⌘⇧A',  icon: <IconApi /> },
  { id: 'toggle-api-editor', label: 'API Editor',        keys: '⌘⇧Q',  icon: <IconApiEditor /> },
  { id: 'toggle-git',        label: 'Git',               keys: '⌘⇧J',  icon: <IconGit /> },
  { id: 'toggle-graph',      label: 'Graph',             keys: '⌘⇧R',  icon: <IconGraph /> },
  { id: 'toggle-todo',       label: 'To Do',             keys: '⌘⇧O',  icon: <IconTodo /> },
  { id: 'toggle-regex',      label: 'Regex',             keys: '⌘⇧X',  icon: <IconRegex /> },
  { id: 'toggle-deps',       label: 'Orchestration',                    icon: <IconDeps /> },
  { id: 'toggle-history',    label: 'History',                          icon: <IconHistory /> },
  { id: 'toggle-kafka',      label: 'Kafka',             keys: '⌘⇧K',  icon: <IconKafka /> },
];

// Re-export for tests and menu handlers that reference it
export const PALETTE_COMMANDS = [
  ...COMMANDS,
  ...TOOLS.map((t) => ({ ...t, category: 'Panels' })),
];

// ── Search helpers ───────────────────────────────────────────────────────────

function buildSearchResults(cells, query) {
  if (!query.trim() || !cells?.length) return [];
  const q = query.toLowerCase();
  const headings = extractHeadings(cells);
  const results = [];

  cells.forEach((cell, idx) => {
    const content = cell.content || '';
    const lines = content.split('\n');
    lines.forEach((line, lineIdx) => {
      if (!line.toLowerCase().includes(q)) return;
      // Find nearest heading before this cell
      const chapter = headings.filter((h) => {
        const hIdx = cells.findIndex((c) => c.id === h.cellId);
        return hIdx <= idx;
      }).pop();
      const type = (cell.type || 'code').charAt(0).toUpperCase() + (cell.type || 'code').slice(1);
      results.push({
        cellId: cell.id,
        cellIndex: idx,
        cellType: type,
        cellName: cell.name,
        chapter: chapter?.text || null,
        lineIndex: lineIdx,
        line: line.trim(),
        query: q,
      });
    });
  });
  return results.slice(0, 50); // cap results
}

function HighlightMatch({ text, query }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="cmd-palette-match">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'search',   label: 'Search',   icon: <Search size={12} /> },
  { id: 'commands', label: 'Commands', icon: <Command size={12} /> },
  { id: 'tools',    label: 'Tools',    icon: <Wrench size={12} /> },
];

// ── Main component ───────────────────────────────────────────────────────────

export function CommandPalette({ onExecute, onClose, cells, onNavigateToCell }) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('commands');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const prevTabRef = useRef('commands');

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSelected(0); }, [query, activeTab]);
  useEffect(() => {
    listRef.current?.querySelector('.cmd-palette-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  // Auto-switch to search tab when typing, back when clearing
  useEffect(() => {
    if (query.trim() && activeTab !== 'search') {
      prevTabRef.current = activeTab;
      setActiveTab('search');
    } else if (!query.trim() && activeTab === 'search') {
      setActiveTab(prevTabRef.current);
    }
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build items for current tab ──────────────────────────────────────────
  const searchResults = useMemo(
    () => buildSearchResults(cells, query),
    [cells, query]
  );

  const filteredCommands = useMemo(() => {
    const q = query.toLowerCase();
    return q ? COMMANDS.filter((c) => c.label.toLowerCase().includes(q)) : COMMANDS;
  }, [query]);

  const filteredTools = useMemo(() => {
    const q = query.toLowerCase();
    return q ? TOOLS.filter((t) => t.label.toLowerCase().includes(q)) : TOOLS;
  }, [query]);

  const currentItems = activeTab === 'search' ? searchResults
    : activeTab === 'tools' ? filteredTools
    : filteredCommands;

  // ── Keyboard ─────────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, currentItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const tabIds = TABS.map((t) => t.id);
      const idx = tabIds.indexOf(activeTab);
      setActiveTab(tabIds[(idx + 1) % tabIds.length]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = currentItems[selected];
      if (!item) return;
      if (activeTab === 'search') {
        onNavigateToCell?.(item.cellId);
        onClose();
      } else {
        onExecute(item.id);
        onClose();
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '3') {
      e.preventDefault();
      const tab = TABS[parseInt(e.key) - 1];
      if (tab) setActiveTab(tab.id);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="cmd-palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd-palette">
        <input
          ref={inputRef}
          className="cmd-palette-input"
          placeholder={activeTab === 'search' ? 'Search notebook content…' : 'Search commands…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
        <div className="cmd-palette-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`cmd-palette-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <div ref={listRef} className="cmd-palette-list">
          {currentItems.length === 0 ? (
            <div className="cmd-palette-empty">
              {activeTab === 'search' ? (query ? 'No matches found' : 'Type to search notebook content') : 'No commands found'}
            </div>
          ) : activeTab === 'search' ? (
            searchResults.map((r, i) => (
              <div
                key={`${r.cellId}-${r.lineIndex}`}
                className={`cmd-palette-item cmd-palette-search-result${i === selected ? ' selected' : ''}`}
                onClick={() => { onNavigateToCell?.(r.cellId); onClose(); }}
                onMouseEnter={() => setSelected(i)}
              >
                <div className="cmd-search-meta">
                  <span className="cmd-search-badge">{r.cellType}</span>
                  <span className="cmd-search-pos">Cell {r.cellIndex + 1}{r.cellName ? ` — ${r.cellName}` : ''}</span>
                  {r.chapter && <span className="cmd-search-chapter">{r.chapter}</span>}
                </div>
                <div className="cmd-search-snippet">
                  <HighlightMatch text={r.line.slice(0, 120)} query={r.query} />
                </div>
              </div>
            ))
          ) : activeTab === 'commands' ? (
            (() => {
              let itemIndex = 0;
              return COMMAND_CATEGORIES.map((cat) => {
                const items = filteredCommands.filter((c) => c.category === cat);
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
                          <span className="cmd-palette-label">{cmd.label}</span>
                          {cmd.keys && <span className="cmd-palette-keys">{cmd.keys}</span>}
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              });
            })()
          ) : (
            filteredTools.map((tool, i) => (
              <div
                key={tool.id}
                className={`cmd-palette-item${i === selected ? ' selected' : ''}`}
                onClick={() => { onExecute(tool.id); onClose(); }}
                onMouseEnter={() => setSelected(i)}
              >
                <span className="cmd-palette-label">
                  {tool.icon && <span className="cmd-palette-icon">{tool.icon}</span>}
                  {tool.label}
                </span>
                {tool.keys && <span className="cmd-palette-keys">{tool.keys}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
