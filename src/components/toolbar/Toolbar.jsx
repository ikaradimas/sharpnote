import React, { useState, useEffect, useRef } from 'react';
import { getNotebookDisplayName } from '../../utils.js';
import { IconSave, IconOpen } from './Icons.jsx';
import { ThemePicker } from './ThemePicker.jsx';
import { ToolsMenu } from './ToolsMenu.jsx';
import { LayoutManager } from '../dock/LayoutManager.jsx';

export function Toolbar({
  kernelStatus,
  notebookPath,
  notebookTitle,
  onRename,
  onRunAll,
  onAddMarkdown,
  onAddCode,
  onAddSql,
  autoRun,
  onToggleAutoRun,
  onSave,
  onLoad,
  onReset,
  logPanelOpen,
  onToggleLogs,
  nugetPanelOpen,
  onToggleNuget,
  configPanelOpen,
  onToggleConfig,
  configCount,
  dbPanelOpen,
  onToggleDb,
  varsPanelOpen,
  onToggleVars,
  tocPanelOpen,
  onToggleToC,
  libraryPanelOpen,
  onToggleLibrary,
  filesPanelOpen,
  onToggleFiles,
  apiPanelOpen,
  onToggleApi,
  graphPanelOpen,
  onToggleGraph,
  todoPanelOpen,
  onToggleTodo,
  regexPanelOpen,
  onToggleRegex,
  kafkaPanelOpen,
  onToggleKafka,
  theme,
  onThemeChange,
  lineAltEnabled,
  onLineAltChange,
  dockLayout,
  savedLayouts,
  onSaveLayout,
  onLoadLayout,
  onDeleteLayout,
  onCloseAllPanels,
  onImportData,
}) {
  const [editing,      setEditing]      = useState(false);
  const [draft,        setDraft]        = useState('');
  const [compact,      setCompact]      = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const inputRef       = useRef(null);
  const toolbarRef     = useRef(null);
  const overflowBtnRef = useRef(null);
  const overflowRef    = useRef(null);

  const displayName = getNotebookDisplayName(notebookPath, notebookTitle, 'Untitled Notebook');

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Detect when toolbar is too narrow and switch to compact mode
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < 900);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e) => {
      if (
        overflowRef.current    && !overflowRef.current.contains(e.target) &&
        overflowBtnRef.current && !overflowBtnRef.current.contains(e.target)
      ) setOverflowOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  const startEdit = () => { setDraft(displayName); setEditing(true); };
  const commit    = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayName) onRename?.(trimmed);
    setEditing(false);
  };
  const closeOverflow = () => setOverflowOpen(false);

  const toolsMenuProps = {
    onReset,
    logPanelOpen, onToggleLogs,
    nugetPanelOpen, onToggleNuget,
    configPanelOpen, onToggleConfig, configCount,
    dbPanelOpen, onToggleDb,
    varsPanelOpen, onToggleVars,
    tocPanelOpen, onToggleToC,
    libraryPanelOpen, onToggleLibrary,
    filesPanelOpen, onToggleFiles,
    apiPanelOpen, onToggleApi,
    graphPanelOpen, onToggleGraph,
    todoPanelOpen, onToggleTodo,
    regexPanelOpen, onToggleRegex,
    kafkaPanelOpen, onToggleKafka,
    onCloseAllPanels,
    onImportData,
  };

  return (
    <div className="toolbar" ref={toolbarRef}>

      {/* ── Title / rename input ──────────────────────────────────────────── */}
      {editing ? (
        <input
          ref={inputRef}
          className="toolbar-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  commit();
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
          onBlur={commit}
        />
      ) : (
        <div className="toolbar-title-group">
          <span className="toolbar-title" onDoubleClick={startEdit} title="Double-click to rename">{displayName}</span>
          {notebookPath && <span className="toolbar-path" title={notebookPath}>{notebookPath}</span>}
        </div>
      )}

      <div className="toolbar-separator" />

      {/* ── Full mode: action buttons ─────────────────────────────────────── */}
      {!compact && (
        <>
          <button
            onClick={onRunAll}
            disabled={kernelStatus !== 'ready'}
            title={kernelStatus === 'ready' ? 'Run all code cells' : 'Waiting for kernel…'}
            className="toolbar-run-all"
          >▶▶ Run All</button>
          <button onClick={onAddMarkdown} title="Add markdown cell">+ Markdown</button>
          <button onClick={onAddCode}     title="Add code cell">+ Code</button>
          <button onClick={onAddSql}      title="Add SQL cell">+ SQL</button>
          <div className="toolbar-separator" />
          <button
            className={`toolbar-autorun-btn${autoRun ? ' toolbar-autorun-btn--on' : ''}`}
            onClick={onToggleAutoRun}
            title={autoRun ? 'Auto-run on open: ON — click to disable' : 'Auto-run on open: OFF — click to enable'}
          >⚡</button>
          <button className="toolbar-icon-btn" onClick={onSave} title="Save notebook"><IconSave /></button>
          <button className="toolbar-icon-btn" onClick={onLoad} title="Open notebook"><IconOpen /></button>
          <div className="toolbar-separator" />
        </>
      )}

      {/* ── Tools menu (always visible) ───────────────────────────────────── */}
      <ToolsMenu {...toolsMenuProps} />

      {/* ── Full mode: layout + theme ─────────────────────────────────────── */}
      {!compact && dockLayout && (
        <LayoutManager
          dockLayout={dockLayout}
          savedLayouts={savedLayouts ?? []}
          onSave={onSaveLayout}
          onLoad={onLoadLayout}
          onDelete={onDeleteLayout}
        />
      )}
      {!compact && (
        <ThemePicker theme={theme} onSelect={onThemeChange} lineAltEnabled={lineAltEnabled} onLineAltChange={onLineAltChange} />
      )}

      {/* ── Compact mode: overflow button ─────────────────────────────────── */}
      {compact && (
        <div className="toolbar-overflow-wrap">
          <button
            ref={overflowBtnRef}
            className="toolbar-overflow-btn"
            onClick={() => setOverflowOpen((o) => !o)}
            title="More options"
          >≡</button>
          {overflowOpen && (
            <div ref={overflowRef} className="toolbar-overflow-menu">
              <button
                className="toolbar-overflow-item toolbar-run-all"
                onClick={() => { onRunAll(); closeOverflow(); }}
                disabled={kernelStatus !== 'ready'}
                title={kernelStatus === 'ready' ? 'Run all code cells' : 'Waiting for kernel…'}
              >▶▶ Run All</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddMarkdown(); closeOverflow(); }}>+ Markdown</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddCode();     closeOverflow(); }}>+ Code</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddSql();      closeOverflow(); }}>+ SQL</button>
              <div className="toolbar-overflow-sep" />
              <button
                className={`toolbar-overflow-item${autoRun ? ' toolbar-overflow-item--on' : ''}`}
                onClick={onToggleAutoRun}
                title={autoRun ? 'Auto-run: ON' : 'Auto-run: OFF'}
              >⚡ Auto-run {autoRun ? 'ON' : 'OFF'}</button>
              <button className="toolbar-overflow-item" onClick={() => { onSave(); closeOverflow(); }}>Save</button>
              <button className="toolbar-overflow-item" onClick={() => { onLoad(); closeOverflow(); }}>Open…</button>
            </div>
          )}
        </div>
      )}

      {/* ── Kernel status (always visible, margin-left:auto keeps it right) ── */}
      <div className="kernel-status">
        <div className={`kernel-dot ${kernelStatus}`} />
        <span>{kernelStatus}</span>
      </div>

    </div>
  );
}
