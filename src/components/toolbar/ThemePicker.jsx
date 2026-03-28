import React, { useState, useEffect, useRef } from 'react';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';
import { createPortal } from 'react-dom';
import { THEMES } from '../../config/themes.js';
import { IconTheme } from './Icons.jsx';

export function ThemePicker({ theme, onSelect, lineAltEnabled, onLineAltChange }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popupRef = useRef(null);

  useOutsideClick([popupRef, btnRef], () => setOpen(false), open);

  // Calculate popup position anchored to button
  const [popupStyle, setPopupStyle] = useState({});
  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopupStyle({ top: r.bottom + 4, left: r.left });
    }
  }, [open]);

  return (
    <div className="theme-picker-wrap">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Switch theme"
        className={`toolbar-icon-btn${open ? ' panel-active' : ''}`}
      >
        <IconTheme />
      </button>
      {open && createPortal(
        <div ref={popupRef} className="theme-picker-popup" style={popupStyle}>
          {THEMES.map((t) => (
            <div
              key={t.id}
              className={`theme-picker-item${theme === t.id ? ' active' : ''}`}
              onClick={() => { onSelect(t.id); setOpen(false); }}
            >
              <div className="theme-picker-swatches">
                {t.swatches.map((c, i) => (
                  <span key={i} className="theme-picker-swatch" style={{ background: c }} />
                ))}
              </div>
              <span className="theme-picker-name">{t.name}</span>
            </div>
          ))}
          <div className="theme-picker-separator" />
          <label className="theme-picker-toggle" onMouseDown={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!lineAltEnabled}
              onChange={(e) => onLineAltChange(e.target.checked)}
            />
            <span>Alternating row colors</span>
          </label>
        </div>,
        document.body
      )}
    </div>
  );
}
