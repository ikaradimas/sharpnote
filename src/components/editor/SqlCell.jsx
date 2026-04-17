import React, { useState } from 'react';
import { CodeEditor } from './CodeEditor.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';
import { CellControls } from './CellControls.jsx';
import { CellNameColor } from './CellNameColor.jsx';
import { CellRunGroup } from './CellRunGroup.jsx';

export function SqlCell({
  cell,
  cellIndex,
  outputs,
  notebookId,
  attachedDbs,
  isRunning,
  anyRunning,
  kernelReady = true,
  onUpdate,
  onRun,
  onRunFrom, onRunTo,
  onDbChange,
  onDelete, onCopy,
  onMoveUp,
  onMoveDown,
  columns = 0, onColumnsChange,
  onToggleBookmark,
  onNameChange,
  onColorChange,
}) {
  const readyDbs = (attachedDbs || []).filter((d) => d.status === 'ready');
  const selectedDb = cell.db || (readyDbs[0]?.connectionId ?? '');
  const selectedSchema = readyDbs.find((d) => d.connectionId === selectedDb)?.schema ?? null;

  return (
    <div className={`cell sql-cell${isRunning ? ' running' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="code-cell-header">
        <CellNameColor name={cell.name} color={cell.color} onNameChange={onNameChange} onColorChange={onColorChange} />
        <span className="cell-lang-label sql-label">SQL</span>
        <span className="cell-id-label" title={`Cell ID: ${cell.id}`}>{cell.id}</span>
        <select
          className="sql-db-select"
          value={selectedDb}
          onChange={(e) => onDbChange(e.target.value)}
          title="Database to query"
          disabled={readyDbs.length === 0}
        >
          {readyDbs.length === 0 && <option value="">No database attached</option>}
          {readyDbs.map((d) => (
            <option key={d.connectionId} value={d.connectionId}>{d.varName}</option>
          ))}
        </select>
        <CellRunGroup onRun={onRun} onRunFrom={onRunFrom} onRunTo={onRunTo} isRunning={isRunning} disabled={anyRunning || !kernelReady || readyDbs.length === 0 || !selectedDb} />
        <div className="header-right">
          <CellControls onCopy={onCopy} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} columns={columns} onColumnsChange={onColumnsChange} bookmarked={cell.bookmarked} onToggleBookmark={onToggleBookmark} />
        </div>
      </div>
      <CodeEditor
        value={cell.content}
        onChange={(val) => onUpdate(val)}
        language="sql"
        sqlSchema={selectedSchema}
        onCtrlEnter={kernelReady && !anyRunning ? onRun : undefined}
        lintEnabled={false}
        cellIndex={cellIndex}
      />
      <CellOutput messages={outputs} notebookId={notebookId} />
    </div>
  );
}
