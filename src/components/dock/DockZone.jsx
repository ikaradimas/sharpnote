import React from 'react';
import { useResize } from '../../hooks/useResize.js';
import { PANEL_META } from '../../config/dock-layout.jsx';
import { renderPanelContent } from './renderPanelContent.jsx';

export function DockZone({ zone, dockLayout, openFlags, panelProps,
                    onTabChange, onPanelClose, onStartDrag, onResizeEnd }) {
  const resizeSide = zone === 'left' ? 'right' : zone === 'right' ? 'left' : 'top';
  const [size, onResizeMouseDown] = useResize(
    dockLayout.sizes[zone] ?? 300,
    resizeSide,
    (newSize) => onResizeEnd?.(zone, newSize)
  );

  // Panels assigned to this zone, sorted by their order value
  const assigned = Object.keys(dockLayout.assignments)
    .filter((id) => dockLayout.assignments[id] === zone)
    .sort((a, b) => (dockLayout.order[a] ?? 0) - (dockLayout.order[b] ?? 0));

  // Only panels that are currently open (have their open flag set)
  const openPanels = assigned.filter((id) => openFlags[id]);

  // Active tab: prefer saved zoneTab, fall back to first open panel
  let activeTab = dockLayout.zoneTab[zone];
  if (!openPanels.includes(activeTab)) activeTab = openPanels[0] ?? null;

  const visible = openPanels.length > 0;

  // Always render the same root element regardless of visible state.
  // This keeps hook state (useResize) stable and avoids reconciliation issues
  // when the first panel is added to a previously-empty zone.
  const zoneStyle = visible ? (zone === 'bottom' ? { height: size } : { width: size }) : undefined;

  return (
    <div
      className={`dock-zone dock-zone-${zone}${visible ? '' : ' dock-zone-hidden'}`}
      style={zoneStyle}
    >
      <div className="dock-zone-rh" onMouseDown={onResizeMouseDown} />
      <div className="dock-zone-tabbar">
        {openPanels.map((id) => (
          <div
            key={id}
            className={`dock-zone-tab${id === activeTab ? ' active' : ''}`}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              onStartDrag(id, e.clientX, e.clientY);
            }}
            onClick={() => onTabChange(zone, id)}
          >
            {PANEL_META[id].icon}
            <span>{PANEL_META[id].label}</span>
            <span
              className="dock-zone-tab-close"
              onClick={(e) => { e.stopPropagation(); onPanelClose(id); }}
            >×</span>
          </div>
        ))}
      </div>
      {/* All assigned panels are kept mounted to preserve state; only the active one is shown */}
      {assigned.map((id) => (
        <div
          key={id}
          className="dock-zone-content"
          style={{ display: visible && id === activeTab && openFlags[id] ? undefined : 'none' }}
        >
          {panelProps[id] && renderPanelContent(id, { ...panelProps[id], isOpen: !!openFlags[id] })}
        </div>
      ))}
    </div>
  );
}
