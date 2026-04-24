import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { makeCell } from '../notebook-factory.js';
import { getSectionHeadingLevel, getCollapsedSections } from '../utils.js';
import { NOTEBOOK_BACKGROUNDS } from '../config/notebook-backgrounds.js';
import { Toolbar } from './toolbar/Toolbar.jsx';
import { CodeCell } from './editor/CodeCell.jsx';
import { MarkdownCell } from './editor/MarkdownCell.jsx';
import { SqlCell } from './editor/SqlCell.jsx';
import { HttpCell } from './editor/HttpCell.jsx';
import { ShellCell } from './editor/ShellCell.jsx';
import { CheckCell } from './editor/CheckCell.jsx';
import { DecisionCell } from './editor/DecisionCell.jsx';
import { DockerCell } from './editor/DockerCell.jsx';
import { FlociCell } from './editor/FlociCell.jsx';
import { AddBar } from './editor/AddBar.jsx';
import { FindBar } from './FindBar.jsx';
import { CircuitBoard } from './CircuitBoard.jsx';

function NotebookBgOverlay({ file, opacity }) {
  const src = `assets/backgrounds/${file}`;
  return (
    <div className="notebook-bg-overlay" style={{ opacity }}>
      <img src={src} className="notebook-bg-image" alt="" draggable={false} />
    </div>
  );
}

