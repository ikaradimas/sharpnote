import React, { useRef, useState, useEffect } from 'react';
import { Plus, Code, FileText, Database, Globe, Terminal, CheckCircle, GitBranch, Container, Cloud, Clipboard, MoreHorizontal } from 'lucide-react';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';

const CELL_TYPES = [
  { key: 'md',       icon: FileText,    label: 'Markdown',  prop: 'onAddMarkdown' },
  { key: 'code',     icon: Code,        label: 'Code',      prop: 'onAddCode' },
  { key: 'sql',      icon: Database,    label: 'SQL',       prop: 'onAddSql' },
  { key: 'http',     icon: Globe,       label: 'HTTP',      prop: 'onAddHttp' },
  { key: 'shell',    icon: Terminal,    label: 'Shell',     prop: 'onAddShell' },
  { key: 'docker',   icon: Container,   label: 'Docker',    prop: 'onAddDocker' },
  { key: 'floci',    icon: Cloud,       label: 'Floci',     prop: 'onAddFloci' },
  { key: 'check',    icon: CheckCircle, label: 'Check',     prop: 'onAddCheck' },
  { key: 'decision', icon: GitBranch,   label: 'Decision',  prop: 'onAddDecision' },
  { key: 'paste',    icon: Clipboard,   label: 'Paste',     prop: 'onPaste', noPlusIcon: true },
];

export function AddBar(props) {
  const barRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(CELL_TYPES.length);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useOutsideClick(menuRef, () => setMenuOpen(false), menuOpen);

  const available = CELL_TYPES.filter((t) => props[t.prop]);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const barW = el.clientWidth;
      const buttons = el.querySelectorAll('.cell-add-btn');
      let total = 0;
      let fits = 0;
      const moreW = 40; // space reserved for the "more" button
      for (const btn of buttons) {
        total += btn.offsetWidth + 4; // 4px gap
        if (total + moreW < barW) fits++;
        else break;
      }
      setVisibleCount(fits >= available.length ? available.length : Math.max(1, fits));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [available.length]);

  const visible = available.slice(0, visibleCount);
  const overflowed = available.slice(visibleCount);

  return (
    <div className="cell-add-bar">
      <div className="cell-add-bar-inner" ref={barRef}>
        {visible.map(({ key, icon: Icon, label, prop, noPlusIcon }) => (
          <button key={key} className={`cell-add-btn cell-add-${key}`} onClick={props[prop]}>
            {!noPlusIcon && <Plus size={11} />}<Icon size={11} /> {label}
          </button>
        ))}
        {overflowed.length > 0 && (
          <div className="cell-add-more-wrap" ref={menuRef}>
            <button className="cell-add-btn cell-add-more" onClick={() => setMenuOpen((v) => !v)}>
              <MoreHorizontal size={11} />
            </button>
            {menuOpen && (
              <div className="cell-add-more-dropdown">
                {overflowed.map(({ key, icon: Icon, label, prop, noPlusIcon }) => (
                  <button key={key} className="cell-add-more-item" onClick={() => { props[prop](); setMenuOpen(false); }}>
                    <Icon size={11} /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
