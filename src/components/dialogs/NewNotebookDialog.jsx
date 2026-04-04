import React, { useState, useEffect, useRef } from 'react';
import { NOTEBOOK_TEMPLATES } from '../../notebook-factory.js';

export function NewNotebookDialog({ onSelect, onCancel }) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef(null);

  // Items: templates + blank at the end
  const items = [
    ...NOTEBOOK_TEMPLATES.map((t) => ({ key: t.key, label: t.label, desc: t.description })),
    { key: null, label: 'Blank Notebook', desc: 'Start with an empty notebook' },
  ];

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => (s + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => (s - 1 + items.length) % items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(items[selected].key);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, items.length, onSelect, onCancel]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selected];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className="quit-overlay" onClick={onCancel}>
      <div className="new-nb-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="quit-dialog-header">New Notebook</div>
        <div className="new-nb-dialog-body" ref={listRef}>
          {items.map((item, i) => (
            <button
              key={item.key ?? 'blank'}
              className={`new-nb-item${i === selected ? ' new-nb-item-selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => onSelect(item.key)}
            >
              <span className="new-nb-item-label">{item.label}</span>
              <span className="new-nb-item-desc">{item.desc}</span>
            </button>
          ))}
        </div>
        <div className="quit-dialog-actions">
          <button className="quit-btn quit-btn-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
