import React, { useState, useRef, useMemo } from 'react';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';

// selected: undefined/null or []  = none (no dependency — the default)
//           ['id1', ...]           = explicit cell links
// (There is no implicit "notebook order" mode: a cell only depends on what
//  produces the variables it uses, plus any explicit links wired here.)

export function CellLinkPicker({ label, selected, allCells, cellId, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false), open);

  const explicitIds = Array.isArray(selected) ? selected : [];
  const isNone = explicitIds.length === 0;

  const options = useMemo(() =>
    (allCells || [])
      .filter((c) => c.id !== cellId && c.type !== 'markdown')
      .map((c) => ({ id: c.id, label: c.name || c.label || c.content?.split('\n')[0]?.slice(0, 30) || c.id })),
    [allCells, cellId]
  );

  const toggle = (id) => {
    const ids = explicitIds.includes(id) ? explicitIds.filter((x) => x !== id) : [...explicitIds, id];
    onChange(ids.length > 0 ? ids : null);
  };

  const summary = isNone ? 'none' : `${explicitIds.length}`;

  return (
    <div className="cell-link-picker" ref={ref}>
      <button className="cell-link-btn" onClick={() => setOpen((v) => !v)} title={label}>
        <span className="cell-link-label">{label}</span>
        <span className={`cell-link-count${isNone ? ' cell-link-none' : ''}`}>
          {summary}
        </span>
      </button>
      {open && (
        <div className="cell-link-dropdown">
          <label className="cell-link-option cell-link-mode-option">
            <input type="radio" name={`link-${cellId}-${label}`} checked={isNone} onChange={() => onChange(null)} />
            <span className="cell-link-option-label">None (default)</span>
          </label>
          <div className="cell-link-sep" />
          {options.map((opt) => (
            <label key={opt.id} className="cell-link-option">
              <input type="checkbox" checked={explicitIds.includes(opt.id)}
                onChange={() => toggle(opt.id)} />
              <span className="cell-link-option-label">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
