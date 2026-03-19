import React, { useState } from 'react';

export function DataTable({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <div className="output-stdout">(empty table)</div>;
  }
  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const columns   = Object.keys(rows[0]);
  const total     = rows.length;
  const pageCount = Math.ceil(total / pageSize);
  const start     = page * pageSize;
  const end       = Math.min(start + pageSize, total);
  const pageRows  = rows.slice(start, end);

  const onPageSize = (e) => { setPageSize(Number(e.target.value)); setPage(0); };

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {pageRows.map((row, i) => (
            <tr key={start + i}>
              {columns.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {total > 20 && (
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
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      )}
    </div>
  );
}
