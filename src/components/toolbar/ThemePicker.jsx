import React, { useState, useEffect, useRef } from 'react';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';
import { createPortal } from 'react-dom';
import { THEMES } from '../../config/themes.js';
import { IconTheme } from './Icons.jsx';

// Mini code preview for theme hover — uses swatch colors for syntax elements
function ThemePreview({ swatches }) {
  const bg = swatches[0], accent1 = swatches[1], accent2 = swatches[2];
  return (
    <pre className="theme-preview-code" style={{ background: bg }}>
      <span style={{ color: accent1 }}>var</span>{' '}
      <span style={{ color: '#cdd6e0' }}>data</span>{' = '}
      <span style={{ color: accent2 }}>42</span>{';\n'}
      <span style={{ color: accent1 }}>if</span>{' (data > '}
      <span style={{ color: accent2 }}>0</span>{')\n'}
      {'  Console.'}
      <span style={{ color: accent1 }}>WriteLine</span>
      {'('}
      <span style={{ color: '#ce9178' }}>"ok"</span>
      {');'}
    </pre>
  );
}

export function ThemePicker({ theme, onSelect, lineAltEnabled, onLineAltChange }) {
  const [open, setOpen] = useState(false);
  const [hoveredTheme, setHoveredTheme] = useState(null);
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
              onMouseEnter={() => setHoveredTheme(t.id)}
              onMouseLeave={() => setHoveredTheme(null)}
            >
              <div className="theme-picker-swatches">
                {t.swatches.map((c, i) => (
                  <span key={i} className="theme-picker-swatch" style={{ background: c }} />
                ))}
              </div>
              <span className="theme-picker-name">{t.name}</span>
              {hoveredTheme === t.id && <ThemePreview swatches={t.swatches} />}
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
