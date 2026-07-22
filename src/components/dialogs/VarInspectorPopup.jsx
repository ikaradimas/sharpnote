import React, { useEffect, useRef, useState } from 'react';
import { X, Eraser } from 'lucide-react';
import { FormatContent } from '../output/FormatContent.jsx';

/**
 * A draggable, persistent popup that inspects one variable and renders its
 * value using the same inference as the .Display() family (the kernel runs
 * AutoDisplay and returns a { format, content } payload, rendered here by
 * FormatContent). Multiple popups can be open at once; each re-requests its
 * payload after every execution in its notebook (varsVersion), so it stays
 * live for any mutation — including large collections whose truncated value
 * string wouldn't reveal a change.
 */
export function VarInspectorPopup({
  notebookId, varName, typeName,
  inScope, varsVersion, payload, isNull, error, loading,
  initialPos,
  onRequest, onRelease, onClose,
}) {
  const [pos, setPos] = useState(initialPos || { x: 120, y: 120 });
  const [size, setSize] = useState({ w: 420, h: 300 });
  const dragRef = useRef(null);

  // Re-request the display payload on mount and after every execution in this
  // notebook (varsVersion changes on each vars_update). Skipped when the
  // variable is no longer in scope.
  useEffect(() => {
    if (inScope) onRequest(notebookId, varName);
  }, [notebookId, varName, varsVersion, inScope, onRequest]);

  const handleHeaderDown = (e) => {
    // Ignore drags that start on a header button (close / free).
    if (e.target.closest('.var-inspector-close, .var-inspector-free')) return;
    e.preventDefault();
    const ox = e.clientX - pos.x;
    const oy = e.clientY - pos.y;
    const move = (ev) => {
      const x = Math.max(0, Math.min(ev.clientX - ox, window.innerWidth - 60));
      const y = Math.max(0, Math.min(ev.clientY - oy, window.innerHeight - 30));
      setPos({ x, y });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const handleResizeDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, sw = size.w, sh = size.h;
    const move = (ev) => setSize({
      w: Math.max(240, sw + ev.clientX - sx),
      h: Math.max(140, sh + ev.clientY - sy),
    });
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  let body;
  if (!inScope) {
    body = <div className="var-inspector-empty">Variable not in scope — run the cell.</div>;
  } else if (error) {
    body = <div className="var-inspector-error">{error}</div>;
  } else if (loading && payload == null && !isNull) {
    body = <div className="var-inspector-empty">Loading…</div>;
  } else if (isNull || payload == null) {
    body = <div className="var-inspector-empty"><span className="var-null">null</span></div>;
  } else {
    body = <FormatContent format={payload.format} content={payload.content} />;
  }

  return (
    <div className="var-inspector-popup" ref={dragRef} style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}>
      <div className="var-inspector-header" onMouseDown={handleHeaderDown}>
        <span className="var-inspector-name">{varName}</span>
        {typeName && <span className="var-inspector-type">{typeName}</span>}
        {onRelease && inScope && !isNull && (
          <button
            className="var-inspector-free"
            onClick={onRelease}
            title="Free this variable — sets it to null on the kernel to release its memory (you can re-run the cell to recompute it)"
          >
            <Eraser size={12} />
          </button>
        )}
        <button className="var-inspector-close" onClick={onClose} title="Close">
          <X size={12} />
        </button>
      </div>
      <div className="var-inspector-body">{body}</div>
      <div className="var-inspector-resize" onMouseDown={handleResizeDown} title="Drag to resize" />
    </div>
  );
}
