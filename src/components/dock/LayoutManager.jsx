import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconLayout } from '../toolbar/Icons.jsx';

export function LayoutManager({ dockLayout, savedLayouts, onSave, onLoad, onDelete }) {
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const btnRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const [popupStyle, setPopupStyle] = useState({});
  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopupStyle({ top: r.bottom + 4, left: r.left });
    }
  }, [open]);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    onSave(name, dockLayout);
    setSaveName('');
    setOpen(false);
  };

  return (
    <div className="theme-picker-wrap">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Layout Manager"
        className={`toolbar-icon-btn${open ? ' panel-active' : ''}`}
      >
        <IconLayout />
      </button>
      {open && createPortal(
        <div ref={popupRef} className="layout-manager-popup" style={popupStyle}>
          {savedLayouts.length === 0 && (
            <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>No saved layouts</div>
          )}
          {savedLayouts.map((sl) => (
            <div key={sl.name} className="layout-entry">
              <span style={{ flex: 1, fontSize: '11px' }}>{sl.name}</span>
              <button
                className="toolbar-icon-btn"
                onClick={() => { onLoad(sl); setOpen(false); }}
                title="Load layout"
                style={{ fontSize: '10px', padding: '2px 6px' }}
              >Load</button>
              <button
                className="toolbar-icon-btn"
                onClick={() => onDelete(sl.name)}
                title="Delete layout"
                style={{ fontSize: '10px', padding: '2px 4px', color: 'var(--status-error)' }}
              >×</button>
            </div>
          ))}
          <div className="layout-save-row">
            <input
              className="toolbar-rename-input"
              style={{ flex: 1, fontSize: '11px', padding: '2px 6px' }}
              placeholder="Layout name…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setOpen(false); }}
            />
            <button
              className="toolbar-icon-btn"
              onClick={handleSave}
              style={{ fontSize: '10px', padding: '2px 6px' }}
            >Save</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
