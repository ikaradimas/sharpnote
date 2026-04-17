import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Square, Monitor, Container, Clock, Wifi, X, ScrollText, Terminal } from 'lucide-react';
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

function HealthBadge({ status }) {
  if (!status || status === 'none') return null;
  const cls = status === 'healthy'   ? 'docker-health-healthy'
            : status === 'unhealthy' ? 'docker-health-unhealthy'
            : 'docker-health-starting';
  return <span className={`docker-health-badge ${cls}`}>{status}</span>;
}

function StatsRow({ stats }) {
  if (!stats) return null;
  const formatMem = (bytes) => {
    if (!bytes && bytes !== 0) return '—';
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };
  return (
    <div className="docker-stats-row">
      <span className="docker-stat-label">CPU:</span>
      <span className="docker-stat-value">{stats.cpuPercent != null ? `${stats.cpuPercent.toFixed(1)}%` : '—'}</span>
      <span className="docker-stat-label">Mem:</span>
      <span className="docker-stat-value">
        {formatMem(stats.memUsage)}{stats.memLimit ? ` / ${formatMem(stats.memLimit)}` : ''}
      </span>
    </div>
  );
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

function ExecSection({ notebookId, cellId, containerId }) {
  const [execOpen, setExecOpen] = useState(false);
  const [execOutput, setExecOutput] = useState([]);
  const [execInput, setExecInput] = useState('');
  const [execActive, setExecActive] = useState(false);
  const outputRef = useRef(null);

  // Listen for exec output messages
  useEffect(() => {
    if (!execActive || !window.electronAPI) return;
    const handler = (_ev, nbId, msg) => {
      if (nbId !== notebookId) return;
      if (msg.type === 'docker_exec_output' && msg.id === cellId) {
        setExecOutput((prev) => [...prev.slice(-500), msg.data || '']);
      }
      if (msg.type === 'docker_exec_ended' && msg.id === cellId) {
        setExecActive(false);
      }
    };
    window.electronAPI.onKernelMessage(handler);
    return () => window.electronAPI.offKernelMessage(handler);
  }, [execActive, notebookId, cellId]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [execOutput]);

  const handleAttach = () => {
    setExecOutput([]);
    setExecActive(true);
    setExecOpen(true);
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'docker_exec',
      id: cellId,
      containerId,
    });
  };

  const handleSend = () => {
    if (!execInput.trim()) return;
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'docker_exec_input',
      id: cellId,
      containerId,
      input: execInput + '\n',
    });
    setExecOutput((prev) => [...prev, `$ ${execInput}\n`]);
    setExecInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
  };

  if (!execOpen) {
    return (
      <div className="docker-exec-section">
        <button className="docker-logs-btn" onClick={handleAttach} title="Attach shell">
          <Terminal size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="docker-exec-section">
      <div className="docker-exec-header">
        <Terminal size={12} />
        <span>Exec{execActive ? '' : ' (disconnected)'}</span>
        <button className="docker-logs-close" onClick={() => { setExecOpen(false); setExecActive(false); }} title="Close">
          <X size={12} />
        </button>
      </div>
      {execOutput.length > 0 && (
        <pre ref={outputRef} className="docker-logs-content" style={{ maxHeight: 150, margin: '0 8px', borderRadius: 3 }}>
          {execOutput.join('')}
        </pre>
      )}
      <div className="docker-exec-input-row">
        <input
          className="docker-exec-input"
          value={execInput}
          onChange={(e) => setExecInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={execActive ? 'Type command...' : 'Disconnected'}
          disabled={!execActive}
          spellCheck={false}
        />
        <button className="docker-exec-send" onClick={handleSend} disabled={!execActive}>Send</button>
      </div>
    </div>
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
