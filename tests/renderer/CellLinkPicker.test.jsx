import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CellLinkPicker } from '../../src/components/editor/CellLinkPicker.jsx';

const allCells = [
  { id: 'a', type: 'code', content: 'Alpha' },
  { id: 'b', type: 'code', content: 'Beta' },
];

const open = () => fireEvent.click(screen.getByTitle('Prev'));

describe('CellLinkPicker', () => {
  it('no longer offers the implicit "Next in notebook order" option', () => {
    render(<CellLinkPicker label="Prev" selected={null} allCells={allCells} cellId="b" onChange={() => {}} />);
    open();
    expect(screen.queryByText('Next in notebook order')).toBeNull();
    expect(screen.getByText('None (default)')).toBeInTheDocument();
  });

  it('shows "none" as the default summary when there are no explicit links', () => {
    render(<CellLinkPicker label="Prev" selected={null} allCells={allCells} cellId="b" onChange={() => {}} />);
    expect(screen.getByText('none')).toBeInTheDocument();
  });

  it('selecting a cell reports it as an explicit link', () => {
    const onChange = vi.fn();
    render(<CellLinkPicker label="Prev" selected={null} allCells={allCells} cellId="b" onChange={onChange} />);
    open();
    fireEvent.click(screen.getByText('Alpha'));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('clearing the last explicit link reports null (back to none)', () => {
    const onChange = vi.fn();
    render(<CellLinkPicker label="Prev" selected={['a']} allCells={allCells} cellId="b" onChange={onChange} />);
    open();
    fireEvent.click(screen.getByText('Alpha')); // toggle it off
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
