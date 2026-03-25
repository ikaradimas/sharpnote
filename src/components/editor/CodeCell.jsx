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

function formatElapsed(ms) {
  if (ms < 60_000) {
    return ms < 10_000
      ? `${(ms / 1000).toFixed(2)}s`
      : `${(ms / 1000).toFixed(1)}s`;
  }
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function CodeCell({
  cell,
  cellIndex,
  outputs,
  outputHistory,
  notebookId,
  isStale,
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
  requestSignature,
  lintEnabled = true,
}) {
  const outputMode = cell.outputMode || 'auto';
  const locked = cell.locked || false;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [lastDuration, setLastDuration] = useState(null);
  const [lastRanAt, setLastRanAt] = useState(null);
  const elapsedRef = useRef(0);
  // Output history browsing: -1 = current, 0 = oldest historical, histLen-1 = newest historical
  const [histIdx, setHistIdx] = useState(-1);

  // Reset to current when a new run starts or outputs change
  useEffect(() => {
    setHistIdx(-1);
  }, [isRunning, outputs]);

  useEffect(() => {
    if (!isRunning) return;
    const startTime = Date.now();
    elapsedRef.current = 0;
    setElapsed(0);
    const id = setInterval(() => {
      elapsedRef.current = Date.now() - startTime;
      setElapsed(elapsedRef.current);
    }, 100);
    return () => {
      clearInterval(id);
      setLastDuration(elapsedRef.current);
      setLastRanAt(new Date());
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

  const histLen = outputHistory ? outputHistory.length : 0;
  const displayedOutputs = histIdx >= 0 && histLen > 0
    ? outputHistory[histIdx]
    : outputs;

  return (
    <div className={`cell code-cell${isRunning ? ' running' : ''}${locked ? ' cell-locked' : ''}${isStale ? ' cell-stale' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      {isStale && (
        <div className="cell-stale-banner" title="Variables used in this cell may have changed — consider re-running">
          ↺ upstream variables changed
        </div>
      )}
      <div className="code-cell-header">
        <span className="cell-lang-label">C#</span>
        <span className="cell-id-label" title={`Cell ID: ${cell.id}`}>{cell.id}</span>
        <div className="cell-run-group" ref={dropdownRef}>
          {isRunning ? (
            <button className="cell-stop-btn" onClick={onInterrupt}
                    title="Interrupt (stops async ops; use Reset for tight loops)">
              ⏹ Stop
            </button>
          ) : (
            <>
              <button className="run-btn" onClick={onRun} disabled={anyRunning || !kernelReady} title="Run (Ctrl+Enter)">▶ Run</button>
              <button className="cell-run-chevron" onClick={() => setDropdownOpen((v) => !v)}
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
        onRequestSignature={requestSignature}
        lintEnabled={lintEnabled}
        readOnly={locked}
        cellIndex={cellIndex}
      />
      <CellOutput messages={displayedOutputs} notebookId={notebookId} />
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
            {!isRunning && lastRanAt && (
              <span className="cell-ran-at" title={lastRanAt.toLocaleString()}>
                {lastRanAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
            )}
          </span>
        )}
        {histLen > 0 && !isRunning && (
          <span className="output-history-nav">
            <button
              className="hist-nav-btn"
              onClick={() => setHistIdx((i) => Math.max(i === -1 ? histLen - 1 : i - 1, 0))}
              disabled={histIdx === 0}
              title="Previous run output"
            >‹</button>
            <span className="hist-nav-label">
              {histIdx === -1 ? `current` : `run −${histLen - histIdx}`}
              {` / ${histLen + 1}`}
            </span>
            <button
              className="hist-nav-btn"
              onClick={() => setHistIdx((i) => i >= histLen - 1 ? -1 : i + 1)}
              disabled={histIdx === -1}
              title="Next run output"
            >›</button>
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
