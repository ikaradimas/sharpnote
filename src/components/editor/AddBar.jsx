import React from 'react';

export function AddBar({ onAddMarkdown, onAddCode }) {
  return (
    <div className="cell-add-bar">
      <div className="cell-add-bar-inner">
        <button className="cell-add-btn" onClick={onAddMarkdown}>+ Markdown</button>
        <button className="cell-add-btn" onClick={onAddCode}>+ Code</button>
      </div>
    </div>
  );
}
