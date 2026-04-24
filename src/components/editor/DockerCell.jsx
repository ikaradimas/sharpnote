import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Square, Monitor, Container, Clock, Wifi, X, ScrollText, Terminal } from 'lucide-react';
import { CellNameColor } from './CellNameColor.jsx';
import { CellControls } from './CellControls.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';
import { StatusBadge, HealthBadge, StatsRow, LogsPopup, ExecSection } from './DockerShared.jsx';

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

export function DockerCell({
  cell, cellIndex, outputs, notebookId,
  isRunning, anyRunning, kernelReady = true,
  onUpdate, onRun, onStopDocker, onPollDockerStatus, onFetchDockerLogs,
  onDelete, onCopy, onMoveUp, onMoveDown,
  onToggleBookmark,
  onNameChange, onColorChange,
}) {
  const presenting = cell.presenting || false;
  const containerId = cell.containerId || null;
  const containerState = cell.containerState || 'stopped';
  const [logsOpen, setLogsOpen] = useState(false);
  const [stats, setStats] = useState(null);

  // Auto-poll status every 5s in presentation mode when running
  useEffect(() => {
    if (!presenting || !containerId || containerState !== 'running') return;
    const id = setInterval(() => {
      onPollDockerStatus?.(notebookId, cell.id, containerId);
    }, 5000);
    return () => clearInterval(id);
  }, [presenting, containerId, containerState, notebookId, cell.id, onPollDockerStatus]);

  // Poll docker stats every 5s when container is running
  useEffect(() => {
    if (!containerId || containerState !== 'running' || !window.electronAPI) return;

    const handler = (_ev, nbId, msg) => {
      if (nbId !== notebookId || msg.type !== 'docker_stats' || msg.id !== cell.id) return;
      setStats({ cpuPercent: msg.cpuPercent, memUsage: msg.memUsage, memLimit: msg.memLimit });
    };
    window.electronAPI.onKernelMessage(handler);

    // Initial fetch + interval
    const poll = () => {
      window.electronAPI.sendToKernel(notebookId, {
        type: 'docker_stats', id: cell.id, containerId,
      });
    };
    poll();
    const id = setInterval(poll, 5000);

    return () => {
      clearInterval(id);
      window.electronAPI.offKernelMessage(handler);
      setStats(null);
    };
  }, [containerId, containerState, notebookId, cell.id]);

  const handleStop = () => {
    if (containerId) onStopDocker?.(notebookId, cell.id, containerId);
  };

  const updateField = (field, value) => onUpdate?.({ [field]: value });

  const handleOpenLogs = () => {
    if (containerId) {
      onFetchDockerLogs?.(notebookId, cell.id, containerId);
      setLogsOpen(true);
    }
  };

  const handleRefreshLogs = () => {
    if (containerId) onFetchDockerLogs?.(notebookId, cell.id, containerId);
  };

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
          <HealthBadge status={cell.healthStatus} />
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

        <StatsRow stats={stats} />

        <div className="docker-present-controls">
          {containerState === 'running' ? (
            <button className="docker-btn docker-btn-stop" onClick={handleStop}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button
              className="docker-btn docker-btn-start"
              onClick={onRun}
              disabled={!cell.image || !kernelReady}
            >
              <Play size={14} /> Start
            </button>
          )}
        </div>

        {containerState === 'running' && containerId && (
          <ExecSection notebookId={notebookId} cellId={cell.id} containerId={containerId} />
        )}

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
        {containerId && <HealthBadge status={cell.healthStatus} />}
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
              onClick={onRun}
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
          onCopy={onCopy}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
          bookmarked={cell.bookmarked}
          onToggleBookmark={onToggleBookmark}
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

      <StatsRow stats={stats} />

      {containerState === 'running' && containerId && (
        <ExecSection notebookId={notebookId} cellId={cell.id} containerId={containerId} />
      )}

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
