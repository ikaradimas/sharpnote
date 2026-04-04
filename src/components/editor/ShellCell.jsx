import React, { useState } from 'react';
import { CodeEditor } from './CodeEditor.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';
import { CellControls } from './CellControls.jsx';

export function ShellCell({
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
    <div className={`cell shell-cell${isRunning ? ' running' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="code-cell-header">
        <span className="cell-lang-label shell-label">Shell</span>
        <span className="cell-id-label" title={`Cell ID: ${cell.id}`}>{cell.id}</span>
        <div className="cell-run-group">
          {isRunning ? (
            <button className="cell-stop-btn" disabled title="Running…">⏳ Running</button>
          ) : (
            <button
              className="run-btn"
              onClick={onRun}
              disabled={anyRunning || !kernelReady}
              title="Run command (Ctrl+Enter)"
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
        language="shell"
        onCtrlEnter={kernelReady && !anyRunning ? onRun : undefined}
        cellIndex={cellIndex}
      />
      <CellOutput messages={outputs} notebookId={notebookId} />
    </div>
  );
}
