import React, { useMemo, useState } from 'react';
import { extractHeadings } from '../../utils.js';

export function TocPanel({ cells }) {
  const headings = useMemo(() => extractHeadings(cells), [cells]);
  const [query, setQuery] = useState('');

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
    // .notebook has position:relative, so cell.offsetTop is the stable absolute
    // offset within the scroll container — independent of current scroll position
    // or any ongoing animation/transition.
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
      {filtered.length === 0 ? (
        <div className="toc-empty">
          {headings.length === 0 ? 'No headings found' : 'No matches'}
        </div>
      ) : (
        <div className="toc-list">
          {filtered.map((h, i) => (
            <button key={i} className={`toc-item toc-h${h.level}`} onClick={() => scroll(h.cellId)}>
              {h.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
