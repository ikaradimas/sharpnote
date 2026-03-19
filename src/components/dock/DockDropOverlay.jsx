import React from 'react';
import { DOCK_DROP_ZONES } from '../../config/dock-layout.jsx';

// Pure visual overlay — no drag events. Zone hover state is driven by
// document-level mousemove in App computing cursor position against edge thresholds.
export function DockDropOverlay({ sourceZone, active, hovered }) {
  return (
    <div className={`dock-drop-overlay${active ? ' dock-drop-overlay-active' : ''}`}>
      {DOCK_DROP_ZONES.map(({ key, label }) => {
        const isSame = active && key === sourceZone;
        return (
          <div
            key={key}
            className={`dock-drop-zone dock-drop-${key}${hovered === key ? ' drag-over' : ''}${isSame ? ' same-zone' : ''}`}
          >
            <span className="dock-drop-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
