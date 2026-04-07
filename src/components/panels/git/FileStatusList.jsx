import React from 'react';

const STATUS_LABELS = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', '?': 'Untracked' };
const STATUS_COLORS = { M: '#e5c07b', A: '#98c379', D: '#e06c75', R: '#c678dd', C: '#56b6c2', '?': '#808080' };

export function FileStatusList({ title, files, selectedFile, onSelect, actionLabel, onAction, onFileAction, discardable }) {
  if (files.length === 0) return null;
  return (
    <div className="git-file-section">
      <div className="git-file-section-header">
        <span className="git-file-section-title">{title} ({files.length})</span>
        {onAction && (
          <button className="git-file-section-btn" onClick={() => onAction(files.map(f => f.file))} title={actionLabel}>
            {actionLabel}
          </button>
        )}
      </div>
      {files.map((f) => (
        <div
          key={f.file}
          className={`git-file-row${selectedFile === f.file ? ' selected' : ''}`}
          onClick={() => onSelect(f.file)}
        >
          <span className="git-file-status" style={{ color: STATUS_COLORS[f.status] || '#888' }}>
            {f.status}
          </span>
          <span className="git-file-name" title={f.file}>{f.file}</span>
          <div className="git-file-actions">
            {onFileAction && (
              <button
                className="git-file-action-btn"
                onClick={(e) => { e.stopPropagation(); onFileAction([f.file]); }}
                title={actionLabel}
              >
                {actionLabel === '+ Stage' ? '+' : '−'}
              </button>
            )}
            {discardable && (
              <button
                className="git-file-action-btn git-file-discard"
                onClick={(e) => { e.stopPropagation(); if (confirm(`Discard changes to ${f.file}?`)) onSelect(f.file, 'discard'); }}
                title="Discard changes"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
