import React, { useState, useMemo } from 'react';
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
  config = [],
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
  onEnvChange,
}) {
  // Extract available environments from config entries prefixed with env.{name}.
  const environments = useMemo(() => {
    const envNames = new Set();
    for (const entry of config) {
      const key = entry.key || entry.name || '';
      const match = key.match(/^env\.([^.]+)\./);
      if (match) envNames.add(match[1]);
    }
    return Array.from(envNames).sort();
  }, [config]);

  const selectedEnv = cell.env || '';

  return (
    <div className={`cell http-cell${isRunning ? ' running' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="code-cell-header">
        <CellNameColor name={cell.name} color={cell.color} onNameChange={onNameChange} onColorChange={onColorChange} />
        <span className="cell-lang-label http-label">HTTP</span>
        <span className="cell-id-label" title={`Cell ID: ${cell.id}`}>{cell.id}</span>
        {environments.length > 0 && (
          <select
            className="http-env-select"
            value={selectedEnv}
            onChange={(e) => onEnvChange?.(e.target.value)}
            title="Environment"
          >
            <option value="">No env</option>
            {environments.map((env) => (
              <option key={env} value={env}>{env}</option>
            ))}
          </select>
        )}
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
