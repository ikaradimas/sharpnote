import React, { useState } from 'react';
import { CodeEditor } from './CodeEditor.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';

function CellControls({ onMoveUp, onMoveDown, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <>
        <span className="delete-confirm-label">Delete?</span>
        <button className="cell-ctrl-btn cell-ctrl-danger" title="Confirm delete" onClick={onDelete}>✓</button>
        <button className="cell-ctrl-btn" title="Cancel" onClick={() => setConfirming(false)}>✕</button>
      </>
    );
  }

  return (
    <>
      <button className="cell-ctrl-btn" title="Move Up" onClick={onMoveUp}>↑</button>
      <button className="cell-ctrl-btn" title="Move Down" onClick={onMoveDown}>↓</button>
      <button className="cell-ctrl-btn" title="Delete" onClick={() => setConfirming(true)}>✕</button>
    </>
  );
}

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
  onDbChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}) {
  const readyDbs = (attachedDbs || []).filter((d) => d.status === 'ready');
  const selectedDb = cell.db || (readyDbs[0]?.connectionId ?? '');
  const selectedSchema = readyDbs.find((d) => d.connectionId === selectedDb)?.schema ?? null;

  return (
    <div className={`cell sql-cell${isRunning ? ' running' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="code-cell-header">
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
        <div className="cell-run-group">
          {isRunning ? (
            <button className="cell-stop-btn" disabled title="Running…">⏳ Running</button>
          ) : (
            <button
              className="run-btn"
              onClick={onRun}
              disabled={anyRunning || !kernelReady || readyDbs.length === 0 || !selectedDb}
              title="Run query (Ctrl+Enter)"
            >
              ▶ Run
            </button>
          )}
        </div>
        <div className="header-right">
          <CellControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
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
