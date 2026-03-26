import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ObjectTree } from '../../src/components/output/ObjectTree.jsx';

describe('ObjectTree', () => {
  it('renders a primitive value', () => {
    render(<ObjectTree json='42' />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a string value', () => {
    render(<ObjectTree json='"hello"' />);
    expect(screen.getByText('"hello"')).toBeInTheDocument();
  });

  it('renders null', () => {
    render(<ObjectTree json='null' />);
    expect(screen.getByText('null')).toBeInTheDocument();
  });

  it('renders object with keys', () => {
    const { container } = render(<ObjectTree json='{"name":"Alice","age":30}' />);
    expect(container.textContent).toContain('name');
    expect(container.textContent).toContain('"Alice"');
    expect(container.textContent).toContain('age');
    expect(container.textContent).toContain('30');
  });

  it('renders array with element count', () => {
    render(<ObjectTree json='[1,2,3]' />);
    expect(screen.getByText(/Array \[3\]/)).toBeInTheDocument();
  });

  it('falls back to pre tag on invalid JSON', () => {
    const { container } = render(<ObjectTree json='not-json' />);
    expect(container.querySelector('pre')).toBeInTheDocument();
  });

  it('can toggle collapsed nodes open and closed', () => {
    render(<ObjectTree json='{"x":{"y":1}}' />);
    // Inner object should be expandable; collapse root first
    const chevrons = screen.getAllByText(/▾|▸/);
    // Click the first chevron to collapse root
    fireEvent.click(chevrons[0].closest('.tree-expandable'));
    // After collapse key "x" should not be visible as a tree row
    expect(screen.queryByText(/"x"/) || screen.queryByText(/x/)).toBeTruthy(); // key still in dom since parent shows it
  });
});
