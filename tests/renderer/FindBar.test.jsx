import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FindBar } from '../../src/components/FindBar.jsx';

const cells = [
  { id: 'c1', type: 'code', content: 'var x = 1;' },
  { id: 'c2', type: 'code', content: 'Console.WriteLine(x);' },
  { id: 'c3', type: 'markdown', content: '# Hello' },
];

describe('FindBar', () => {
  it('renders the search input', () => {
    render(<FindBar cells={cells} onClose={vi.fn()} onHighlight={vi.fn()} />);
    expect(screen.getByPlaceholderText('Find in notebook…')).toBeInTheDocument();
  });

  it('shows match count when query matches', () => {
    render(<FindBar cells={cells} onClose={vi.fn()} onHighlight={vi.fn()} />);
    const input = screen.getByPlaceholderText('Find in notebook…');
    fireEvent.change(input, { target: { value: 'x' } });
    // "var x = 1;" and "Console.WriteLine(x);" both match
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('shows "No matches" for unmatched query', () => {
    render(<FindBar cells={cells} onClose={vi.fn()} onHighlight={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Find in notebook…'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('calls onHighlight with matched cell ids', () => {
    const onHighlight = vi.fn();
    render(<FindBar cells={cells} onClose={vi.fn()} onHighlight={onHighlight} />);
    fireEvent.change(screen.getByPlaceholderText('Find in notebook…'), { target: { value: 'var' } });
    expect(onHighlight).toHaveBeenCalled();
    const lastCall = onHighlight.mock.calls[onHighlight.mock.calls.length - 1][0];
    expect(lastCall.has('c1')).toBe(true);
    expect(lastCall.has('c2')).toBe(false);
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<FindBar cells={cells} onClose={onClose} onHighlight={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Close (Escape)'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<FindBar cells={cells} onClose={onClose} onHighlight={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
