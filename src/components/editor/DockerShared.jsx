import React, { useEffect, useState, useRef } from 'react';
import { ScrollText, Terminal, X } from 'lucide-react';

export function StatusBadge({ state }) {
  const cls = state === 'running' ? 'docker-badge-running'
            : state === 'error'   ? 'docker-badge-error'
            : 'docker-badge-stopped';
  const label = state === 'running' ? 'Running'
              : state === 'error'   ? 'Error'
              : 'Stopped';
  return <span className={`docker-status-badge ${cls}`}>{label}</span>;
}

export function HealthBadge({ status }) {
  if (!status || status === 'none') return null;
  const cls = status === 'healthy'   ? 'docker-health-healthy'
            : status === 'unhealthy' ? 'docker-health-unhealthy'
            : 'docker-health-starting';
  return <span className={`docker-health-badge ${cls}`}>{status}</span>;
}

export function StatsRow({ stats }) {
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

export function LogsPopup({ logs, onClose, onRefresh }) {
  const preRef = useRef(null);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [logs]);

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

export function ExecSection({ notebookId, cellId, containerId }) {
  const [execOpen, setExecOpen] = useState(false);
  const [execOutput, setExecOutput] = useState([]);
  const [execInput, setExecInput] = useState('');
  const [execActive, setExecActive] = useState(false);
  const outputRef = useRef(null);

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
