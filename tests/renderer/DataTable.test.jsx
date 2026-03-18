import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from '../../src/renderer.jsx';

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: `item-${i}` }));

describe('DataTable', () => {
  it('renders empty state for empty rows', () => {
    render(<DataTable rows={[]} />);
    expect(screen.getByText('(empty table)')).toBeInTheDocument();
  });

  it('renders column headers from first row', () => {
    render(<DataTable rows={[{ alpha: 1, beta: 2 }]} />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('does not show pagination for ≤ 20 rows', () => {
    render(<DataTable rows={makeRows(15)} />);
    expect(document.querySelector('.table-pager')).toBeNull();
  });

  it('shows pagination controls for > 20 rows', () => {
    render(<DataTable rows={makeRows(25)} />);
    expect(document.querySelector('.table-pager')).not.toBeNull();
  });

  it('shows correct row count info', () => {
    render(<DataTable rows={makeRows(25)} />);
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });

  it('next page button advances to page 2', () => {
    render(<DataTable rows={makeRows(25)} />);
    const nextBtn = screen.getByText('›');
    fireEvent.click(nextBtn);
    expect(screen.getByText(/page 2/)).toBeInTheDocument();
  });

  it('prev page button is disabled on first page', () => {
    render(<DataTable rows={makeRows(25)} />);
    const prevBtn = screen.getByText('‹');
    expect(prevBtn).toBeDisabled();
  });

  it('last page button advances to last page', () => {
    render(<DataTable rows={makeRows(25)} />);
    const lastBtn = screen.getByText('»');
    fireEvent.click(lastBtn);
    expect(screen.getByText(/page 2/)).toBeInTheDocument();
  });

  it('page size select changes rows per page', () => {
    render(<DataTable rows={makeRows(60)} />);
    const select = document.querySelector('.table-pager-size');
    fireEvent.change(select, { target: { value: '50' } });
    // With 50 per page, page 1 of 2 is visible
    expect(document.querySelector('.table-pager-page').textContent).toMatch(/page 1 \/ 2/);
  });
});
