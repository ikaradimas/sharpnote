import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, ChevronRight, ChevronDown, ChevronsRight, ChevronsUp, Lock, Unlock, Timer, Check, X, SkipForward, Monitor, RefreshCw } from 'lucide-react';
import { CodeEditor } from './CodeEditor.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';
import { CellControls } from './CellControls.jsx';
import { CellNameColor } from './CellNameColor.jsx';

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

const PRESENT_REFRESH_PRESETS = [
  { label: 'Off',  ms: 0 },
  { label: '5s',   ms: 5000 },
  { label: '10s',  ms: 10000 },
  { label: '30s',  ms: 30000 },
  { label: '1m',   ms: 60000 },
  { label: '5m',   ms: 300000 },
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
  onNameChange,
  onColorChange,
  allCells,
  onRunCellByName,
  breakpoints,
  onToggleBreakpoint,
  debugState,
  onDebugResume,
  onDebugStep,
  onTogglePresent,
  onPresentIntervalChange,
}) {
  const outputMode = cell.outputMode || 'auto';
  const locked = cell.locked || false;
  const codeFolded = cell.codeFolded || false;
  const presenting = cell.presenting || false;
  const presentInterval = cell.presentInterval || 0;
  const [presentRefreshOpen, setPresentRefreshOpen] = useState(false);
  const presentRefreshRef = useRef(null);
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

  // Presentation auto-refresh interval
  useEffect(() => {
    if (!presenting || !presentInterval || presentInterval <= 0) return;
    const tick = () => {
      if (!isRunning && kernelReady) onRun?.();
    };
    const id = setInterval(tick, presentInterval);
    return () => clearInterval(id);
  }, [presenting, presentInterval, isRunning, kernelReady, onRun]);

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

  useEffect(() => {
    if (!presentRefreshOpen) return;
    const handler = (e) => {
      if (presentRefreshRef.current && !presentRefreshRef.current.contains(e.target))
        setPresentRefreshOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [presentRefreshOpen]);

  const histLen = outputHistory ? outputHistory.length : 0;
  const displayedOutputs = histIdx >= 0 && histLen > 0
    ? outputHistory[histIdx]
    : outputs;

  return (
    <div className={`cell code-cell${isRunning ? ' running' : ''}${locked ? ' cell-locked' : ''}${isStale ? ' cell-stale' : ''}${codeFolded ? ' cell-folded' : ''}${isScheduled ? ' cell-scheduled' : ''}${presenting ? ' cell-presenting' : ''}${debugState?.cellId === cell.id && debugState.paused ? ' debug-paused' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      {isStale && (
        <div className="cell-stale-banner" title="Variables used in this cell may have changed — consider re-running">
          ↺ upstream variables changed
        </div>
      )}
      {debugState?.cellId === cell.id && debugState.paused && (
        <div className="cell-debug-controls">
          <button className="debug-resume-btn" onClick={onDebugResume} title="Resume execution"><Play size={12} /> Resume</button>
          <button className="debug-step-btn" onClick={onDebugStep} title="Step to next statement"><SkipForward size={12} /> Step</button>
          <span className="debug-paused-label">Paused at line {debugState.line}</span>
        </div>
      )}
      <div className="code-cell-header">
        <button
          className={`cell-fold-btn${codeFolded ? ' cell-fold-btn--folded' : ''}`}
          onClick={onToggleFold}
          title={codeFolded ? 'Expand cell' : 'Collapse cell'}
        >
          {codeFolded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <CellNameColor name={cell.name} color={cell.color} onNameChange={onNameChange} onColorChange={onColorChange} />
        <span className="cell-lang-label">C#</span>
        <span className="cell-id-label" title={`Cell ID: ${cell.id}`}>{cell.id}</span>
        <div className="cell-run-group" ref={dropdownRef}>
          {isRunning ? (
            <button className="cell-stop-btn" onClick={onInterrupt}
                    title="Interrupt (stops async ops; use Reset for tight loops)">
              <Square size={12} /> Stop
            </button>
          ) : (
            <>
              <button className="run-btn" onClick={onRun} disabled={anyRunning || !kernelReady} title="Run (Ctrl+Enter)"><Play size={12} /> Run</button>
              <button className="cell-run-chevron" onClick={() => setDropdownOpen((v) => !v)}
                      disabled={anyRunning || !kernelReady} title="More run options">▾</button>
            </>
          )}
          {dropdownOpen && !isRunning && (
            <div className="cell-run-dropdown">
              <button className="cell-run-dropdown-item" onClick={() => { onRun(); setDropdownOpen(false); }}>
                <Play size={12} /> Run this cell
              </button>
              <button className="cell-run-dropdown-item" onClick={() => { onRunFrom(); setDropdownOpen(false); }}>
                <ChevronsRight size={12} /> Run from here
              </button>
              <button className="cell-run-dropdown-item" onClick={() => { onRunTo(); setDropdownOpen(false); }}>
                <ChevronsUp size={12} /> Run to here
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
          breakpoints={breakpoints}
          onToggleBreakpoint={onToggleBreakpoint}
          pausedLine={debugState?.cellId === cell.id ? debugState.line : null}
        />
      )}
      {displayedOutputs && displayedOutputs.length > 0 && (
        <div className="output-toggle-row">
          <button
            className="output-toggle-btn"
            onClick={() => setOutputCollapsed((v) => !v)}
            title={outputCollapsed ? 'Show output' : 'Hide output'}
          >
            {outputCollapsed ? <><ChevronRight size={12} /> Output</> : <><ChevronDown size={12} /> Output</>}
          </button>
        </div>
      )}
      {presenting && (
        <button className="cell-present-exit" onClick={onTogglePresent} title="Exit presentation mode">
          <Monitor size={11} />
        </button>
      )}
      {!outputCollapsed && <CellOutput messages={displayedOutputs} notebookId={notebookId} allCells={allCells} onRunCellByName={onRunCellByName} />}
      <div className="code-cell-footer">
        {(isRunning || lastDuration !== null) && (
          <span className="cell-execution-timer">
            {isRunning
              ? <span className="cell-execution-spinner" />
              : lastResult === 'success'
                ? <span className="cell-exec-icon cell-exec-success"><Check size={11} /></span>
                : lastResult === 'error'
                  ? <span className="cell-exec-icon cell-exec-error"><X size={11} /></span>
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
              <Timer size={12} /> {formatInterval(cell.scheduleInterval)}
            </button>
          ) : (
            <button
              className="cell-schedule-btn"
              onClick={() => setScheduleDropdownOpen((v) => !v)}
              title="Run on interval"
            >
              <Timer size={12} />
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
        <div className="cell-present-group" ref={presentRefreshRef}>
          <button
            className={`cell-present-btn${presenting ? ' cell-present-btn-on' : ''}`}
            onClick={onTogglePresent}
            title={presenting ? 'Exit presentation mode' : 'Presentation mode (show output only)'}
          >
            <Monitor size={12} />
          </button>
          {presenting && (
            <button
              className={`cell-present-refresh-btn${presentInterval > 0 ? ' active' : ''}`}
              onClick={() => setPresentRefreshOpen((v) => !v)}
              title={presentInterval > 0 ? `Auto-refresh every ${formatInterval(presentInterval)} — click to change` : 'Set auto-refresh interval'}
            >
              <RefreshCw size={11} />
              {presentInterval > 0 && <span className="cell-present-refresh-label">{formatInterval(presentInterval)}</span>}
            </button>
          )}
          {presentRefreshOpen && (
            <div className="cell-present-refresh-dropdown">
              {PRESENT_REFRESH_PRESETS.map(({ label, ms }) => (
                <button
                  key={ms}
                  className={`cell-present-refresh-item${presentInterval === ms ? ' active' : ''}`}
                  onClick={() => { onPresentIntervalChange(ms); setPresentRefreshOpen(false); }}
                >
                  {label}
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
          {locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
      </div>
    </div>
  );
}
