import React, { useState, useEffect, useCallback } from 'react';

function formatTimestamp(iso) {
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch { return iso; }
}

function timeAgo(iso) {
  try {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch { return ''; }
}

export function HistoryPanel({ notebookPath, onRestore }) {
  const [snapshots, setSnapshots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!notebookPath || !window.electronAPI?.getNotebookHistory) return;
    setLoading(true);
    try {
      const list = await window.electronAPI.getNotebookHistory(notebookPath);
      setSnapshots(list);
    } finally {
      setLoading(false);
    }
  }, [notebookPath]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRestore = async (index) => {
    if (!window.confirm('Restore this snapshot? Current unsaved changes will be lost.')) return;
    const data = await window.electronAPI.restoreNotebookSnapshot(notebookPath, index);
    if (data) onRestore(data);
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Delete all history snapshots for this notebook?')) return;
    await window.electronAPI?.deleteNotebookHistory(notebookPath);
    setSnapshots([]);
    setSelected(null);
  };

  const selectedSnapshot = selected !== null ? snapshots.find((s) => s.index === selected) : null;

  return (
    <div className="history-panel">
      <div className="history-panel-header">
        <span className="history-panel-title">History</span>
        <span className="history-panel-count">{snapshots.length}</span>
        {snapshots.length > 0 && (
          <button
            className="history-clear-btn"
            onClick={handleClearHistory}
            title="Clear all history"
          >
            Clear
          </button>
        )}
      </div>
      {!notebookPath ? (
        <div className="history-panel-empty">Save the notebook to enable version history.</div>
      ) : loading ? (
        <div className="history-panel-empty">Loading...</div>
      ) : snapshots.length === 0 ? (
        <div className="history-panel-empty">No snapshots yet. Snapshots are created each time you save.</div>
      ) : (
        <div className="history-panel-body">
          <div className="history-list">
            {[...snapshots].reverse().map((snap) => (
              <button
                key={snap.index}
                className={`history-item${selected === snap.index ? ' history-item-selected' : ''}`}
                onClick={() => setSelected(selected === snap.index ? null : snap.index)}
                title={formatTimestamp(snap.timestamp)}
              >
                <span className="history-item-time">{timeAgo(snap.timestamp)}</span>
                <span className="history-item-detail">
                  {snap.cellCount} cell{snap.cellCount !== 1 ? 's' : ''}
                </span>
              </button>
            ))}
          </div>
          {selectedSnapshot && (
            <div className="history-preview">
              <div className="history-preview-header">
                <span className="history-preview-time">{formatTimestamp(selectedSnapshot.timestamp)}</span>
                <button
                  className="history-restore-btn"
                  onClick={() => handleRestore(selectedSnapshot.index)}
                >
                  Restore
                </button>
              </div>
              <div className="history-preview-summary">
                {selectedSnapshot.cellCount} cell{selectedSnapshot.cellCount !== 1 ? 's' : ''}
                {selectedSnapshot.configCount > 0 && `, ${selectedSnapshot.configCount} config`}
              </div>
              {selectedSnapshot.cellSummary && selectedSnapshot.cellSummary.length > 0 && (
                <div className="history-preview-cells">
                  {selectedSnapshot.cellSummary.map((c, i) => (
                    <div key={i} className="history-preview-cell">
                      <span className={`history-cell-type history-cell-type-${c.type}`}>
                        {c.type}
                      </span>
                      <span className="history-cell-preview">
                        {c.preview || '(empty)'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
