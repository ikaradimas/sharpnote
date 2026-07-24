import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CellRunGroup } from '../../src/components/editor/CellRunGroup.jsx';

describe('CellRunGroup — lazy run-plan tooltip', () => {
  it('does not compute the run-plan title on render (only the default title shows)', () => {
    const getRunTitle = vi.fn(() => 'Also runs: A, B');
    render(<CellRunGroup onRun={vi.fn()} isRunning={false} disabled={false} getRunTitle={getRunTitle} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('title', 'Run (Ctrl+Enter)');
    expect(getRunTitle).not.toHaveBeenCalled();
  });

  it('computes the run-plan title lazily on hover and applies it', () => {
    const getRunTitle = vi.fn(() => 'Run (Ctrl+Enter)\nAlso runs: A, B');
    render(<CellRunGroup onRun={vi.fn()} isRunning={false} disabled={false} getRunTitle={getRunTitle} />);
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    expect(getRunTitle).toHaveBeenCalledTimes(1);
    expect(btn).toHaveAttribute('title', 'Run (Ctrl+Enter)\nAlso runs: A, B');
  });

  it('falls back to the default title when there is no extra plan', () => {
    const getRunTitle = vi.fn(() => undefined);
    render(<CellRunGroup onRun={vi.fn()} isRunning={false} disabled={false} getRunTitle={getRunTitle} />);
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    expect(btn).toHaveAttribute('title', 'Run (Ctrl+Enter)');
  });
});
