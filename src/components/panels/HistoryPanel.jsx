import React, { useState, useEffect, useCallback } from 'react';
import { computeLineDiff } from '../../utils/text-diff.js';

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
  const [compareSet, setCompareSet] = useState(new Set());
  const [diffResult, setDiffResult] = useState(null);
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
    setCompareSet(new Set());
    setDiffResult(null);
  };

  const toggleCompare = (index) => {
    setCompareSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < 2) {
        next.add(index);
      } else {
        // Replace oldest selection
        const arr = [...next];
        next.delete(arr[0]);
        next.add(index);
      }
      return next;
    });
    setDiffResult(null);
  };

  const handleCompare = async () => {
    const indices = [...compareSet].sort((a, b) => a - b);
    if (indices.length !== 2) return;
    const [dataA, dataB] = await Promise.all(
      indices.map((idx) => window.electronAPI.restoreNotebookSnapshot(notebookPath, idx))
    );
    if (!dataA || !dataB) return;

    const cellsA = dataA.cells || [];
    const cellsB = dataB.cells || [];
    const maxLen = Math.max(cellsA.length, cellsB.length);
    const diffs = [];
    for (let i = 0; i < maxLen; i++) {
      const a = cellsA[i];
      const b = cellsB[i];
      const contentA = a?.content || '';
      const contentB = b?.content || '';
      if (contentA === contentB && a?.type === b?.type) continue;
      const label = b ? `Cell ${i + 1} (${b.type || 'unknown'})` : a ? `Cell ${i + 1} (removed)` : `Cell ${i + 1}`;
      const lines = computeLineDiff(contentA, contentB);
      diffs.push({ label, lines });
    }
    setDiffResult(diffs);
  };

  const selectedSnapshot = selected !== null ? snapshots.find((s) => s.index === selected) : null;
  const compareIndices = [...compareSet];

  return (
    <div className="history-panel">
      <div className="history-panel-header">
        <span className="history-panel-title">History</span>
        <span className="history-panel-count">{snapshots.length}</span>
        {compareSet.size === 2 && (
          <button className="history-compare-btn" onClick={handleCompare}>Compare</button>
        )}
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
                className={`history-item${selected === snap.index ? ' history-item-selected' : ''}${compareSet.has(snap.index) ? ' history-item-selected' : ''}`}
                onClick={() => setSelected(selected === snap.index ? null : snap.index)}
                title={formatTimestamp(snap.timestamp)}
              >
                <input
                  type="checkbox"
                  checked={compareSet.has(snap.index)}
                  onChange={(e) => { e.stopPropagation(); toggleCompare(snap.index); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginRight: 4, accentColor: 'var(--accent-primary)' }}
                />
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
          {/* Diff comparison result */}
          {diffResult && (
            <div className="history-diff-section">
              {diffResult.length === 0 ? (
                <div className="history-panel-empty">No differences found between selected snapshots.</div>
              ) : diffResult.map((cell, ci) => (
                <div key={ci}>
                  <div className="history-diff-cell-header">{cell.label}</div>
                  {cell.lines.map((ln, li) => (
                    <div
                      key={li}
                      className={`history-diff-line${ln.type === 'add' ? ' history-diff-add' : ln.type === 'remove' ? ' history-diff-remove' : ''}`}
                    >
                      {ln.type === 'add' ? '+ ' : ln.type === 'remove' ? '- ' : '  '}{ln.line}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
