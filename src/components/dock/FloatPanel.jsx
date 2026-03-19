import React, { useEffect, useRef } from 'react';
import { PANEL_META } from '../../config/dock-layout.jsx';

export function FloatPanel({ panelId, pos, onMove, onClose, onStartDrag, children }) {
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);

  const handleHeaderDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const ox = e.clientX - posRef.current.x;
    const oy = e.clientY - posRef.current.y;
    const mv = (ev) => onMove(panelId, { ...posRef.current, x: ev.clientX - ox, y: ev.clientY - oy });
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  };

  const handleResizeDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, sw = posRef.current.w, sh = posRef.current.h;
    const mv = (ev) => onMove(panelId, {
      ...posRef.current,
      w: Math.max(260, sw + ev.clientX - sx),
      h: Math.max(150, sh + ev.clientY - sy),
    });
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  };

  return (
    <div className="float-panel" style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}>
      <div className="float-panel-header" onMouseDown={handleHeaderDown}>
        <div
          className="float-panel-drag-handle"
          title="Drag to dock"
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onStartDrag?.(panelId, e.clientX, e.clientY);
          }}
        >⠿</div>
        {PANEL_META[panelId]?.icon}
        <span>{PANEL_META[panelId]?.label ?? panelId}</span>
        <button
          className="dock-zone-tab-close"
          style={{ marginLeft: 'auto' }}
          onClick={() => onClose(panelId)}
        >×</button>
      </div>
      <div className="float-panel-body">{children}</div>
      <div className="float-panel-resize" onMouseDown={handleResizeDown} />
    </div>
  );
}
