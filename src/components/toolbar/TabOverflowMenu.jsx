import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function TabOverflowMenu({ items, activeId, onSelect }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popupRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({});
  const posRef = useRef({ top: 0, left: 0 });

  const hasActive = items.some(it => it.id === activeId);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (!popupRef.current?.contains(e.target) && !btnRef.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const top = r.bottom + 2, left = r.left;
    if (top !== posRef.current.top || left !== posRef.current.left) {
      posRef.current = { top, left };
      setPopupStyle({ top, left });
    }
  });

  return (
    <>
      <button
        ref={btnRef}
        className={`tab-overflow-btn${hasActive ? ' has-active' : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen(v => !v)}
        title={`${items.length} more tab${items.length === 1 ? '' : 's'}`}
      >
        +{items.length}
      </button>
      {open && createPortal(
        <div ref={popupRef} className="tab-overflow-popup" style={popupStyle}>
          {items.map(item => (
            <button
              key={item.id}
              className={`tab-overflow-item${item.id === activeId ? ' active' : ''}`}
              onClick={() => { onSelect(item); setOpen(false); }}
            >
              {item.isDirty && <span className="tab-overflow-dirty">•</span>}
              <span className="tab-overflow-title">{item._label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
