import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from '../../src/renderer.jsx';
import { TablePageSizeContext } from '../../src/config/table-page-size-context.js';

function renderTable(rows, pageSize) {
  if (pageSize != null) {
    return render(
      <TablePageSizeContext.Provider value={pageSize}>
        <DataTable rows={rows} />
      </TablePageSizeContext.Provider>
    );
  }
  return render(<DataTable rows={rows} />);
}

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: `item-${i}` }));

// Tables with >5 rows start collapsed. Expand them for pagination tests.
function expandTable() {
  const toggle = document.querySelector('.table-collapse-toggle');
  if (toggle) fireEvent.click(toggle);
}

describe('DataTable', () => {
  it('renders empty state for empty rows', () => {
    renderTable([]);
    expect(screen.getByText('(empty table)')).toBeInTheDocument();
  });

  it('renders column headers from first row', () => {
    renderTable([{ alpha: 1, beta: 2 }]);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('does not show pagination for ≤ default page size rows', () => {
    renderTable(makeRows(10)); // exactly default page size — pageCount = 1
    expect(document.querySelector('.table-pager')).toBeNull();
  });

  it('shows pagination controls for > default page size rows', () => {
    renderTable(makeRows(11)); // 11 > 10 default — pageCount = 2
    expandTable(); // expand collapsed table first
    expect(document.querySelector('.table-pager')).not.toBeNull();
  });

  it('respects pageSize from context', () => {
    renderTable(makeRows(15), 20); // 15 rows, context says 20/page → pageCount = 1
    expect(document.querySelector('.table-pager')).toBeNull();
  });

  it('shows correct row count info', () => {
    renderTable(makeRows(11));
    expect(document.querySelector('.table-row-count').textContent).toMatch(/11 rows/);
  });

  it('next page button advances to page 2', () => {
    renderTable(makeRows(11));
    expandTable();
    const nextBtn = screen.getByText('›');
    fireEvent.click(nextBtn);
    expect(screen.getByText(/page 2/)).toBeInTheDocument();
  });

  it('prev page button is disabled on first page', () => {
    renderTable(makeRows(11));
    expandTable();
    const prevBtn = screen.getByText('‹');
    expect(prevBtn).toBeDisabled();
  });

  it('last page button advances to last page', () => {
    renderTable(makeRows(11));
    expandTable();
    const lastBtn = screen.getByText('»');
    fireEvent.click(lastBtn);
    expect(screen.getByText(/page 2/)).toBeInTheDocument();
  });

  it('page size select changes rows per page', () => {
    renderTable(makeRows(60));
    expandTable();
    const select = document.querySelector('.table-pager-size');
    fireEvent.change(select, { target: { value: '50' } });
    // With 50 per page, page 1 of 2 is visible
    expect(document.querySelector('.table-pager-page').textContent).toMatch(/page 1 \/ 2/);
  });

  // ── Column sorting ────────────────────────────────────────────────────────

  it('column headers have sortable class', () => {
    renderTable([{ a: 1 }, { a: 2 }]);
    expect(document.querySelector('th.sortable')).not.toBeNull();
  });

  it('clicking column header sorts ascending', () => {
    const rows = [{ name: 'Charlie' }, { name: 'Alice' }, { name: 'Bob' }];
    renderTable(rows);
    const th = screen.getByText(/^name/);
    fireEvent.click(th);
    const cells = document.querySelectorAll('tbody td');
    expect(cells[0].textContent).toBe('Alice');
    expect(cells[1].textContent).toBe('Bob');
    expect(cells[2].textContent).toBe('Charlie');
  });

  it('clicking sorted column toggles to descending', () => {
    const rows = [{ name: 'Charlie' }, { name: 'Alice' }, { name: 'Bob' }];
    renderTable(rows);
    const th = screen.getByText(/^name/);
    fireEvent.click(th);  // asc
    fireEvent.click(th);  // desc
    const cells = document.querySelectorAll('tbody td');
    expect(cells[0].textContent).toBe('Charlie');
    expect(cells[1].textContent).toBe('Bob');
    expect(cells[2].textContent).toBe('Alice');
  });

  it('third click on same column resets sort order', () => {
    const rows = [{ name: 'Charlie' }, { name: 'Alice' }, { name: 'Bob' }];
    renderTable(rows);
    const th = screen.getByText(/^name/);
    fireEvent.click(th);  // asc
    fireEvent.click(th);  // desc
    fireEvent.click(th);  // reset
    const cells = document.querySelectorAll('tbody td');
    // Original order restored
    expect(cells[0].textContent).toBe('Charlie');
    expect(cells[1].textContent).toBe('Alice');
    expect(cells[2].textContent).toBe('Bob');
  });

  it('numeric columns sort numerically not lexically', () => {
    const rows = [{ n: 10 }, { n: 9 }, { n: 100 }];
    renderTable(rows);
    const th = screen.getByText(/^n/);
    fireEvent.click(th);
    const cells = document.querySelectorAll('tbody td');
    expect(cells[0].textContent).toBe('9');
    expect(cells[1].textContent).toBe('10');
    expect(cells[2].textContent).toBe('100');
  });

  // ── Export bar ──────────────────────────────────────────────────────────

  it('renders export buttons (Copy, CSV, TSV)', () => {
    renderTable([{ a: 1 }, { a: 2 }]);
    expect(screen.getByTitle(/Copy as TSV/)).toBeInTheDocument();
    expect(screen.getByTitle(/Export as CSV/)).toBeInTheDocument();
    expect(screen.getByTitle(/Export as TSV/)).toBeInTheDocument();
  });

  it('shows row and column count', () => {
    renderTable([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(screen.getByText(/2 rows · 2 cols/)).toBeInTheDocument();
  });

  it('shows singular "row" for single row', () => {
    renderTable([{ a: 1 }]);
    expect(screen.getByText(/1 row · 1 col$/)).toBeInTheDocument();
  });

  // ── Collapse / expand ──────────────────────────────────────────────────

  it('tables with >5 rows start collapsed showing only 5 rows', () => {
    renderTable(makeRows(20));
    const visibleRows = document.querySelectorAll('tbody tr');
    expect(visibleRows).toHaveLength(5);
  });

  it('tables with ≤5 rows are NOT collapsed', () => {
    renderTable(makeRows(4));
    expect(document.querySelector('.table-collapse-toggle')).toBeNull();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(4);
  });

  it('shows "Show all N rows" toggle when collapsed', () => {
    renderTable(makeRows(20));
    expect(screen.getByText(/Show all 20 rows/)).toBeInTheDocument();
  });

  it('clicking toggle expands to show all rows (paginated)', () => {
    renderTable(makeRows(20));
    expandTable();
    // Now expanded — should show first page (10 rows default)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(document.querySelector('.table-pager')).not.toBeNull();
  });

  it('clicking collapse toggle hides rows back to preview', () => {
    renderTable(makeRows(20));
    expandTable(); // expand
    // Find first collapse button and click
    const collapseBtns = document.querySelectorAll('.table-collapse-toggle');
    fireEvent.click(collapseBtns[0]);
    expect(document.querySelectorAll('tbody tr')).toHaveLength(5);
  });
});
