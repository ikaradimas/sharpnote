import React, { useState, useEffect, useRef } from 'react';
import { CodeEditor } from './CodeEditor.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';
import { CellControls } from './CellControls.jsx';

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

const SCHEDULE_PRESETS = [
  { label: '5s',  ms: 5000 },
  { label: '10s', ms: 10000 },
  { label: '30s', ms: 30000 },
  { label: '1m',  ms: 60000 },
  { label: '5m',  ms: 300000 },
];

function formatInterval(ms) {
  if (ms >= 60000) return `${ms / 60000}m`;
  return `${ms / 1000}s`;
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
  isScheduled = false,
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
  onToggleFold,
  onScheduleStart,
  onScheduleStop,
}) {
  const outputMode = cell.outputMode || 'auto';
  const locked = cell.locked || false;
  const codeFolded = cell.codeFolded || false;
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [scheduleDropdownOpen, setScheduleDropdownOpen] = useState(false);
  const scheduleDropdownRef = useRef(null);
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

  useEffect(() => {
    if (!scheduleDropdownOpen) return;
    const handler = (e) => {
      if (scheduleDropdownRef.current && !scheduleDropdownRef.current.contains(e.target))
        setScheduleDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [scheduleDropdownOpen]);

  const histLen = outputHistory ? outputHistory.length : 0;
  const displayedOutputs = histIdx >= 0 && histLen > 0
    ? outputHistory[histIdx]
    : outputs;

  return (
    <div className={`cell code-cell${isRunning ? ' running' : ''}${locked ? ' cell-locked' : ''}${isStale ? ' cell-stale' : ''}${codeFolded ? ' cell-folded' : ''}${isScheduled ? ' cell-scheduled' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      {isStale && (
        <div className="cell-stale-banner" title="Variables used in this cell may have changed — consider re-running">
          ↺ upstream variables changed
        </div>
      )}
      <div className="code-cell-header">
        <button
          className={`cell-fold-btn${codeFolded ? ' cell-fold-btn--folded' : ''}`}
          onClick={onToggleFold}
          title={codeFolded ? 'Expand cell' : 'Collapse cell'}
        >
          {codeFolded ? '▸' : '▾'}
        </button>
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
        {!isRunning && lastDuration !== null && (
          <span className={`cell-header-timer${lastDuration > 5000 ? ' cell-timer-very-slow' : lastDuration > 1000 ? ' cell-timer-slow' : ''}`}>
            {formatElapsed(lastDuration)}
          </span>
        )}
        <div className="header-right">
          <div className="header-overflow">
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
          </div>
          <CellControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
        </div>
      </div>
      {codeFolded ? (
        <div className="cell-fold-preview" onClick={onToggleFold} title="Click to expand">
          {(cell.content || '').split('\n')[0] || '(empty)'}
        </div>
      ) : (
        <CodeEditor
          value={cell.content}
          onChange={(val) => onUpdate(val)}
          language="csharp"
          notebookId={notebookId}
          onCtrlEnter={kernelReady && !anyRunning ? onRun : undefined}
          readOnly={locked}
          cellIndex={cellIndex}
        />
      )}
      {displayedOutputs && displayedOutputs.length > 0 && (
        <div className="output-toggle-row">
          <button
            className="output-toggle-btn"
            onClick={() => setOutputCollapsed((v) => !v)}
            title={outputCollapsed ? 'Show output' : 'Hide output'}
          >
            {outputCollapsed ? '▸ Output' : '▾ Output'}
          </button>
        </div>
      )}
      {!outputCollapsed && <CellOutput messages={displayedOutputs} notebookId={notebookId} />}
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
        <div className="cell-schedule-group" ref={scheduleDropdownRef}>
          {isScheduled ? (
            <button
              className="cell-schedule-btn active"
              onClick={onScheduleStop}
              title="Stop scheduled execution"
            >
              ⏱ {formatInterval(cell.scheduleInterval)}
            </button>
          ) : (
            <button
              className="cell-schedule-btn"
              onClick={() => setScheduleDropdownOpen((v) => !v)}
              title="Run on interval"
            >
              ⏱
            </button>
          )}
          {scheduleDropdownOpen && !isScheduled && (
            <div className="cell-schedule-dropdown">
              {SCHEDULE_PRESETS.map(({ label, ms }) => (
                <button
                  key={ms}
                  className="cell-schedule-dropdown-item"
                  onClick={() => { onScheduleStart(ms); setScheduleDropdownOpen(false); }}
                >
                  Every {label}
                </button>
              ))}
            </div>
          )}
        </div>
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
