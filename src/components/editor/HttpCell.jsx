import React, { useState } from 'react';
import { CodeEditor } from './CodeEditor.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';
import { CellControls } from './CellControls.jsx';
import { CellNameColor } from './CellNameColor.jsx';

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
  onDelete, onCopy,
  onMoveUp,
  onMoveDown,
  onNameChange,
  onColorChange,
}) {
  return (
    <div className={`cell http-cell${isRunning ? ' running' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="code-cell-header">
        <CellNameColor name={cell.name} color={cell.color} onNameChange={onNameChange} onColorChange={onColorChange} />
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
          <CellControls onCopy={onCopy} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
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
