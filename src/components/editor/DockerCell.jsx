import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Play, Square, Monitor, Container, Clock, Wifi, X, ScrollText } from 'lucide-react';
import { CellNameColor } from './CellNameColor.jsx';
import { CellControls } from './CellControls.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';

function ConfigField({ label, value, onChange, placeholder, mono }) {
  return (
    <label className="docker-field">
      <span className="docker-field-label">{label}</span>
      <input
        className={`docker-field-input${mono ? ' docker-mono' : ''}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
    </label>
  );
}

function StatusBadge({ state }) {
  const cls = state === 'running' ? 'docker-badge-running'
            : state === 'error'   ? 'docker-badge-error'
            : 'docker-badge-stopped';
  const label = state === 'running' ? 'Running'
              : state === 'error'   ? 'Error'
              : 'Stopped';
  return <span className={`docker-status-badge ${cls}`}>{label}</span>;
}

function LogsPopup({ logs, onClose, onRefresh }) {
  const preRef = useRef(null);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [logs]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="docker-logs-overlay" onClick={onClose}>
      <div className="docker-logs-popup" onClick={(e) => e.stopPropagation()}>
        <div className="docker-logs-header">
          <ScrollText size={14} />
          <span className="docker-logs-title">Container Logs</span>
          <button className="docker-logs-refresh" onClick={onRefresh} title="Refresh logs">↻</button>
          <button className="docker-logs-close" onClick={onClose} title="Close"><X size={14} /></button>
        </div>
        <pre ref={preRef} className="docker-logs-content">{logs || '(no logs)'}</pre>
      </div>
    </div>
  );
}

export function DockerCell({
  cell, cellIndex, outputs, notebookId,
  isRunning, anyRunning, kernelReady = true,
  onUpdate, onRun, onStopDocker, onPollDockerStatus, onFetchDockerLogs,
  onDelete, onMoveUp, onMoveDown,
  onNameChange, onColorChange,
}) {
  const presenting = cell.presenting || false;
  const containerId = cell.containerId || null;
  const containerState = cell.containerState || 'stopped';
  const [logsOpen, setLogsOpen] = useState(false);

  // Auto-poll status every 5s in presentation mode when running
  useEffect(() => {
    if (!presenting || !containerId || containerState !== 'running') return;
    const id = setInterval(() => {
      onPollDockerStatus?.(notebookId, cell.id, containerId);
    }, 5000);
    return () => clearInterval(id);
  }, [presenting, containerId, containerState, notebookId, cell.id, onPollDockerStatus]);

  const handleRun = useCallback(() => {
    onRun?.();
  }, [onRun]);

  const handleStop = useCallback(() => {
    if (containerId) onStopDocker?.(notebookId, cell.id, containerId);
  }, [containerId, notebookId, cell.id, onStopDocker]);

  const updateField = useCallback((field, value) => {
    onUpdate?.({ [field]: value });
  }, [onUpdate]);

  const handleOpenLogs = useCallback(() => {
    if (containerId) {
      onFetchDockerLogs?.(notebookId, cell.id, containerId);
      setLogsOpen(true);
    }
  }, [containerId, notebookId, cell.id, onFetchDockerLogs]);

  const handleRefreshLogs = useCallback(() => {
    if (containerId) onFetchDockerLogs?.(notebookId, cell.id, containerId);
  }, [containerId, notebookId, cell.id, onFetchDockerLogs]);

  const logsButton = containerId ? (
    <button className="docker-logs-btn" onClick={handleOpenLogs} title="Container logs">
      <ScrollText size={12} />
    </button>
  ) : null;

  // ── Presentation mode ────────────────────────────────────────────────────
  if (presenting) {
    return (
      <div className={`cell docker-cell docker-presenting${containerState === 'running' ? ' docker-running' : ''}`}>
        <div className="docker-present-header">
          <Container size={20} className="docker-present-icon" />
          <div className="docker-present-title">
            <span className="docker-present-name">{cell.containerName || cell.name || cell.image || 'Docker Container'}</span>
            <span className="docker-present-image">{cell.image}</span>
          </div>
          <StatusBadge state={containerState} />
          {logsButton}
          <button
            className="docker-present-exit"
            title="Exit presentation"
            onClick={() => updateField('presenting', false)}
          ><X size={14} /></button>
        </div>

        <div className="docker-present-details">
          {cell.image && (
            <div className="docker-detail-chip">
              <Container size={12} /> {cell.image}
            </div>
          )}
          {cell.ports && (
            <div className="docker-detail-chip">
              <Wifi size={12} /> {cell.ports}
            </div>
          )}
          {cell.containerPorts && containerState === 'running' && (
            <div className="docker-detail-chip docker-chip-live">
              <Wifi size={12} /> {cell.containerPorts}
            </div>
          )}
          {containerId && (
            <div className="docker-detail-chip">
              ID: {containerId}
            </div>
          )}
        </div>

        <div className="docker-present-controls">
          {containerState === 'running' ? (
            <button className="docker-btn docker-btn-stop" onClick={handleStop}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button
              className="docker-btn docker-btn-start"
              onClick={handleRun}
              disabled={!cell.image || !kernelReady}
            >
              <Play size={14} /> Start
            </button>
          )}
        </div>

        <CellOutput messages={outputs} notebookId={notebookId} />
        {logsOpen && (
          <LogsPopup
            logs={cell.containerLogs}
            onClose={() => setLogsOpen(false)}
            onRefresh={handleRefreshLogs}
          />
        )}
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  return (
    <div className={`cell docker-cell${isRunning ? ' running' : ''}${containerState === 'running' ? ' docker-running' : ''}`}>
      <span className="cell-index-badge">{cellIndex + 1}</span>
      <div className="code-cell-header">
        <CellNameColor
          name={cell.name}
          color={cell.color}
          onNameChange={onNameChange}
          onColorChange={onColorChange}
        />
        <span className="cell-lang-label docker-label">Docker</span>
        {containerId && <StatusBadge state={containerState} />}
        {logsButton}
        <span className="cell-id-label">{cell.id}</span>
        <div className="cell-run-group">
          {containerState === 'running' ? (
            <button className="cell-run-btn cell-stop-btn" onClick={handleStop} title="Stop container">
              <Square size={12} /> Stop
            </button>
          ) : isRunning ? (
            <button className="cell-run-btn" disabled><Clock size={12} /> Starting</button>
          ) : (
            <button
              className="cell-run-btn"
              onClick={handleRun}
              disabled={anyRunning || !kernelReady || !cell.image}
              title="Start container"
            >
              <Play size={12} /> Run
            </button>
          )}
          <button
            className={`cell-present-btn${presenting ? ' active' : ''}`}
            title="Presentation mode"
            onClick={() => updateField('presenting', !presenting)}
          ><Monitor size={12} /></button>
        </div>
        <CellControls
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
        />
      </div>

      <div className="docker-config-form">
        <ConfigField label="Image" value={cell.image} onChange={(v) => updateField('image', v)} placeholder="nginx:latest" mono />
        <ConfigField label="Name" value={cell.containerName} onChange={(v) => updateField('containerName', v)} placeholder="my-container" mono />
        <ConfigField label="Ports" value={cell.ports} onChange={(v) => updateField('ports', v)} placeholder="8080:80, 3000:3000" mono />
        <ConfigField label="Env" value={cell.env} onChange={(v) => updateField('env', v)} placeholder="KEY=val, FOO=bar" mono />
        <ConfigField label="Volume" value={cell.volume} onChange={(v) => updateField('volume', v)} placeholder="/host/path:/container/path" mono />
        <ConfigField label="Command" value={cell.command} onChange={(v) => updateField('command', v)} placeholder="optional override" mono />

        <div className="docker-lifecycle-row">
          <label className="docker-checkbox">
            <input type="checkbox" checked={!!cell.runOnStartup} onChange={(e) => updateField('runOnStartup', e.target.checked)} />
            <span>Run on startup</span>
          </label>
          <label className="docker-checkbox">
            <input type="checkbox" checked={!!cell.runOnShutdown} onChange={(e) => updateField('runOnShutdown', e.target.checked)} />
            <span>Run on shutdown</span>
          </label>
        </div>
      </div>

      <CellOutput messages={outputs} notebookId={notebookId} />
      {logsOpen && (
        <LogsPopup
          logs={cell.containerLogs}
          onClose={() => setLogsOpen(false)}
          onRefresh={handleRefreshLogs}
        />
      )}
    </div>
  );
}
