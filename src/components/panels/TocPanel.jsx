import React, { useMemo, useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { extractHeadings } from '../../utils.js';
import { useOutsideClick } from '../../hooks/useOutsideClick.js';

const CELL_TYPES = [
  { type: 'markdown', label: 'Markdown' },
  { type: 'code',     label: 'Code' },
  { type: 'sql',      label: 'SQL' },
  { type: 'http',     label: 'HTTP' },
  { type: 'shell',    label: 'Shell' },
  { type: 'docker',   label: 'Docker' },
  { type: 'check',    label: 'Check' },
  { type: 'decision', label: 'Decision' },
];

function AddCellMenu({ cellId, onAddCell, onClose }) {
  const ref = useRef(null);
  useOutsideClick(ref, onClose, true);
  return (
    <div className="toc-add-menu" ref={ref}>
      {CELL_TYPES.map(({ type, label }) => (
        <button key={type} className="toc-add-menu-item" onClick={() => { onAddCell(type, cellId); onClose(); }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function TocPanel({ cells, onAddCell }) {
  const headings = useMemo(() => extractHeadings(cells), [cells]);
  const bookmarkedCells = useMemo(() => cells.filter(c => c.bookmarked), [cells]);
  const [query, setQuery] = useState('');
  const [addMenuCellId, setAddMenuCellId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return headings;
    return headings.filter((h) => h.text.toLowerCase().includes(q));
  }, [headings, query]);

  const scroll = (cellId) => {
    const cell = document.querySelector(`[data-cell-id="${cellId}"]`);
    if (!cell) return;
    const container = cell.closest('.notebook');
    if (!container) {
      cell.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    container.scrollTo({ top: cell.offsetTop - 8, behavior: 'smooth' });
  };

  return (
    <div className="toc-panel">
      <div className="toc-panel-header">
        <span className="toc-panel-title">Table of Contents</span>
      </div>
      <div className="toc-search-row">
        <input
          className="toc-search"
          type="text"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="toc-search-clear" onClick={() => setQuery('')} title="Clear">✕</button>
        )}
      </div>
      {bookmarkedCells.length > 0 && !query && (
        <div className="toc-bookmarks-section">
          <div className="toc-bookmarks-header">Bookmarks</div>
          {bookmarkedCells.map(c => (
            <div key={c.id} className="toc-item-row">
              <button className="toc-item toc-h2 toc-cell toc-bookmarked" onClick={() => scroll(c.id)}>
                <span className="toc-bookmark-star">★</span>
                <span className="toc-cell-badge">{c.type}</span>
                {c.name || c.content?.split('\n')[0]?.slice(0, 40) || c.id}
              </button>
            </div>
          ))}
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="toc-empty">
          {headings.length === 0 ? 'No headings found' : 'No matches'}
        </div>
      ) : (
        <div className="toc-list">
          {filtered.map((h, i) => (
            <div key={i} className="toc-item-row">
              <button className={`toc-item toc-h${h.level}${h.cellType ? ' toc-cell' : ''}`} onClick={() => scroll(h.cellId)}>
                {h.cellType && <span className="toc-cell-badge">{h.cellType}</span>}
                {h.text}
              </button>
              {onAddCell && (
                <div className="toc-add-wrap">
                  <button className="toc-add-btn" onClick={() => setAddMenuCellId(addMenuCellId === h.cellId ? null : h.cellId)} title="Add cell after this">
                    <Plus size={10} />
                  </button>
                  {addMenuCellId === h.cellId && (
                    <AddCellMenu cellId={h.cellId} onAddCell={onAddCell} onClose={() => setAddMenuCellId(null)} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
