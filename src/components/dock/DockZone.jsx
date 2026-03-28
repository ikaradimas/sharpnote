import React, { useRef, useEffect, useState } from 'react';
import { useResize } from '../../hooks/useResize.js';
import { PANEL_META } from '../../config/dock-layout.jsx';
import { renderPanelContent } from './renderPanelContent.jsx';

export function DockZone({ zone, dockLayout, openFlags, panelProps,
                    onTabChange, onPanelClose, onStartDrag, onResizeEnd, flashingPanel }) {
  const resizeSide = zone === 'left' ? 'right' : zone === 'right' ? 'left' : 'top';
  const [size, onResizeMouseDown] = useResize(
    dockLayout.sizes[zone] ?? 300,
    resizeSide,
    (newSize) => onResizeEnd?.(zone, newSize)
  );

  const tabbarRef = useRef(null);
  const [scrollShadow, setScrollShadow] = useState({ left: false, right: false });

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

  // Auto-scroll the active tab into view when it changes
  useEffect(() => {
    if (!tabbarRef.current || !activeTab) return;
    const el = tabbarRef.current.querySelector(`[data-panelid="${activeTab}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  // Track left/right overflow so we can show scroll-shadow indicators
  useEffect(() => {
    const el = tabbarRef.current;
    if (!el) return;
    const update = () => setScrollShadow({
      left:  el.scrollLeft > 0,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, []);

  // Always render the same root element regardless of visible state.
  // This keeps hook state (useResize) stable and avoids reconciliation issues
  // when the first panel is added to a previously-empty zone.
  const zoneStyle = visible ? (zone === 'bottom' ? { height: size } : { width: size }) : undefined;

  const tabbarClass = [
    'dock-zone-tabbar',
    scrollShadow.left  && 'scroll-shadow-left',
    scrollShadow.right && 'scroll-shadow-right',
  ].filter(Boolean).join(' ');

  const scroll = (dir) => {
    const el = tabbarRef.current;
    if (el) el.scrollBy({ left: dir * 120, behavior: 'smooth' });
  };

  return (
    <div
      className={`dock-zone dock-zone-${zone}${visible ? '' : ' dock-zone-hidden'}`}
      style={zoneStyle}
    >
      <div className="dock-zone-rh" onMouseDown={onResizeMouseDown} />
      <div className="dock-zone-tabbar-wrap">
        {scrollShadow.left && (
          <button
            className="dock-zone-scroll-btn scroll-left"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => scroll(-1)}
            title="Scroll tabs left"
          >‹</button>
        )}
        <div ref={tabbarRef} className={tabbarClass}>
        {openPanels.map((id) => (
          <div
            key={id}
            data-panelid={id}
            className={`dock-zone-tab${id === activeTab ? ' active' : ''}${id === flashingPanel ? ' flashing' : ''}`}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              onStartDrag(id, e.clientX, e.clientY);
            }}
            onClick={() => onTabChange(zone, id)}
          >
            {PANEL_META[id].icon}
            <span>{PANEL_META[id].label}</span>
            {panelProps?.[id]?.onTabAction && (
              <span
                className="dock-zone-tab-action"
                onClick={(e) => { e.stopPropagation(); panelProps[id].onTabAction(); }}
                title={panelProps[id].onTabActionTitle ?? ''}
              >{panelProps[id].onTabActionIcon ?? '↗'}</span>
            )}
            <span
              className="dock-zone-tab-close"
              onClick={(e) => { e.stopPropagation(); onPanelClose(id); }}
            >×</span>
          </div>
        ))}
        </div>
        {scrollShadow.right && (
          <button
            className="dock-zone-scroll-btn scroll-right"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => scroll(1)}
            title="Scroll tabs right"
          >›</button>
        )}
      </div>
      {/* All assigned panels are kept mounted to preserve state; only the active one is shown */}
      {assigned.map((id) => (
        <div
          key={id}
          className={`dock-zone-content${id === flashingPanel ? ' panel-flash' : ''}`}
          style={{ display: visible && id === activeTab && openFlags[id] ? undefined : 'none' }}
        >
          {panelProps[id] && renderPanelContent(id, { ...panelProps[id], isOpen: !!openFlags[id] })}
        </div>
      ))}
    </div>
  );
}