export function NotebookView({
  nb,
  isActive,
  onSetNb,
  onSetNbDirty,
  onRunCell,
  onRunSqlCell,
  onRunHttpCell,
  onRunShellCell,
  onRunDockerCell,
  onRunFlociCell,
  onStopDockerCell,
  onPollDockerStatus,
  onFetchDockerLogs,
  onRunCheckCell,
  onRunDecisionCell,
  onRunCellByName,
  onRunAll,
  onSave,
  onLoad,
  onReset,
  onInterrupt,
  onRunFrom,
  onRunTo,
  onRename,
  libraryPanelOpen,
  onToggleLibrary,
  filesPanelOpen,
  onToggleFiles,
  apiPanelOpen,
  onToggleApi,
  apiEditorPanelOpen,
  onToggleApiEditor,
  gitPanelOpen,
  onToggleGit,
  kafkaPanelOpen,
  onToggleKafka,
  onFocusPanel,
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
  scheduledCells,
  onScheduleStart,
  onScheduleStop,
  scheduledNotebooks,
  onNotebookScheduleStart,
  onNotebookScheduleStop,
  dashboardMode,
  onToggleDashboard,
  onDebugResume,
  onDebugStep,
  onToggleBreakpoint,
  onRetainOutput,
  onUnretainOutput,
  showCircuit = true,
  notebookBg = 'none',
  notebookBgOpacity = 0.15,
  highlightedCellIds,
  onHighlightCells,
  viewerMode = false,
}) {
  const { cells, outputs, outputHistory, cellResults, running, kernelStatus,
          config, logPanelOpen, nugetPanelOpen, configPanelOpen, inlineDiagnostics,
          dbPanelOpen, varsPanelOpen, tocPanelOpen, graphPanelOpen, todoPanelOpen, regexPanelOpen, historyPanelOpen, depsPanelOpen, embedPanelOpen,
          path: notebookPath, staleCellIds, attachedDbs, autoRun, breakpoints, debugState, runningAll } = nb;

  const [findOpen, setFindOpen] = useState(false);
  const [findHighlighted, setFindHighlighted] = useState(new Set());

  // Ctrl+F to open find bar
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const closeFindBar = useCallback(() => {
    setFindOpen(false);
    setFindHighlighted(new Set());
  }, []);

  const addCell = (type, afterIndex = null) => {
    const newCell = makeCell(type, '');
    onSetNbDirty((n) => {
      const next = [...n.cells];
      let idx;
      if (afterIndex === null || afterIndex === undefined) idx = next.length;
      else if (afterIndex < 0) idx = 0;
      else idx = afterIndex + 1;
      next.splice(idx, 0, newCell);
      return { cells: next };
    });
    setTimeout(() => {
      const wrapper = document.querySelector(
        `.notebook-pane[data-nb="${nb.id}"] .cell-wrapper[data-cell-id="${newCell.id}"]`
      );
      wrapper?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
  };

  // Cell clipboard
  const [clipCell, setClipCell] = useState(null);

  const copyCell = (id) => {
    const cell = cells.find((c) => c.id === id);
    if (cell) setClipCell({ ...cell });
  };

  const pasteCell = (afterIndex) => {
    if (!clipCell) return;
    const newId = Math.random().toString(36).slice(2, 10);
    const cloned = { ...clipCell, id: newId };
    // Strip transient runtime state
    delete cloned.containerId;
    delete cloned.containerState;
    delete cloned.containerLogs;
    delete cloned.containerPorts;
    onSetNbDirty((n) => {
      const next = [...n.cells];
      const idx = afterIndex === null || afterIndex === undefined ? next.length
                : afterIndex < 0 ? 0 : afterIndex + 1;
      next.splice(idx, 0, cloned);
      return { cells: next };
    });
    setTimeout(() => {
      const wrapper = document.querySelector(
        `.notebook-pane[data-nb="${nb.id}"] .cell-wrapper[data-cell-id="${cloned.id}"]`
      );
      wrapper?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
  };

  const updateCell = (id, content) => {
    onSetNbDirty((n) => {
      const cellOutputs = n.outputs?.[id];
      const hasErrors = cellOutputs?.some((o) => o.type === 'error');
      const hadDiags = n.inlineDiagnostics?.[id]?.length > 0;
      return {
        cells: n.cells.map((c) => c.id === id ? { ...c, content } : c),
        ...(hasErrors ? { outputs: { ...n.outputs, [id]: cellOutputs.filter((o) => o.type !== 'error') } } : {}),
        ...(hadDiags ? { inlineDiagnostics: { ...(n.inlineDiagnostics || {}), [id]: [] } } : {}),
      };
    });
  };

  const updateCellProp = (id, prop, value) => {
    onSetNbDirty((n) => ({ cells: n.cells.map((c) => c.id === id ? { ...c, [prop]: value } : c) }));
  };

  const toggleFold = (id) => updateCellProp(id, 'codeFolded', !(cells.find((c) => c.id === id)?.codeFolded || false));
  const toggleBookmark = (id) => updateCellProp(id, 'bookmarked', !(cells.find((c) => c.id === id)?.bookmarked || false));

  const { hidden: collapsedCellIds, counts: collapsedCounts } = useMemo(
    () => getCollapsedSections(cells),
    [cells],
  );

  const deleteCell = (id) => {
    onScheduleStop?.(id);
    onSetNbDirty((n) => {
      const newOutputs = { ...n.outputs };
      delete newOutputs[id];
      return { cells: n.cells.filter((c) => c.id !== id), outputs: newOutputs };
    });
  };

  const moveCell = (id, dir) => {
    onSetNbDirty((n) => {
      const idx = n.cells.findIndex((c) => c.id === id);
      if (idx < 0 || idx + dir < 0 || idx + dir >= n.cells.length) return {};
      const next = [...n.cells];
      [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
      return { cells: next };
    });
  };

  const toolbarPortalRoot = document.getElementById('toolbar-portal-root');
  const toolbar = (
    <Toolbar
      kernelStatus={kernelStatus}
      notebookPath={notebookPath}
      notebookTitle={nb.title}
      onRename={onRename}
      anyRunning={running.size > 0 || !!runningAll}
      onRunAll={() => onRunAll(nb.id)}
      onAddMarkdown={() => addCell('markdown')}
      onAddCode={() => addCell('code')}
      onAddSql={() => addCell('sql')}
      onAddHttp={() => addCell('http')}
      onAddShell={() => addCell('shell')}
      onAddDocker={() => addCell('docker')}
      onAddFloci={() => addCell('floci')}
      onAddCheck={() => addCell('check')}
      onAddDecision={() => addCell('decision')}
      autoRun={autoRun || false}
      onToggleAutoRun={() => onSetNbDirty((n) => ({ autoRun: !n.autoRun }))}
      onSave={() => onSave(nb.id)}
      onLoad={onLoad}
      onReset={() => onReset(nb.id)}
      logPanelOpen={logPanelOpen}
      onToggleLogs={() => { if (!logPanelOpen) onFocusPanel?.('log'); onSetNb((n) => ({ logPanelOpen: !n.logPanelOpen })); }}
      nugetPanelOpen={nugetPanelOpen}
      onToggleNuget={() => { if (!nugetPanelOpen) onFocusPanel?.('nuget'); onSetNb((n) => ({ nugetPanelOpen: !n.nugetPanelOpen })); }}
      configPanelOpen={configPanelOpen}
      onToggleConfig={() => { if (!configPanelOpen) onFocusPanel?.('config'); onSetNb((n) => ({ configPanelOpen: !n.configPanelOpen })); }}
      configCount={config.length}
      dbPanelOpen={dbPanelOpen}
      onToggleDb={() => { if (!dbPanelOpen) onFocusPanel?.('db'); onSetNb((n) => ({ dbPanelOpen: !n.dbPanelOpen })); }}
      varsPanelOpen={varsPanelOpen}
      onToggleVars={() => { if (!varsPanelOpen) onFocusPanel?.('vars'); onSetNb((n) => ({ varsPanelOpen: !n.varsPanelOpen })); }}
      tocPanelOpen={tocPanelOpen}
      onToggleToC={() => { if (!tocPanelOpen) onFocusPanel?.('toc'); onSetNb((n) => ({ tocPanelOpen: !n.tocPanelOpen })); }}
      libraryPanelOpen={libraryPanelOpen}
      onToggleLibrary={onToggleLibrary}
      filesPanelOpen={filesPanelOpen}
      onToggleFiles={onToggleFiles}
      apiPanelOpen={apiPanelOpen}
      onToggleApi={onToggleApi}
      apiEditorPanelOpen={apiEditorPanelOpen}
      onToggleApiEditor={onToggleApiEditor}
      gitPanelOpen={gitPanelOpen}
      onToggleGit={onToggleGit}
      kafkaPanelOpen={kafkaPanelOpen}
      onToggleKafka={onToggleKafka}
      graphPanelOpen={graphPanelOpen}
      onToggleGraph={() => { if (!graphPanelOpen) onFocusPanel?.('graph'); onSetNb((n) => ({ graphPanelOpen: !n.graphPanelOpen })); }}
      todoPanelOpen={todoPanelOpen}
      onToggleTodo={() => { if (!todoPanelOpen) onFocusPanel?.('todo'); onSetNb((n) => ({ todoPanelOpen: !n.todoPanelOpen })); }}
      regexPanelOpen={regexPanelOpen}
      onToggleRegex={() => { if (!regexPanelOpen) onFocusPanel?.('regex'); onSetNb((n) => ({ regexPanelOpen: !n.regexPanelOpen })); }}
      historyPanelOpen={historyPanelOpen}
      onToggleHistory={() => { if (!historyPanelOpen) onFocusPanel?.('history'); onSetNb((n) => ({ historyPanelOpen: !n.historyPanelOpen })); }}
      depsPanelOpen={depsPanelOpen}
      onToggleDeps={() => { if (!depsPanelOpen) onFocusPanel?.('deps'); onSetNb((n) => ({ depsPanelOpen: !n.depsPanelOpen })); }}
      embedPanelOpen={embedPanelOpen}
      onToggleEmbed={() => { if (!embedPanelOpen) onFocusPanel?.('embed'); onSetNb((n) => ({ embedPanelOpen: !n.embedPanelOpen })); }}
      onCloseAllPanels={onCloseAllPanels}
      onImportData={onImportData}
      theme={theme}
      onThemeChange={onThemeChange}
      lineAltEnabled={lineAltEnabled}
      onLineAltChange={onLineAltChange}
      dockLayout={dockLayout}
      savedLayouts={savedLayouts}
      onSaveLayout={onSaveLayout}
      onLoadLayout={onLoadLayout}
      onDeleteLayout={onDeleteLayout}
      notebookId={nb.id}
      notebookScheduleMs={scheduledNotebooks?.get(nb.id) ?? null}
      onNotebookScheduleStart={onNotebookScheduleStart}
      onNotebookScheduleStop={onNotebookScheduleStop}
      viewerMode={viewerMode}
    />
  );

  // eslint-disable-next-line react/no-unstable-nested-components
  const renderCell = (cell, index) => {
    if (cell.type === 'markdown') return (
      <MarkdownCell cell={cell} cellIndex={index}
        isSectionHeader={getSectionHeadingLevel(cell) !== null}
        onToggleCollapse={() => updateCellProp(cell.id, 'collapsed', !(cell.collapsed || false))}
        collapsedCount={collapsedCounts.get(cell.id) ?? 0}
        onUpdate={(val) => updateCell(cell.id, val)}
        onDelete={() => deleteCell(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onMoveUp={() => moveCell(cell.id, -1)} onMoveDown={() => moveCell(cell.id, 1)}
        columns={cell.columns || 0} onColumnsChange={(v) => updateCellProp(cell.id, 'columns', v || undefined)}
        onToggleBookmark={() => toggleBookmark(cell.id)} />
    );
    if (cell.type === 'sql') return (
      <SqlCell cell={cell} cellIndex={index} outputs={outputs[cell.id]} notebookId={nb.id}
        attachedDbs={attachedDbs} isRunning={running.has(cell.id)} anyRunning={running.size > 0}
        kernelReady={kernelStatus === 'ready'} onUpdate={(val) => updateCell(cell.id, val)}
        onRun={() => onRunSqlCell(nb.id, cell)}
        onRunFrom={() => onRunFrom(nb.id, cell.id)} onRunTo={() => onRunTo(nb.id, cell.id)}
        onDbChange={(connectionId) => updateCellProp(cell.id, 'db', connectionId)}
        onDelete={() => deleteCell(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onMoveUp={() => moveCell(cell.id, -1)} onMoveDown={() => moveCell(cell.id, 1)}
        columns={cell.columns || 0} onColumnsChange={(v) => updateCellProp(cell.id, 'columns', v || undefined)}
        onNameChange={(name) => updateCellProp(cell.id, 'name', name)}
        onColorChange={(color) => updateCellProp(cell.id, 'color', color)}
        onToggleBookmark={() => toggleBookmark(cell.id)} />
    );
    if (cell.type === 'http') return (
      <HttpCell cell={cell} cellIndex={index} outputs={outputs[cell.id]} notebookId={nb.id}
        config={config}
        isRunning={running.has(cell.id)} anyRunning={running.size > 0}
        kernelReady={kernelStatus === 'ready'} onUpdate={(val) => updateCell(cell.id, val)}
        onRun={() => onRunHttpCell(nb.id, cell)}
        onRunFrom={() => onRunFrom(nb.id, cell.id)} onRunTo={() => onRunTo(nb.id, cell.id)}
        onDelete={() => deleteCell(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onMoveUp={() => moveCell(cell.id, -1)} onMoveDown={() => moveCell(cell.id, 1)}
        columns={cell.columns || 0} onColumnsChange={(v) => updateCellProp(cell.id, 'columns', v || undefined)}
        onNameChange={(name) => updateCellProp(cell.id, 'name', name)}
        onColorChange={(color) => updateCellProp(cell.id, 'color', color)}
        onEnvChange={(env) => updateCellProp(cell.id, 'env', env || undefined)}
        onToggleBookmark={() => toggleBookmark(cell.id)} />
    );
    if (cell.type === 'shell') return (
      <ShellCell cell={cell} cellIndex={index} outputs={outputs[cell.id]} notebookId={nb.id}
        isRunning={running.has(cell.id)} anyRunning={running.size > 0}
        kernelReady={kernelStatus === 'ready'} onUpdate={(val) => updateCell(cell.id, val)}
        onRun={() => onRunShellCell(nb.id, cell)}
        onRunFrom={() => onRunFrom(nb.id, cell.id)} onRunTo={() => onRunTo(nb.id, cell.id)}
        onDelete={() => deleteCell(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onMoveUp={() => moveCell(cell.id, -1)} onMoveDown={() => moveCell(cell.id, 1)}
        columns={cell.columns || 0} onColumnsChange={(v) => updateCellProp(cell.id, 'columns', v || undefined)}
        onNameChange={(name) => updateCellProp(cell.id, 'name', name)}
        onColorChange={(color) => updateCellProp(cell.id, 'color', color)}
        onWorkingDirChange={(dir) => updateCellProp(cell.id, 'workingDir', dir)}
        onToggleBookmark={() => toggleBookmark(cell.id)} />
    );
    if (cell.type === 'docker') return (
      <DockerCell cell={cell} cellIndex={index} outputs={outputs[cell.id]} notebookId={nb.id}
        isRunning={running.has(cell.id)} anyRunning={running.size > 0}
        kernelReady={kernelStatus === 'ready'}
        onUpdate={(fields) => {
          if (typeof fields === 'string') updateCell(cell.id, fields);
          else onSetNbDirty((n) => ({ cells: n.cells.map((c) => c.id === cell.id ? { ...c, ...fields } : c) }));
        }}
        onRun={() => onRunDockerCell(nb.id, cell)} onStopDocker={onStopDockerCell}
        onPollDockerStatus={onPollDockerStatus} onFetchDockerLogs={onFetchDockerLogs}
        onDelete={() => deleteCell(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onMoveUp={() => moveCell(cell.id, -1)} onMoveDown={() => moveCell(cell.id, 1)}
        columns={cell.columns || 0} onColumnsChange={(v) => updateCellProp(cell.id, 'columns', v || undefined)}
        onNameChange={(name) => updateCellProp(cell.id, 'name', name)}
        onColorChange={(color) => updateCellProp(cell.id, 'color', color)}
        onToggleBookmark={() => toggleBookmark(cell.id)} />
    );
    if (cell.type === 'floci') return (
      <FlociCell cell={cell} cellIndex={index} outputs={outputs[cell.id]} notebookId={nb.id}
        isRunning={running.has(cell.id)} anyRunning={running.size > 0}
        kernelReady={kernelStatus === 'ready'}
        onUpdate={(fields) => {
          if (typeof fields === 'string') updateCell(cell.id, fields);
          else onSetNbDirty((n) => ({ cells: n.cells.map((c) => c.id === cell.id ? { ...c, ...fields } : c) }));
        }}
        onRun={() => onRunFlociCell(nb.id, cell)} onStopDocker={onStopDockerCell}
        onPollDockerStatus={onPollDockerStatus} onFetchDockerLogs={onFetchDockerLogs}
        onInsertCodeCell={(snippet) => {
          const newCell = makeCell('code', snippet);
          onSetNbDirty((n) => {
            const idx = n.cells.findIndex((c) => c.id === cell.id);
            const cells = [...n.cells];
            cells.splice(idx + 1, 0, newCell);
            return { cells };
          });
        }}
        onDelete={() => deleteCell(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onMoveUp={() => moveCell(cell.id, -1)} onMoveDown={() => moveCell(cell.id, 1)}
        onNameChange={(name) => updateCellProp(cell.id, 'name', name)}
        onColorChange={(color) => updateCellProp(cell.id, 'color', color)}
        onToggleBookmark={() => toggleBookmark(cell.id)} />
    );
    if (cell.type === 'check') return (
      <CheckCell cell={cell} cellIndex={index} checkResult={nb.checkResults?.[cell.id] ?? null}
        notebookId={nb.id} isRunning={running.has(cell.id)} anyRunning={running.size > 0}
        kernelReady={kernelStatus === 'ready'} onUpdate={(val) => updateCell(cell.id, val)}
        onLabelChange={(label) => updateCellProp(cell.id, 'label', label)}
        onRun={() => onRunCheckCell(nb.id, cell)}
        onRunFrom={() => onRunFrom(nb.id, cell.id)} onRunTo={() => onRunTo(nb.id, cell.id)}
        onDelete={() => deleteCell(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onMoveUp={() => moveCell(cell.id, -1)} onMoveDown={() => moveCell(cell.id, 1)}
        columns={cell.columns || 0} onColumnsChange={(v) => updateCellProp(cell.id, 'columns', v || undefined)}
        onNameChange={(name) => updateCellProp(cell.id, 'name', name)}
        onColorChange={(color) => updateCellProp(cell.id, 'color', color)}
        onToggleBookmark={() => toggleBookmark(cell.id)} />
    );
    if (cell.type === 'decision') return (
      <DecisionCell cell={cell} cellIndex={index} decisionResult={nb.decisionResults?.[cell.id] ?? null}
        notebookId={nb.id} isRunning={running.has(cell.id)} anyRunning={running.size > 0}
        kernelReady={kernelStatus === 'ready'} allCells={cells}
        onUpdate={(val) => updateCell(cell.id, val)}
        onLabelChange={(label) => updateCellProp(cell.id, 'label', label)}
        onNameChange={(name) => updateCellProp(cell.id, 'name', name)}
        onColorChange={(color) => updateCellProp(cell.id, 'color', color)}
        onModeChange={(mode) => updateCellProp(cell.id, 'mode', mode)}
        onTruePathChange={(ids) => updateCellProp(cell.id, 'truePath', ids)}
        onFalsePathChange={(ids) => updateCellProp(cell.id, 'falsePath', ids)}
        onSwitchPathsChange={(paths) => updateCellProp(cell.id, 'switchPaths', paths)}
        onRun={() => onRunDecisionCell(nb.id, cell)}
        onRunFrom={() => onRunFrom(nb.id, cell.id)} onRunTo={() => onRunTo(nb.id, cell.id)}
        onDelete={() => deleteCell(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onMoveUp={() => moveCell(cell.id, -1)} onMoveDown={() => moveCell(cell.id, 1)}
        columns={cell.columns || 0} onColumnsChange={(v) => updateCellProp(cell.id, 'columns', v || undefined)}
        onToggleBookmark={() => toggleBookmark(cell.id)}
        onHighlightCells={onHighlightCells} />
    );
    return (
      <CodeCell cell={cell} cellIndex={index} outputs={outputs[cell.id]}
        outputHistory={outputHistory?.[cell.id] ?? []} notebookId={nb.id}
        isStale={(staleCellIds || []).includes(cell.id)} lastResult={cellResults?.[cell.id] ?? null}
        isRunning={running.has(cell.id)} anyRunning={running.size > 0}
        kernelReady={kernelStatus === 'ready'} onUpdate={(val) => updateCell(cell.id, val)}
        onRun={() => onRunCell(nb.id, cell)} onInterrupt={() => onInterrupt(nb.id)}
        onRunFrom={() => onRunFrom(nb.id, cell.id)} onRunTo={() => onRunTo(nb.id, cell.id)}
        onDelete={() => deleteCell(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onMoveUp={() => moveCell(cell.id, -1)} onMoveDown={() => moveCell(cell.id, 1)}
        columns={cell.columns || 0} onColumnsChange={(v) => updateCellProp(cell.id, 'columns', v || undefined)}
        isScheduled={scheduledCells?.has(cell.id) || false}
        onOutputModeChange={(mode) => updateCellProp(cell.id, 'outputMode', mode)}
        onToggleLock={() => updateCellProp(cell.id, 'locked', !(cell.locked || false))}
        onToggleFold={() => toggleFold(cell.id)}
        onScheduleStart={(ms) => { updateCellProp(cell.id, 'scheduleInterval', ms); onScheduleStart?.(nb.id, cell.id, ms); }}
        onScheduleStop={() => onScheduleStop?.(cell.id)}
        onNameChange={(name) => updateCellProp(cell.id, 'name', name)}
        onColorChange={(color) => updateCellProp(cell.id, 'color', color)}
        allCells={cells} onRunCellByName={onRunCellByName}
        breakpoints={breakpoints?.[cell.id] || []}
        onToggleBreakpoint={(line) => onToggleBreakpoint?.(nb.id, cell.id, line)}
        debugState={debugState} onDebugResume={() => onDebugResume?.(nb.id)} onDebugStep={() => onDebugStep?.(nb.id)}
        onTogglePresent={() => updateCellProp(cell.id, 'presenting', !(cell.presenting || false))}
        onPresentIntervalChange={(ms) => updateCellProp(cell.id, 'presentInterval', ms || undefined)}
        onClearOutput={() => onSetNb((n) => ({ outputs: { ...n.outputs, [cell.id]: [] } }))}
        inlineDiagnostics={inlineDiagnostics?.[cell.id] || null}
        retainedResult={nb.retainedResults?.[cell.id] || null}
        onRetain={() => onRetainOutput?.(nb.id, cell.id)}
        onUnretain={() => onUnretainOutput?.(nb.id, cell.id)}
        onNextCellsChange={(ids) => updateCellProp(cell.id, 'nextCells', ids === null ? undefined : ids)}
        onPrevCellsChange={(ids) => updateCellProp(cell.id, 'prevCells', ids === null ? undefined : ids)}
        cellElapsed={nb.cellElapsed?.[cell.id] ?? null}
        onToggleBookmark={() => toggleBookmark(cell.id)}
        vars={nb.vars || []} />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {isActive && (toolbarPortalRoot ? createPortal(toolbar, toolbarPortalRoot) : toolbar)}
      {findOpen && (
        <FindBar
          cells={cells}
          onClose={closeFindBar}
          onHighlight={setFindHighlighted}
        />
      )}
      <div className={`notebook${dashboardMode ? ' dashboard-mode' : ''}`}>
        {notebookBg !== 'none' && (() => {
          const bg = NOTEBOOK_BACKGROUNDS.find(b => b.id === notebookBg);
          if (!bg) return null;
          return <NotebookBgOverlay file={bg.file} opacity={notebookBgOpacity} />;
        })()}
        {cells.length === 0 && (
          <div className="empty-notebook">
            <h2>Empty Notebook</h2>
            <p>Add a markdown or code cell to get started.</p>
            {showCircuit && <CircuitBoard />}
          </div>
        )}

        {cells.length > 0 && !dashboardMode && (
          <AddBar
            onAddMarkdown={() => addCell('markdown', -1)}
            onAddCode={() => addCell('code', -1)}
            onAddSql={() => addCell('sql', -1)}
            onAddHttp={() => addCell('http', -1)}
            onAddShell={() => addCell('shell', -1)}
            onAddDocker={() => addCell('docker', -1)}
            onAddFloci={() => addCell('floci', -1)}
            onAddCheck={() => addCell('check', -1)}
            onAddDecision={() => addCell('decision', -1)}
            onPaste={clipCell ? () => pasteCell(-1) : undefined}
          />
        )}

        {dashboardMode && (
          <button className="dashboard-exit-btn" onClick={onToggleDashboard} title="Exit Dashboard Mode">
            Exit Dashboard
          </button>
        )}

        {cells.map((cell, index) => {
          const isHidden = collapsedCellIds.has(cell.id);
          const sectionLevel = getSectionHeadingLevel(cell);
          const isHighlighted = findHighlighted.has(cell.id);
          const cols = cell.columns || 0;

          // Column grouping: if this cell has columns and the previous cell had the same,
          // skip rendering (it was already included in the group started by the first cell).
          if (cols > 0 && index > 0 && cells[index - 1].columns === cols) return null;

          // If this cell starts a column group, collect consecutive cells with the same columns value
          if (cols > 0) {
            const group = [{ cell, index }];
            for (let j = index + 1; j < cells.length && cells[j].columns === cols; j++) {
              group.push({ cell: cells[j], index: j });
            }
            return (
              <div key={cell.id} className={`cell-columns cell-columns-${cols}`}>
                {group.map(({ cell: gc, index: gi }) => (
                  <div
                    key={gc.id}
                    className={`cell-wrapper${collapsedCellIds.has(gc.id) ? ' cell-section-hidden' : ''}${findHighlighted.has(gc.id) ? ' cell-find-match' : ''}${highlightedCellIds?.has(gc.id) ? ' cell-highlighted' : ''}`}
                    data-cell-id={gc.id}
                  >
                    {renderCell(gc, gi)}
                  </div>
                ))}
              </div>
            );
          }

          return (
          <div
            key={cell.id}
            className={`cell-wrapper${isHidden ? ' cell-section-hidden' : ''}${isHighlighted ? ' cell-find-match' : ''}${highlightedCellIds?.has(cell.id) ? ' cell-highlighted' : ''}`}
            data-cell-id={cell.id}
          >
            {renderCell(cell, index)}
            {!dashboardMode && (
              <AddBar
                onAddMarkdown={() => addCell('markdown', index)}
                onAddCode={() => addCell('code', index)}
                onAddSql={() => addCell('sql', index)}
                onAddHttp={() => addCell('http', index)}
                onAddShell={() => addCell('shell', index)}
                onAddDocker={() => addCell('docker', index)}
                onAddFloci={() => addCell('floci', index)}
                onAddCheck={() => addCell('check', index)}
                onAddDecision={() => addCell('decision', index)}
                onPaste={clipCell ? () => pasteCell(index) : undefined}
              />
            )}
          </div>
        ); })}
      </div>
    </div>
  );
}
