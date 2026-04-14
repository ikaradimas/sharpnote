import React, { useState, useRef, useMemo } from 'react';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';

export function CellLinkPicker({ label, selected = [], allCells, cellId, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false), open);

  const options = useMemo(() =>
    (allCells || [])
      .filter((c) => c.id !== cellId && c.type !== 'markdown')
      .map((c) => ({ id: c.id, label: c.name || c.label || c.content?.split('\n')[0]?.slice(0, 30) || c.id })),
    [allCells, cellId]
  );

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <div className="cell-link-picker" ref={ref}>
      <button className="cell-link-btn" onClick={() => setOpen((v) => !v)} title={label}>
        <span className="cell-link-label">{label}</span>
        <span className="cell-link-count">
          {selected.length === 0 ? 'none' : `${selected.length}`}
        </span>
      </button>
      {open && (
        <div className="cell-link-dropdown">
          {options.length === 0 && <span className="cell-link-empty">No cells available</span>}
          {options.map((opt) => (
            <label key={opt.id} className="cell-link-option">
              <input type="checkbox" checked={selected.includes(opt.id)} onChange={() => toggle(opt.id)} />
              <span className="cell-link-option-label">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
