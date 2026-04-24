import React, { useState, useEffect, useRef } from 'react';
import { PlayCircle, Timer, Zap, Menu, Plus, ChevronDown } from 'lucide-react';
import { getNotebookDisplayName } from '../../utils.js';
import { IconSave, IconOpen } from './Icons.jsx';
import { ThemePicker } from './ThemePicker.jsx';
import { NOTEBOOK_SCHEDULE_PRESETS } from '../../hooks/useCellScheduler.js';
import { ToolsMenu } from './ToolsMenu.jsx';
import { LayoutManager } from '../dock/LayoutManager.jsx';

export function Toolbar({
  kernelStatus,
  anyRunning,
  notebookPath,
  notebookTitle,
  onRename,
  onRunAll,
  onAddMarkdown,
  onAddCode,
  onAddSql,
  onAddHttp,
  onAddShell,
  onAddCheck,
  onAddDecision,
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
  gitPanelOpen,
  onToggleGit,
  apiPanelOpen,
  onToggleApi,
  apiEditorPanelOpen,
  onToggleApiEditor,
  graphPanelOpen,
  onToggleGraph,
  todoPanelOpen,
  onToggleTodo,
  regexPanelOpen,
  onToggleRegex,
  kafkaPanelOpen,
  onToggleKafka,
  historyPanelOpen,
  onToggleHistory,
  depsPanelOpen,
  onToggleDeps,
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
  embedPanelOpen,
  onToggleEmbed,
  notebookId,
  notebookScheduleMs,
  onNotebookScheduleStart,
  onNotebookScheduleStop,
  viewerMode = false,
}) {
  const [editing,      setEditing]      = useState(false);
  const [draft,        setDraft]        = useState('');
  const [compact,      setCompact]      = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [addCellOpen,  setAddCellOpen]  = useState(false);
  const [schedOpen,    setSchedOpen]    = useState(false);
  const schedRef = useRef(null);
  const inputRef       = useRef(null);
  const toolbarRef     = useRef(null);
  const overflowBtnRef = useRef(null);
  const overflowRef    = useRef(null);
  const addCellRef     = useRef(null);

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

  // Close add-cell dropdown on outside click
  useEffect(() => {
    if (!addCellOpen) return;
    const handler = (e) => {
      if (addCellRef.current && !addCellRef.current.contains(e.target)) setAddCellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addCellOpen]);

  useEffect(() => {
    if (!schedOpen) return;
    const handler = (e) => { if (schedRef.current && !schedRef.current.contains(e.target)) setSchedOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [schedOpen]);

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
    gitPanelOpen, onToggleGit,
    apiPanelOpen, onToggleApi,
    apiEditorPanelOpen, onToggleApiEditor,
    graphPanelOpen, onToggleGraph,
    todoPanelOpen, onToggleTodo,
    regexPanelOpen, onToggleRegex,
    kafkaPanelOpen, onToggleKafka,
    historyPanelOpen, onToggleHistory,
    depsPanelOpen, onToggleDeps,
    embedPanelOpen, onToggleEmbed,
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
            disabled={kernelStatus !== 'ready' || anyRunning}
            title={anyRunning ? 'Running…' : kernelStatus === 'ready' ? 'Run all cells' : 'Waiting for kernel…'}
            className={`toolbar-run-all${anyRunning ? ' toolbar-run-all--active' : ''}`}
          ><PlayCircle size={14} /> {anyRunning ? 'Running…' : 'Run All'}</button>
          <div className="toolbar-add-cell-wrap" ref={schedRef}>
            <button
              className={`toolbar-text-btn${notebookScheduleMs ? ' toolbar-autorun-btn--on' : ''}`}
              onClick={() => notebookScheduleMs ? onNotebookScheduleStop?.(notebookId) : setSchedOpen(v => !v)}
              title={notebookScheduleMs ? `Scheduled: ${NOTEBOOK_SCHEDULE_PRESETS.find(p => p.ms === notebookScheduleMs)?.label ?? 'custom'} — click to stop` : 'Schedule notebook'}
            >
              {notebookScheduleMs ? <><Timer size={13} /> Stop</> : <Timer size={13} />}
            </button>
            {schedOpen && !notebookScheduleMs && (
              <div className="toolbar-add-cell-dropdown">
                {NOTEBOOK_SCHEDULE_PRESETS.map(({ label, ms }) => (
                  <button key={ms} onClick={() => { onNotebookScheduleStart?.(notebookId, ms); setSchedOpen(false); }}>{label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="toolbar-add-cell-wrap" ref={addCellRef}>
            <button className="toolbar-text-btn" onClick={() => setAddCellOpen(v => !v)} title="Add cell"><Plus size={12} /> Cell <ChevronDown size={10} /></button>
            {addCellOpen && (
              <div className="toolbar-add-cell-dropdown">
                <button onClick={() => { onAddCode(); setAddCellOpen(false); }}>+ Code</button>
                <button onClick={() => { onAddMarkdown(); setAddCellOpen(false); }}>+ Markdown</button>
                <button onClick={() => { onAddSql(); setAddCellOpen(false); }}>+ SQL</button>
                <button onClick={() => { onAddHttp(); setAddCellOpen(false); }}>+ HTTP</button>
                <button onClick={() => { onAddShell(); setAddCellOpen(false); }}>+ Shell</button>
                <button onClick={() => { onAddCheck(); setAddCellOpen(false); }}>+ Check</button>
                <button onClick={() => { onAddDecision(); setAddCellOpen(false); }}>+ Decision</button>
              </div>
            )}
          </div>
          <div className="toolbar-separator" />
          <button
            className={`toolbar-autorun-btn${autoRun ? ' toolbar-autorun-btn--on' : ''}`}
            onClick={onToggleAutoRun}
            title={autoRun ? 'Auto-run on open: ON — click to disable' : 'Auto-run on open: OFF — click to enable'}
          ><Zap size={13} /></button>
          <button className="toolbar-icon-btn" onClick={onSave} title="Save notebook"><IconSave /></button>
          <button className="toolbar-icon-btn" onClick={onLoad} title="Open notebook"><IconOpen /></button>
          <div className="toolbar-separator" />
        </>
      )}

      {/* ── Tools menu (hidden in viewer mode) ─────────────────────────────── */}
      {!viewerMode && <ToolsMenu {...toolsMenuProps} />}

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
          ><Menu size={16} /></button>
          {overflowOpen && (
            <div ref={overflowRef} className="toolbar-overflow-menu">
              <button
                className={`toolbar-overflow-item toolbar-run-all${anyRunning ? ' toolbar-run-all--active' : ''}`}
                onClick={() => { onRunAll(); closeOverflow(); }}
                disabled={kernelStatus !== 'ready' || anyRunning}
                title={anyRunning ? 'Running…' : kernelStatus === 'ready' ? 'Run all cells' : 'Waiting for kernel…'}
              ><PlayCircle size={14} /> {anyRunning ? 'Running…' : 'Run All'}</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddMarkdown(); closeOverflow(); }}><Plus size={12} /> Markdown</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddCode();     closeOverflow(); }}><Plus size={12} /> Code</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddSql();      closeOverflow(); }}><Plus size={12} /> SQL</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddHttp();     closeOverflow(); }}><Plus size={12} /> HTTP</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddShell();    closeOverflow(); }}><Plus size={12} /> Shell</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddCheck();    closeOverflow(); }}><Plus size={12} /> Check</button>
              <button className="toolbar-overflow-item" onClick={() => { onAddDecision(); closeOverflow(); }}><Plus size={12} /> Decision</button>
              <div className="toolbar-overflow-sep" />
              <button
                className={`toolbar-overflow-item${autoRun ? ' toolbar-overflow-item--on' : ''}`}
                onClick={onToggleAutoRun}
                title={autoRun ? 'Auto-run: ON' : 'Auto-run: OFF'}
              ><Zap size={13} /> Auto-run {autoRun ? 'ON' : 'OFF'}</button>
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
