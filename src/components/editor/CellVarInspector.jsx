import React, { useMemo, useRef, useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { cellProducedVarNames } from '../../utils/dependency-graph.js';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';

/**
 * Header button that lists the variables this cell declares (intersected with
 * the live kernel snapshot) and lets the user open a draggable inspector popup
 * for any of them. "Variables of the cell" uses the same producer detection as
 * the dependency graph (cellProducedVarNames), so it never diverges from it.
 */
export function CellVarInspector({ content, vars, onInspect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false), open);

  const cellVars = useMemo(() => {
    const byName = new Map((vars || []).map((v) => [v.name, v]));
    return cellProducedVarNames(content, [...byName.keys()])
      .map((name) => byName.get(name))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [content, vars]);

  const count = cellVars.length;

  return (
    <div className="cell-var-inspector" ref={ref}>
      <button
        className="cell-var-inspector-btn"
        disabled={count === 0}
        title={count === 0 ? 'No variables in scope (run the cell)' : `Inspect variables (${count})`}
        onClick={() => setOpen((v) => !v)}
      >
        <ScanSearch size={14} />
      </button>
      {open && count > 0 && (
        <div className="cell-var-inspector-menu">
          {cellVars.map((v) => (
            <button
              key={v.name}
              className="cell-var-inspector-item"
              onClick={() => { onInspect(v.name, v.typeName); setOpen(false); }}
              title={`Inspect ${v.name}`}
            >
              <span className="cell-var-inspector-item-name">{v.name}</span>
              <span className="cell-var-inspector-item-type">{v.typeName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
