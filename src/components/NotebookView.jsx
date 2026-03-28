import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { makeCell } from '../notebook-factory.js';
import { getSectionHeadingLevel, getCollapsedSections } from '../utils.js';
import { Toolbar } from './toolbar/Toolbar.jsx';
import { CodeCell } from './editor/CodeCell.jsx';
import { MarkdownCell } from './editor/MarkdownCell.jsx';
import { SqlCell } from './editor/SqlCell.jsx';
import { AddBar } from './editor/AddBar.jsx';
import { FindBar } from './FindBar.jsx';

export function NotebookView({
  nb,
  onSetNb,
  onSetNbDirty,
  onRunCell,
  onRunSqlCell,
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
}) {
  const { cells, outputs, outputHistory, cellResults, running, kernelStatus,
          config, logPanelOpen, nugetPanelOpen, configPanelOpen,
          dbPanelOpen, varsPanelOpen, tocPanelOpen, graphPanelOpen, todoPanelOpen,
          path: notebookPath, staleCellIds, attachedDbs, autoRun } = nb;

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

  const updateCell = (id, content) => {
    onSetNbDirty((n) => ({ cells: n.cells.map((c) => c.id === id ? { ...c, content } : c) }));
  };

  const updateCellProp = (id, prop, value) => {
    onSetNbDirty((n) => ({ cells: n.cells.map((c) => c.id === id ? { ...c, [prop]: value } : c) }));
  };

  const toggleFold = (id) => updateCellProp(id, 'codeFolded', !(cells.find((c) => c.id === id)?.codeFolded || false));

  const { hidden: collapsedCellIds, counts: collapsedCounts } = useMemo(
    () => getCollapsedSections(cells),
    [cells],
  );

  const deleteCell = (id) => {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Toolbar
        kernelStatus={kernelStatus}
        notebookPath={notebookPath}
        notebookTitle={nb.title}
        onRename={onRename}
        onRunAll={() => onRunAll(nb.id)}
        onAddMarkdown={() => addCell('markdown')}
        onAddCode={() => addCell('code')}
        onAddSql={() => addCell('sql')}
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
        graphPanelOpen={graphPanelOpen}
        onToggleGraph={() => { if (!graphPanelOpen) onFocusPanel?.('graph'); onSetNb((n) => ({ graphPanelOpen: !n.graphPanelOpen })); }}
        todoPanelOpen={todoPanelOpen}
        onToggleTodo={() => { if (!todoPanelOpen) onFocusPanel?.('todo'); onSetNb((n) => ({ todoPanelOpen: !n.todoPanelOpen })); }}
        theme={theme}
        onThemeChange={onThemeChange}
        lineAltEnabled={lineAltEnabled}
        onLineAltChange={onLineAltChange}
        dockLayout={dockLayout}
        savedLayouts={savedLayouts}
        onSaveLayout={onSaveLayout}
        onLoadLayout={onLoadLayout}
        onDeleteLayout={onDeleteLayout}
      />
      {findOpen && (
        <FindBar
          cells={cells}
          onClose={closeFindBar}
          onHighlight={setFindHighlighted}
        />
      )}
      <div className="notebook">
        {cells.length === 0 && (
          <div className="empty-notebook">
            <h2>Empty Notebook</h2>
            <p>Add a markdown or code cell to get started.</p>
          </div>
        )}

        {cells.length > 0 && (
          <AddBar
            onAddMarkdown={() => addCell('markdown', -1)}
            onAddCode={() => addCell('code', -1)}
            onAddSql={() => addCell('sql', -1)}
          />
        )}

        {cells.map((cell, index) => {
          const isHidden = collapsedCellIds.has(cell.id);
          const sectionLevel = getSectionHeadingLevel(cell);
          const isHighlighted = findHighlighted.has(cell.id);
          return (
          <div
            key={cell.id}
            className={`cell-wrapper${isHidden ? ' cell-section-hidden' : ''}${isHighlighted ? ' cell-find-match' : ''}`}
            data-cell-id={cell.id}
          >
            {cell.type === 'markdown' ? (
              <MarkdownCell
                cell={cell}
                cellIndex={index}
                isSectionHeader={sectionLevel !== null}
                onToggleCollapse={() => updateCellProp(cell.id, 'collapsed', !(cell.collapsed || false))}
                collapsedCount={collapsedCounts.get(cell.id) ?? 0}
                onUpdate={(val) => updateCell(cell.id, val)}
                onDelete={() => deleteCell(cell.id)}
                onMoveUp={() => moveCell(cell.id, -1)}
                onMoveDown={() => moveCell(cell.id, 1)}
              />
            ) : cell.type === 'sql' ? (
              <SqlCell
                cell={cell}
                cellIndex={index}
                outputs={outputs[cell.id]}
                notebookId={nb.id}
                attachedDbs={attachedDbs}
                isRunning={running.has(cell.id)}
                anyRunning={running.size > 0}
                kernelReady={kernelStatus === 'ready'}
                onUpdate={(val) => updateCell(cell.id, val)}
                onRun={() => onRunSqlCell(nb.id, cell)}
                onDbChange={(connectionId) => updateCellProp(cell.id, 'db', connectionId)}
                onDelete={() => deleteCell(cell.id)}
                onMoveUp={() => moveCell(cell.id, -1)}
                onMoveDown={() => moveCell(cell.id, 1)}
              />
            ) : (
              <CodeCell
                cell={cell}
                cellIndex={index}
                outputs={outputs[cell.id]}
                outputHistory={outputHistory?.[cell.id] ?? []}
                notebookId={nb.id}
                isStale={(staleCellIds || []).includes(cell.id)}
                lastResult={cellResults?.[cell.id] ?? null}
                isRunning={running.has(cell.id)}
                anyRunning={running.size > 0}
                kernelReady={kernelStatus === 'ready'}
                onUpdate={(val) => updateCell(cell.id, val)}
                onRun={() => onRunCell(nb.id, cell)}
                onInterrupt={() => onInterrupt(nb.id)}
                onRunFrom={() => onRunFrom(nb.id, cell.id)}
                onRunTo={() => onRunTo(nb.id, cell.id)}
                onDelete={() => deleteCell(cell.id)}
                onMoveUp={() => moveCell(cell.id, -1)}
                onMoveDown={() => moveCell(cell.id, 1)}
                onOutputModeChange={(mode) => updateCellProp(cell.id, 'outputMode', mode)}
                onToggleLock={() => updateCellProp(cell.id, 'locked', !(cell.locked || false))}
                onToggleFold={() => toggleFold(cell.id)}
              />
            )}
            <AddBar
              onAddMarkdown={() => addCell('markdown', index)}
              onAddCode={() => addCell('code', index)}
              onAddSql={() => addCell('sql', index)}
            />
          </div>
        ); })}
      </div>
    </div>
  );
}
