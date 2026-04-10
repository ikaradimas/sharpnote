import React, { useEffect, useRef } from 'react';
import { PANEL_META } from '../../config/dock-layout.jsx';

function clampToViewport(pos) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = pos.w || 320;
  const h = pos.h || 300;
  // Ensure at least 40px of the panel header is visible on screen
  const x = Math.max(0, Math.min(pos.x, vw - Math.min(w, 40)));
  const y = Math.max(0, Math.min(pos.y, vh - 40));
  return { ...pos, x, y };
}

export function FloatPanel({ panelId, pos, onMove, onClose, onStartDrag, flashing, children }) {
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);

  // Clamp to viewport on mount and when window resizes
  useEffect(() => {
    const clamped = clampToViewport(pos);
    if (clamped.x !== pos.x || clamped.y !== pos.y) onMove(panelId, clamped);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onResize = () => {
      const clamped = clampToViewport(posRef.current);
      if (clamped.x !== posRef.current.x || clamped.y !== posRef.current.y) onMove(panelId, clamped);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [panelId, onMove]);

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
    <div className={`float-panel${flashing ? ' flashing' : ''}`} style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}>
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
