import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { FormatContent } from '../output/FormatContent.jsx';

/**
 * A draggable, persistent popup that inspects one variable and renders its
 * value using the same inference as the .Display() family (the kernel runs
 * AutoDisplay and returns a { format, content } payload, rendered here by
 * FormatContent). Multiple popups can be open at once; each re-requests its
 * payload whenever the variable's value signature changes, so it stays live.
 */
export function VarInspectorPopup({
  notebookId, varName, typeName,
  valueSig, payload, isNull, error, loading,
  initialPos,
  onRequest, onClose,
}) {
  const [pos, setPos] = useState(initialPos || { x: 120, y: 120 });
  const dragRef = useRef(null);

  // Re-request the display payload on mount and whenever the value changes.
  // valueSig === null means the variable is no longer in scope — skip.
  useEffect(() => {
    if (valueSig !== null) onRequest(notebookId, varName);
  }, [notebookId, varName, valueSig, onRequest]);

  const handleHeaderDown = (e) => {
    // Ignore drags that start on the close button.
    if (e.target.closest('.var-inspector-close')) return;
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

  let body;
  if (valueSig === null) {
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
    <div className="var-inspector-popup" ref={dragRef} style={{ left: pos.x, top: pos.y }}>
      <div className="var-inspector-header" onMouseDown={handleHeaderDown}>
        <span className="var-inspector-name">{varName}</span>
        {typeName && <span className="var-inspector-type">{typeName}</span>}
        <button className="var-inspector-close" onClick={onClose} title="Close">
          <X size={12} />
        </button>
      </div>
      <div className="var-inspector-body">{body}</div>
    </div>
  );
}
