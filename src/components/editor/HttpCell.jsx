import React, { useState } from 'react';
import { CodeEditor } from './CodeEditor.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';
import { CellControls } from './CellControls.jsx';
import { CellNameColor } from './CellNameColor.jsx';
import { CellRunGroup } from './CellRunGroup.jsx';

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
  onRunFrom, onRunTo,
  onDelete, onCopy,
  onMoveUp,
  onMoveDown,
  columns = 0, onColumnsChange,
  onToggleBookmark,
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
        <CellRunGroup onRun={onRun} onRunFrom={onRunFrom} onRunTo={onRunTo} isRunning={isRunning} disabled={anyRunning || !kernelReady} />
        <div className="header-right">
          <CellControls onCopy={onCopy} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} columns={columns} onColumnsChange={onColumnsChange} bookmarked={cell.bookmarked} onToggleBookmark={onToggleBookmark} />
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
