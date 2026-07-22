import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CellManualToggle } from '../../src/components/editor/CellManualToggle.jsx';

describe('CellManualToggle', () => {
  it('renders a button, not pressed when off', () => {
    render(<CellManualToggle manualOnly={false} onToggle={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn.className).not.toContain('cell-manual-btn-on');
  });

  it('shows the on state when manualOnly', () => {
    render(<CellManualToggle manualOnly onToggle={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.className).toContain('cell-manual-btn-on');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<CellManualToggle manualOnly={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('has distinct titles for on vs off', () => {
    const { rerender } = render(<CellManualToggle manualOnly={false} onToggle={vi.fn()} />);
    const off = screen.getByRole('button').getAttribute('title');
    rerender(<CellManualToggle manualOnly onToggle={vi.fn()} />);
    const on = screen.getByRole('button').getAttribute('title');
    expect(off).not.toBe(on);
    expect(on).toMatch(/manual only/i);
  });
});
