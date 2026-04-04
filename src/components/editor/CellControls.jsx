import React, { useState, useEffect } from 'react';

export function CellControls({ onMoveUp, onMoveDown, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (confirming) {
    return (
      <>
        <span className="delete-confirm-label">Delete?</span>
        <button className="cell-ctrl-btn cell-ctrl-danger" title="Confirm delete" onClick={onDelete}>✓</button>
        <button className="cell-ctrl-btn" title="Cancel" onClick={() => setConfirming(false)}>✕</button>
      </>
    );
  }

  return (
    <>
      <button className="cell-ctrl-btn" title="Move Up" onClick={onMoveUp}>↑</button>
      <button className="cell-ctrl-btn" title="Move Down" onClick={onMoveDown}>↓</button>
      <button className="cell-ctrl-btn" title="Delete" onClick={() => setConfirming(true)}>✕</button>
    </>
  );
}
