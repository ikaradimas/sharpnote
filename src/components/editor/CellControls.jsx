import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Trash2, Check, X, Copy } from 'lucide-react';

export function CellControls({ onMoveUp, onMoveDown, onCopy, onDelete }) {
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
        <button className="cell-ctrl-btn cell-ctrl-danger" title="Confirm delete" onClick={onDelete}><Check size={12} /></button>
        <button className="cell-ctrl-btn" title="Cancel" onClick={() => setConfirming(false)}><X size={12} /></button>
      </>
    );
  }

  return (
    <>
      {onCopy && <button className="cell-ctrl-btn" title="Copy cell" onClick={onCopy}><Copy size={12} /></button>}
      <button className="cell-ctrl-btn" title="Move Up" onClick={onMoveUp}><ArrowUp size={12} /></button>
      <button className="cell-ctrl-btn" title="Move Down" onClick={onMoveDown}><ArrowDown size={12} /></button>
      <button className="cell-ctrl-btn" title="Delete" onClick={() => setConfirming(true)}><Trash2 size={12} /></button>
    </>
  );
}
