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
    expect(document.querySelector('.table-pager')).not.toBeNull();
  });

  it('respects pageSize from context', () => {
    renderTable(makeRows(15), 20); // 15 rows, context says 20/page → pageCount = 1
    expect(document.querySelector('.table-pager')).toBeNull();
  });

  it('shows correct row count info', () => {
    renderTable(makeRows(11));
    expect(screen.getByText(/11/)).toBeInTheDocument();
  });

  it('next page button advances to page 2', () => {
    renderTable(makeRows(11));
    const nextBtn = screen.getByText('›');
    fireEvent.click(nextBtn);
    expect(screen.getByText(/page 2/)).toBeInTheDocument();
  });

  it('prev page button is disabled on first page', () => {
    renderTable(makeRows(11));
    const prevBtn = screen.getByText('‹');
    expect(prevBtn).toBeDisabled();
  });

  it('last page button advances to last page', () => {
    renderTable(makeRows(11));
    const lastBtn = screen.getByText('»');
    fireEvent.click(lastBtn);
    expect(screen.getByText(/page 2/)).toBeInTheDocument();
  });

  it('page size select changes rows per page', () => {
    renderTable(makeRows(60));
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
});
