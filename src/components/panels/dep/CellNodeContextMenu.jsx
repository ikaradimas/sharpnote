import React, { useEffect, useRef } from 'react';

export function CellNodeContextMenu({ x, y, node, pipelines, onClose, actions }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="dep-context-menu" style={{ left: x, top: y }}>
      <button className="dep-context-item" onClick={() => { actions.onRun(); onClose(); }}>
        ▶ Run
      </button>
      <button className="dep-context-item" onClick={() => { actions.onRunWithDeps(); onClose(); }}>
        ▶▶ Run with dependencies
      </button>
      <button className="dep-context-item" onClick={() => { actions.onRunDownstream(); onClose(); }}>
        ▶▼ Run downstream
      </button>
      <div className="dep-context-sep" />
      <button className="dep-context-item" onClick={() => { actions.onNavigate(); onClose(); }}>
        ↗ Navigate to cell
      </button>
      <div className="dep-context-sep" />
      {(pipelines || []).length > 0 && (
        <>
          {pipelines.map((p) => (
            <button
              key={p.id}
              className="dep-context-item"
              onClick={() => { actions.onAddToPipeline(p.id); onClose(); }}
            >
              + Add to "{p.name}"
            </button>
          ))}
          <div className="dep-context-sep" />
        </>
      )}
      <button className="dep-context-item" onClick={() => { actions.onNewPipelineWith(); onClose(); }}>
        ★ New pipeline with this cell
      </button>
    </div>
  );
}
