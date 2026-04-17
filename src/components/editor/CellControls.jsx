import React, { useState, useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown, Trash2, Check, X, Copy, Columns2, Bookmark, BookmarkCheck } from 'lucide-react';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';

const COLUMN_OPTIONS = [
  { value: 0, label: 'Full width', icon: [1] },
  { value: 2, label: '2 columns',  icon: [1, 1] },
  { value: 3, label: '3 columns',  icon: [1, 1, 1] },
  { value: 4, label: '4 columns',  icon: [1, 1, 1, 1] },
];

function ColumnPicker({ columns, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false), open);

  return (
    <div className="col-picker-wrap" ref={ref}>
      <button
        className={`cell-ctrl-btn${columns > 0 ? ' col-picker-active' : ''}`}
        title={columns > 0 ? `${columns}-column layout` : 'Column layout'}
        onClick={() => setOpen((v) => !v)}
      >
        <Columns2 size={12} />
      </button>
      {open && (
        <div className="col-picker-popup">
          {COLUMN_OPTIONS.map(({ value, label, icon }) => (
            <button
              key={value}
              className={`col-picker-option${columns === value ? ' col-picker-selected' : ''}`}
              onClick={() => { onChange(value); setOpen(false); }}
              title={label}
            >
              <div className="col-picker-grid">
                {icon.map((_, i) => (
                  <div key={i} className="col-picker-block" />
                ))}
              </div>
              <span className="col-picker-label">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CellControls({ onMoveUp, onMoveDown, onCopy, onDelete, columns = 0, onColumnsChange, bookmarked, onToggleBookmark }) {
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
      {onColumnsChange && <ColumnPicker columns={columns} onChange={onColumnsChange} />}
      {onToggleBookmark && (
        <button className={`cell-ctrl-btn${bookmarked ? ' cell-ctrl-bookmark-active' : ''}`} title={bookmarked ? 'Remove bookmark' : 'Bookmark cell'} onClick={onToggleBookmark}>
          {bookmarked ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
        </button>
      )}
      {onCopy && <button className="cell-ctrl-btn" title="Copy cell" onClick={onCopy}><Copy size={12} /></button>}
      <button className="cell-ctrl-btn" title="Move Up" onClick={onMoveUp}><ArrowUp size={12} /></button>
      <button className="cell-ctrl-btn" title="Move Down" onClick={onMoveDown}><ArrowDown size={12} /></button>
      <button className="cell-ctrl-btn" title="Delete" onClick={() => setConfirming(true)}><Trash2 size={12} /></button>
    </>
  );
}
