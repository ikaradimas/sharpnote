import React, { useMemo } from 'react';
import { extractHeadings } from '../../utils.js';

export function TocPanel({ cells }) {
  const headings = useMemo(() => extractHeadings(cells), [cells]);
  const scroll = (cellId) => {
    requestAnimationFrame(() => {
      document.querySelector(`[data-cell-id="${cellId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  return (
    <div className="toc-panel">
      <div className="toc-panel-header">
        <span className="toc-panel-title">Table of Contents</span>
      </div>
      {headings.length === 0 ? (
        <div className="toc-empty">No headings found</div>
      ) : (
        <div className="toc-list">
          {headings.map((h, i) => (
            <button key={i} className={`toc-item toc-h${h.level}`} onClick={() => scroll(h.cellId)}>
              {h.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
