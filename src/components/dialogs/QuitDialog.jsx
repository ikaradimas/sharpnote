import React, { useState } from 'react';

export function QuitDialog({ dirtyNbs, onSaveSelected, onDiscardAll, onCancel }) {
  const [selected, setSelected] = useState(() => new Set(dirtyNbs.map((n) => n.id)));

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allChecked = selected.size === dirtyNbs.length;
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(dirtyNbs.map((n) => n.id)));

  return (
    <div className="quit-overlay">
      <div className="quit-dialog">
        <div className="quit-dialog-header">Unsaved Changes</div>
        <div className="quit-dialog-body">
          <p className="quit-dialog-desc">
            The following notebooks have unsaved changes. Select which ones to save before exiting.
          </p>
          <div className="quit-dialog-list">
            <label className="quit-dialog-item quit-dialog-item-all">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              <span>All notebooks</span>
            </label>
            <div className="quit-dialog-divider" />
            {dirtyNbs.map((nb) => (
              <label key={nb.id} className="quit-dialog-item">
                <input type="checkbox" checked={selected.has(nb.id)} onChange={() => toggle(nb.id)} />
                <span className="quit-dialog-nb-name">{nb.title || nb.path || 'Untitled'}</span>
                {nb.path && <span className="quit-dialog-nb-path">{nb.path}</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="quit-dialog-actions">
          <button className="quit-btn quit-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="quit-btn quit-btn-discard" onClick={onDiscardAll}>Discard All &amp; Exit</button>
          <button className="quit-btn quit-btn-save" onClick={() => onSaveSelected([...selected])} disabled={selected.size === 0}>
            Save Selected &amp; Exit
          </button>
        </div>
      </div>
    </div>
  );
}
