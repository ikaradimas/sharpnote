import React, { useState, useRef, useEffect } from 'react';
import { CELL_COLORS } from '../../notebook-factory.js';

export function CellNameColor({ name, color, onNameChange, onColorChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const startEdit = () => { setDraft(name || ''); setEditing(true); };
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed !== (name || '')) onNameChange(trimmed || undefined);
    setEditing(false);
  };

  const colorValue = CELL_COLORS.find((c) => c.id === color)?.value;

  return (
    <span className="cell-name-color">
      <span className="cell-color-dot-wrap" ref={pickerRef}>
        <button
          className="cell-color-dot"
          style={colorValue ? { background: colorValue } : undefined}
          onClick={() => setPickerOpen((v) => !v)}
          title="Set cell color"
        />
        {pickerOpen && (
          <div className="cell-color-picker">
            {CELL_COLORS.map((c) => (
              <button
                key={c.id}
                className={`cell-color-swatch${color === c.id ? ' active' : ''}`}
                style={{ background: c.value }}
                onClick={() => { onColorChange(c.id); setPickerOpen(false); }}
                title={c.id}
              />
            ))}
            {color && (
              <button
                className="cell-color-clear"
                onClick={() => { onColorChange(null); setPickerOpen(false); }}
                title="Clear color"
              >✕</button>
            )}
          </div>
        )}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          className="cell-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
          onBlur={commit}
          placeholder="Cell name"
          spellCheck={false}
        />
      ) : (
        <span
          className={`cell-name-label${name ? '' : ' cell-name-empty'}`}
          onClick={startEdit}
          title="Click to name this cell"
        >
          {name || 'unnamed'}
        </span>
      )}
    </span>
  );
}
