import React, { useState, useEffect, useRef } from 'react';
import { CodeEditor } from './CodeEditor.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';

function CellControls({ onMoveUp, onMoveDown, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

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

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function CodeCell({
  cell,
  cellIndex,
  outputs,
  lastResult = null,
  isRunning,
  anyRunning,
  kernelReady = true,
  onUpdate,
  onRun,
  onInterrupt,
  onRunFrom,
  onRunTo,
  onDelete,
  onMoveUp,
  onMoveDown,
  onOutputModeChange,
  onToggleLock,
  requestCompletions,
  requestLint,
}) {
  const outputMode = cell.outputMode || 'auto';
  const locked = cell.locked || false;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [lastDuration, setLastDuration] = useState(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!isRunning) return;
    elapsedRef.current = 0;
    setElapsed(0);
    const id = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => {
      clearInterval(id);
      setLastDuration(elapsedRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  return (
    <div className={`cell code-cell${isRunning ? ' running' : ''}${locked ? ' cell-locked' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="code-cell-header">
        <span className="cell-lang-label">C#</span>
        <div className="cell-run-group" ref={dropdownRef}>
          {isRunning ? (
            <button className="cell-stop-btn" onClick={onInterrupt}
                    title="Interrupt (stops async ops; use Reset for tight loops)">
              ⏹ Stop
            </button>
          ) : (
            <>
              <button className="run-btn" onClick={onRun} disabled={anyRunning || !kernelReady} title="Run (Ctrl+Enter)">▶ Run</button>
              <button className="cell-run-chevron" onClick={() => setDropdownOpen(v => !v)}
                      disabled={anyRunning || !kernelReady} title="More run options">▾</button>
            </>
          )}
          {dropdownOpen && !isRunning && (
            <div className="cell-run-dropdown">
              <button className="cell-run-dropdown-item" onClick={() => { onRun(); setDropdownOpen(false); }}>
                ▶&nbsp; Run this cell
              </button>
              <button className="cell-run-dropdown-item" onClick={() => { onRunFrom(); setDropdownOpen(false); }}>
                ▶▶ Run from here
              </button>
              <button className="cell-run-dropdown-item" onClick={() => { onRunTo(); setDropdownOpen(false); }}>
                ▲▲ Run to here
              </button>
            </div>
          )}
        </div>
        <div className="header-right">
          <label className="output-mode-label">output</label>
          <select
            className="output-mode-select"
            value={outputMode}
            onChange={(e) => onOutputModeChange(e.target.value)}
            title="Output mode"
          >
            <option value="auto">auto</option>
            <option value="text">text</option>
            <option value="html">html</option>
            <option value="table">table</option>
            <option value="graph">graph</option>
          </select>
          <CellControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
        </div>
      </div>
      <CodeEditor
        value={cell.content}
        onChange={(val) => onUpdate(val)}
        language="csharp"
        onCtrlEnter={kernelReady && !anyRunning ? onRun : undefined}
        onRequestCompletions={requestCompletions}
        onRequestLint={requestLint}
        readOnly={locked}
        cellIndex={cellIndex}
      />
      <CellOutput messages={outputs} />
      <div className="code-cell-footer">
        {(isRunning || lastDuration !== null) && (
          <span className="cell-execution-timer">
            {isRunning
              ? <span className="cell-execution-spinner" />
              : lastResult === 'success'
                ? <span className="cell-exec-icon cell-exec-success">✓</span>
                : lastResult === 'error'
                  ? <span className="cell-exec-icon cell-exec-error">✗</span>
                  : null
            }
            {formatElapsed(isRunning ? elapsed : lastDuration)}
          </span>
        )}
        <button
          className={`cell-lock-btn${locked ? ' cell-lock-btn-on' : ''}`}
          onClick={onToggleLock}
          title={locked ? 'Unlock cell' : 'Lock cell (read-only)'}
        >
          {locked ? '🔒' : '🔓'}
        </button>
      </div>
    </div>
  );
}
