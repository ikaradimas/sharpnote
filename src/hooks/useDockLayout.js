import { useState, useRef, useCallback, useEffect } from 'react';
import { DEFAULT_DOCK_LAYOUT, DEFAULT_FLOAT_W, DEFAULT_FLOAT_H } from '../config/dock-layout.jsx';

const dockLog = (...args) => window.electronAPI?.rendererLog('DOCK', args.join(' '));

/**
 * Manages dock panel layout: zone assignments, drag-drop, floating panels,
 * flashing, and named layout save/load/delete.
 *
 * @param {object} opts
 * @param {object} opts.saveSettingsRef - Ref whose .current() persists all app settings
 */
export function useDockLayout({ saveSettingsRef }) {
  const [dockLayout, setDockLayoutRaw]   = useState(DEFAULT_DOCK_LAYOUT);
  const [savedLayouts, setSavedLayoutsRaw] = useState([]);
  const [draggingPanel, setDraggingPanel]  = useState(null);
  const [hoveredDropZone, setHoveredDropZone] = useState(null);
  const [layoutKey, setLayoutKey]          = useState(0);
  const [flashingPanel, setFlashingPanel]  = useState(null);

  const dockLayoutRef      = useRef(DEFAULT_DOCK_LAYOUT);
  const savedLayoutsRef    = useRef([]);
  const draggingPanelRef   = useRef(null);
  const hoveredDropZoneRef = useRef(null);
  const pendingDragRef     = useRef(null);

  // Wrapped setters keep the companion refs in sync with state atomically.
  const setDockLayout = useCallback((updater) => {
    setDockLayoutRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      dockLayoutRef.current = next;
      return next;
    });
  }, []);

  const setSavedLayouts = useCallback((updater) => {
    setSavedLayoutsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      savedLayoutsRef.current = next;
      return next;
    });
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePanelZoneChange = useCallback((panelId, newZone) => {
    setDockLayout((prev) => {
      const assignments = { ...prev.assignments, [panelId]: newZone };
      const zoneTab     = { ...prev.zoneTab, [newZone]: panelId };
      const floatPos    = (newZone === 'float' && !prev.floatPos[panelId])
        ? { ...prev.floatPos, [panelId]: { x: 200, y: 100, w: DEFAULT_FLOAT_W, h: DEFAULT_FLOAT_H } }
        : prev.floatPos;
      return { ...prev, assignments, zoneTab, floatPos };
    });
  }, [setDockLayout]);

  const handleZoneTabChange = useCallback((zone, panelId) => {
    setDockLayout((prev) => ({ ...prev, zoneTab: { ...prev.zoneTab, [zone]: panelId } }));
  }, [setDockLayout]);

  const handleFocusPanel = useCallback((panelId) => {
    const zone = dockLayoutRef.current.assignments[panelId];
    if (zone && zone !== 'float') handleZoneTabChange(zone, panelId);
    setFlashingPanel(panelId);
    setTimeout(() => setFlashingPanel((p) => p === panelId ? null : p), 700);
  }, [handleZoneTabChange]);

  const handleZoneResizeEnd = useCallback((zone, newSize) => {
    setDockLayout((prev) => {
      const next = { ...prev, sizes: { ...prev.sizes, [zone]: newSize } };
      dockLayoutRef.current = next;
      saveSettingsRef.current();
      return next;
    });
  }, [setDockLayout, saveSettingsRef]);

  const handleFloatMove = useCallback((panelId, newPos) => {
    setDockLayout((prev) => ({ ...prev, floatPos: { ...prev.floatPos, [panelId]: newPos } }));
  }, [setDockLayout]);

  const handleStartDrag = useCallback((panelId, startX, startY) => {
    pendingDragRef.current = panelId ? { panelId, startX, startY } : null;
  }, []);

  // Document-level mousemove/mouseup for drag-drop (avoids Electron dragend bug)
  useEffect(() => {
    const THRESHOLD = 6;

    const getDropZone = (x, y) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (x < 100) return 'left';
      if (x > vw - 100) return 'right';
      if (y > vh - 100) return 'bottom';
      if (Math.abs(x - vw / 2) < 52 && Math.abs(y - vh / 2) < 36) return 'float';
      return null;
    };

    const onMouseMove = (e) => {
      const pending = pendingDragRef.current;
      if (!pending) return;
      if (!draggingPanelRef.current) {
        const dx = e.clientX - pending.startX, dy = e.clientY - pending.startY;
        if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
        dockLog('drag-start panel=' + pending.panelId);
        document.body.classList.add('dock-panel-dragging');
        setDraggingPanel(pending.panelId);
        draggingPanelRef.current = pending.panelId;
      }
      const zone = getDropZone(e.clientX, e.clientY);
      if (zone !== hoveredDropZoneRef.current) {
        hoveredDropZoneRef.current = zone;
        setHoveredDropZone(zone);
      }
    };

    const onMouseUp = () => {
      const panelId = draggingPanelRef.current;
      pendingDragRef.current = null;
      document.body.classList.remove('dock-panel-dragging');
      if (panelId !== null) {
        const zone = hoveredDropZoneRef.current;
        dockLog('drop panel=' + panelId + ' zone=' + (zone ?? 'none'));
        hoveredDropZoneRef.current = null;
        setHoveredDropZone(null);
        setDraggingPanel(null);
        draggingPanelRef.current = null;
        if (zone && zone !== dockLayoutRef.current.assignments[panelId]) {
          handlePanelZoneChange(panelId, zone);
          setTimeout(() => saveSettingsRef.current(), 50);
        }
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
  }, [handlePanelZoneChange, saveSettingsRef]);

  const handleSaveLayout = useCallback((name, layout) => {
    setSavedLayouts((prev) => {
      const idx = prev.findIndex((sl) => sl.name === name);
      const next = idx >= 0
        ? prev.map((sl, i) => i === idx ? { name, layout } : sl)
        : [...prev, { name, layout }];
      savedLayoutsRef.current = next;
      saveSettingsRef.current();
      return next;
    });
  }, [setSavedLayouts, saveSettingsRef]);

  const handleLoadLayout = useCallback((savedLayout) => {
    const layout = {
      ...DEFAULT_DOCK_LAYOUT,
      ...savedLayout.layout,
      assignments: { ...DEFAULT_DOCK_LAYOUT.assignments, ...(savedLayout.layout.assignments || {}) },
      order:       { ...DEFAULT_DOCK_LAYOUT.order,       ...(savedLayout.layout.order       || {}) },
    };
    setDockLayout(layout);
    dockLayoutRef.current = layout;
    setLayoutKey((k) => k + 1);
    saveSettingsRef.current();
  }, [setDockLayout, saveSettingsRef]);

  const handleDeleteLayout = useCallback((name) => {
    setSavedLayouts((prev) => {
      const next = prev.filter((sl) => sl.name !== name);
      savedLayoutsRef.current = next;
      saveSettingsRef.current();
      return next;
    });
  }, [setSavedLayouts, saveSettingsRef]);

  return {
    // State
    dockLayout,
    setDockLayout,
    savedLayouts,
    setSavedLayouts,
    draggingPanel,
    hoveredDropZone,
    layoutKey,
    flashingPanel,
    // Refs (needed by App for settings persistence)
    dockLayoutRef,
    savedLayoutsRef,
    // Handlers
    handlePanelZoneChange,
    handleZoneTabChange,
    handleFocusPanel,
    handleZoneResizeEnd,
    handleFloatMove,
    handleStartDrag,
    handleSaveLayout,
    handleLoadLayout,
    handleDeleteLayout,
  };
}
