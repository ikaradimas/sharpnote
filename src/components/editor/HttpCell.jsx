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

export function HttpCell({
  cell,
  cellIndex,
  outputs,
  notebookId,
  isRunning,
  anyRunning,
  kernelReady = true,
  onUpdate,
  onRun,
  onDelete,
  onMoveUp,
  onMoveDown,
}) {
  return (
    <div className={`cell http-cell${isRunning ? ' running' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="code-cell-header">
        <span className="cell-lang-label http-label">HTTP</span>
        <span className="cell-id-label" title={`Cell ID: ${cell.id}`}>{cell.id}</span>
        <div className="cell-run-group">
          {isRunning ? (
            <button className="cell-stop-btn" disabled title="Running…">⏳ Running</button>
          ) : (
            <button
              className="run-btn"
              onClick={onRun}
              disabled={anyRunning || !kernelReady}
              title="Send request (Ctrl+Enter)"
            >
              ▶ Send
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
        language="http"
        onCtrlEnter={kernelReady && !anyRunning ? onRun : undefined}
        cellIndex={cellIndex}
      />
      <CellOutput messages={outputs} notebookId={notebookId} />
    </div>
  );
}
