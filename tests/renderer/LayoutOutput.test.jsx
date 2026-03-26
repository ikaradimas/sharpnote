import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LayoutOutput } from '../../src/components/output/LayoutOutput.jsx';

const htmlCell   = (title, html)  => ({ title, content: { format: 'html',  content: html } });
const tableCell  = (title, rows)  => ({ title, content: { format: 'table', content: rows } });
const noTitle    = (content)      => ({ title: null, content });

describe('LayoutOutput', () => {
  it('applies grid-template-columns based on column count', () => {
    const { container } = render(
      <LayoutOutput columns={3} cells={[htmlCell(null, '<b>a</b>'), htmlCell(null, '<b>b</b>'), htmlCell(null, '<b>c</b>')]} />
    );
    const grid = container.querySelector('.layout-output');
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });

  it('renders one cell per item', () => {
    const { container } = render(
      <LayoutOutput columns={2} cells={[htmlCell(null, 'A'), htmlCell(null, 'B')]} />
    );
    expect(container.querySelectorAll('.layout-cell').length).toBe(2);
  });

  it('renders cell title when provided', () => {
    render(
      <LayoutOutput columns={1} cells={[htmlCell('Revenue', '<p>data</p>')]} />
    );
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });

  it('does not render title element when title is null', () => {
    const { container } = render(
      <LayoutOutput columns={1} cells={[noTitle({ format: 'html', content: '<p>hi</p>' })]} />
    );
    expect(container.querySelector('.layout-cell-title')).not.toBeInTheDocument();
  });

  it('renders html content inside cell', () => {
    render(
      <LayoutOutput columns={1} cells={[htmlCell(null, '<span>hello</span>')]} />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders table content inside cell', () => {
    const rows = [{ Name: 'Alice', Score: 95 }, { Name: 'Bob', Score: 80 }];
    const { container } = render(
      <LayoutOutput columns={1} cells={[tableCell('Scores', rows)]} />
    );
    expect(container.querySelector('table')).toBeInTheDocument();
  });

  it('renders an empty cell gracefully when content is null', () => {
    const { container } = render(
      <LayoutOutput columns={1} cells={[{ title: 'Empty', content: null }]} />
    );
    expect(container.querySelector('.layout-cell')).toBeInTheDocument();
  });

  it('renders multiple column counts correctly', () => {
    const cells = Array.from({ length: 4 }, (_, i) => htmlCell(`Cell ${i}`, `<p>${i}</p>`));
    const { container } = render(<LayoutOutput columns={4} cells={cells} />);
    expect(container.querySelector('.layout-output').style.gridTemplateColumns).toBe('repeat(4, 1fr)');
    expect(container.querySelectorAll('.layout-cell').length).toBe(4);
  });
});
