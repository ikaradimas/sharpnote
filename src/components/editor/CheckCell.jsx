import React, { useState } from 'react';
import { CellControls } from './CellControls.jsx';
import { CellNameColor } from './CellNameColor.jsx';
import { CellRunGroup } from './CellRunGroup.jsx';

export function CheckCell({
  cell,
  cellIndex,
  checkResult,
  notebookId,
  isRunning,
  anyRunning,
  kernelReady = true,
  onUpdate,
  onLabelChange,
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
  const passed = checkResult?.passed;
  const message = checkResult?.message;
  const hasResult = checkResult != null;

  const statusClass = !hasResult ? '' : passed ? ' check-cell-pass' : ' check-cell-fail';

  return (
    <div className={`cell check-cell${isRunning ? ' running' : ''}${statusClass}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="check-cell-body">
        <div className="check-cell-status">
          {isRunning ? (
            <span className="check-spinner" />
          ) : hasResult ? (
            <span className={`check-icon ${passed ? 'check-icon-pass' : 'check-icon-fail'}`}>
              {passed ? '✓' : '✗'}
            </span>
          ) : (
            <span className="check-icon check-icon-pending">○</span>
          )}
        </div>
        <div className="check-cell-content">
          <CellNameColor name={cell.name} color={cell.color} onNameChange={onNameChange} onColorChange={onColorChange} />
          <input
            className="check-label-input"
            placeholder="Check label (optional)"
            value={cell.label || ''}
            onChange={(e) => onLabelChange(e.target.value)}
            spellCheck={false}
          />
          <input
            className="check-expr-input"
            placeholder="C# boolean expression, e.g. orders.Count() > 0"
            value={cell.content}
            onChange={(e) => onUpdate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && kernelReady && !anyRunning) { e.preventDefault(); onRun(); } }}
            spellCheck={false}
          />
          {hasResult && !isRunning && message && (
            <span className="check-message">{message}</span>
          )}
        </div>
        <div className="check-cell-actions">
          <CellRunGroup onRun={onRun} onRunFrom={onRunFrom} onRunTo={onRunTo} isRunning={isRunning} disabled={anyRunning || !kernelReady || !cell.content.trim()} />
          <CellControls onCopy={onCopy} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} columns={columns} onColumnsChange={onColumnsChange} bookmarked={cell.bookmarked} onToggleBookmark={onToggleBookmark} />
        </div>
      </div>
    </div>
  );
}
