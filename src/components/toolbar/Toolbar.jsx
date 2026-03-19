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
  theme,
  onThemeChange,
  dockLayout,
  savedLayouts,
  onSaveLayout,
  onLoadLayout,
  onDeleteLayout,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const displayName = getNotebookDisplayName(notebookPath, notebookTitle, 'Untitled Notebook');

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => { setDraft(displayName); setEditing(true); };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayName) onRename?.(trimmed);
    setEditing(false);
  };

  return (
    <div className="toolbar">
      {editing ? (
        <input
          ref={inputRef}
          className="toolbar-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
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
      <button onClick={onRunAll} disabled={kernelStatus !== 'ready'}
              title={kernelStatus === 'ready' ? 'Run all code cells' : 'Waiting for kernel…'}
              className="toolbar-run-all">▶▶ Run All</button>
      <button onClick={onAddMarkdown} title="Add markdown cell">+ Markdown</button>
      <button onClick={onAddCode} title="Add code cell">+ Code</button>
      <div className="toolbar-separator" />
      <button className="toolbar-icon-btn" onClick={onSave} title="Save notebook"><IconSave /></button>
      <button className="toolbar-icon-btn" onClick={onLoad} title="Open notebook"><IconOpen /></button>
      <div className="toolbar-separator" />
      <ToolsMenu
        onReset={onReset}
        logPanelOpen={logPanelOpen}
        onToggleLogs={onToggleLogs}
        nugetPanelOpen={nugetPanelOpen}
        onToggleNuget={onToggleNuget}
        configPanelOpen={configPanelOpen}
        onToggleConfig={onToggleConfig}
        configCount={configCount}
        dbPanelOpen={dbPanelOpen}
        onToggleDb={onToggleDb}
        varsPanelOpen={varsPanelOpen}
        onToggleVars={onToggleVars}
        tocPanelOpen={tocPanelOpen}
        onToggleToC={onToggleToC}
        libraryPanelOpen={libraryPanelOpen}
        onToggleLibrary={onToggleLibrary}
        filesPanelOpen={filesPanelOpen}
        onToggleFiles={onToggleFiles}
      />
      {dockLayout && (
        <LayoutManager
          dockLayout={dockLayout}
          savedLayouts={savedLayouts ?? []}
          onSave={onSaveLayout}
          onLoad={onLoadLayout}
          onDelete={onDeleteLayout}
        />
      )}
      <ThemePicker theme={theme} onSelect={onThemeChange} />
      <div className="kernel-status">
        <div className={`kernel-dot ${kernelStatus}`} />
        <span>{kernelStatus}</span>
      </div>
    </div>
  );
}
