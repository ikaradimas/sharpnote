import React, { useState, useEffect, useMemo, useContext } from 'react';
import { TablePageSizeContext } from '../../config/table-page-size-context.js';

export function DataTable({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <div className="output-stdout">(empty table)</div>;
  }
  const defaultPageSize = useContext(TablePageSizeContext);
  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sortCol, setSortCol]   = useState(null);
  const [sortDir, setSortDir]   = useState('asc');
  const [colWidths, setColWidths] = useState(null);

  useEffect(() => setColWidths(null), [rows]);

  const columns = Object.keys(rows[0]);

  const sortedRows = useMemo(() => {
    if (sortCol === null) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av === null || av === undefined) return sortDir === 'asc' ?  1 : -1;
      if (bv === null || bv === undefined) return sortDir === 'asc' ? -1 :  1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const onSort = (col) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortCol(null); setSortDir('asc'); }
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(0);
  };

  const total     = sortedRows.length;
  const pageCount = Math.ceil(total / pageSize);
  const start     = page * pageSize;
  const end       = Math.min(start + pageSize, total);
  const pageRows  = sortedRows.slice(start, end);

  const onPageSize = (e) => { setPageSize(Number(e.target.value)); setPage(0); };

  const sortIndicator = (col) =>
    sortCol !== col
      ? <span className="sort-indicator">⇅</span>
      : <span className="sort-indicator active">{sortDir === 'asc' ? '▲' : '▼'}</span>;

  const startResize = (e, colIndex) => {
    e.preventDefault();
    const startX = e.clientX;
    const th = e.target.parentElement;
    const startWidth = th.offsetWidth;

    const table = th.closest('table');
    const ths = table.querySelectorAll('th');
    const currentWidths = colWidths || Array.from(ths).map(t => t.offsetWidth);

    const onMouseMove = (moveE) => {
      const delta = moveE.clientX - startX;
      const newWidths = [...currentWidths];
      newWidths[colIndex] = Math.max(40, startWidth + delta);
      setColWidths(newWidths);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="data-table-wrap">
      <div className="data-table-scroll">
        <table className="data-table" style={colWidths ? { tableLayout: 'fixed' } : undefined}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c} className="sortable" onClick={() => onSort(c)}
                    style={colWidths ? { width: colWidths[i] } : undefined}>
                  {c}{sortIndicator(c)}
                  <div className="col-resize-handle" onMouseDown={(e) => { e.stopPropagation(); startResize(e, i); }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={start + i}>
                {columns.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="table-pager">
          <span className="table-pager-info">
            {start + 1}–{end} of <strong>{total}</strong> rows
          </span>
          <div className="table-pager-controls">
            <button className="table-pager-btn" onClick={() => setPage(0)}        disabled={page === 0}>«</button>
            <button className="table-pager-btn" onClick={() => setPage(p => p-1)} disabled={page === 0}>‹</button>
            <span className="table-pager-page">page {page + 1} / {pageCount}</span>
            <button className="table-pager-btn" onClick={() => setPage(p => p+1)} disabled={page >= pageCount - 1}>›</button>
            <button className="table-pager-btn" onClick={() => setPage(pageCount-1)} disabled={page >= pageCount - 1}>»</button>
          </div>
          <select className="table-pager-size" value={pageSize} onChange={onPageSize}>
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      )}
    </div>
  );
}
