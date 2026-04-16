import React, { useState, useRef, useMemo } from 'react';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';

// selected: undefined/null = implicit (default notebook order)
//           []             = explicitly none (break the chain)
//           ['id1', ...]   = explicit cell links

export function CellLinkPicker({ label, selected, allCells, cellId, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false), open);

  const isImplicit = selected == null;
  const isNone = Array.isArray(selected) && selected.length === 0;
  const explicitIds = Array.isArray(selected) ? selected : [];

  const options = useMemo(() =>
    (allCells || [])
      .filter((c) => c.id !== cellId && c.type !== 'markdown')
      .map((c) => ({ id: c.id, label: c.name || c.label || c.content?.split('\n')[0]?.slice(0, 30) || c.id })),
    [allCells, cellId]
  );

  const toggle = (id) => {
    const ids = explicitIds.includes(id) ? explicitIds.filter((x) => x !== id) : [...explicitIds, id];
    onChange(ids.length > 0 ? ids : []);
  };

  const summary = isImplicit ? 'implicit' : isNone ? 'none' : `${explicitIds.length}`;

  return (
    <div className="cell-link-picker" ref={ref}>
      <button className="cell-link-btn" onClick={() => setOpen((v) => !v)} title={label}>
        <span className="cell-link-label">{label}</span>
        <span className={`cell-link-count${isImplicit ? ' cell-link-implicit' : isNone ? ' cell-link-none' : ''}`}>
          {summary}
        </span>
      </button>
      {open && (
        <div className="cell-link-dropdown">
          <label className="cell-link-option cell-link-mode-option">
            <input type="radio" name={`link-${cellId}-${label}`} checked={isImplicit} onChange={() => onChange(null)} />
            <span className="cell-link-option-label">Next in notebook order</span>
          </label>
          <label className="cell-link-option cell-link-mode-option">
            <input type="radio" name={`link-${cellId}-${label}`} checked={isNone} onChange={() => onChange([])} />
            <span className="cell-link-option-label">None (break chain)</span>
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
