import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GraphPanel } from '../../src/renderer.jsx';

// ── Empty state ────────────────────────────────────────────────────────────────

describe('GraphPanel — empty state', () => {
  it('shows empty message when no varHistory', () => {
    render(<GraphPanel varHistory={{}} />);
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
  });

  it('shows empty message when varHistory is undefined', () => {
    render(<GraphPanel />);
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
  });
});

// ── Populated state ────────────────────────────────────────────────────────────

const HIST = { x: [1, 2, 3], y: [4, 5, 6], z: [7, 8] };

describe('GraphPanel — with variables', () => {
  it('renders variable checkboxes for each var', () => {
    render(<GraphPanel varHistory={HIST} />);
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(screen.getByText('y')).toBeInTheDocument();
    expect(screen.getByText('z')).toBeInTheDocument();
  });

  it('renders a canvas when variables are selected', () => {
    render(<GraphPanel varHistory={HIST} />);
    expect(document.querySelector('canvas')).toBeInTheDocument();
  });

  it('shows "Select a variable" prompt when all unchecked', () => {
    render(<GraphPanel varHistory={HIST} />);
    // Uncheck all checkboxes
    const boxes = document.querySelectorAll('.graph-var-check');
    boxes.forEach((cb) => { if (cb.checked) fireEvent.click(cb); });
    expect(screen.getByText(/Select a variable above to plot/)).toBeInTheDocument();
  });

  it('toggling a checked var removes it from selection', () => {
    render(<GraphPanel varHistory={{ a: [1, 2] }} />);
    const cb = document.querySelector('.graph-var-check');
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
  });

  it('toggling an unchecked var adds it back', () => {
    render(<GraphPanel varHistory={{ a: [1, 2] }} />);
    const cb = document.querySelector('.graph-var-check');
    fireEvent.click(cb); // uncheck
    fireEvent.click(cb); // re-check
    expect(cb.checked).toBe(true);
  });
});

// ── Chart type selector ────────────────────────────────────────────────────────

describe('GraphPanel — chart type selector', () => {
  it('renders type selector with Line/Area/Column options', () => {
    render(<GraphPanel varHistory={HIST} />);
    const sel = document.querySelector('.graph-type-select');
    expect(sel).toBeInTheDocument();
    expect(sel.querySelector('option[value="line"]')).toBeInTheDocument();
    expect(sel.querySelector('option[value="area"]')).toBeInTheDocument();
    expect(sel.querySelector('option[value="column"]')).toBeInTheDocument();
  });

  it('defaults to "line"', () => {
    render(<GraphPanel varHistory={HIST} />);
    const sel = document.querySelector('.graph-type-select');
    expect(sel.value).toBe('line');
  });

  it('changes chart type when selector changes', () => {
    render(<GraphPanel varHistory={HIST} />);
    const sel = document.querySelector('.graph-type-select');
    fireEvent.change(sel, { target: { value: 'area' } });
    expect(sel.value).toBe('area');
  });
});

// ── Legend toggle ──────────────────────────────────────────────────────────────

describe('GraphPanel — legend toggle', () => {
  it('renders Legend button', () => {
    render(<GraphPanel varHistory={HIST} />);
    expect(screen.getByTitle('Toggle legend')).toBeInTheDocument();
  });

  it('legend button has active class by default', () => {
    render(<GraphPanel varHistory={HIST} />);
    const btn = screen.getByTitle('Toggle legend');
    expect(btn.className).toContain('active');
  });

  it('clicking legend button removes active class', () => {
    render(<GraphPanel varHistory={HIST} />);
    const btn = screen.getByTitle('Toggle legend');
    fireEvent.click(btn);
    expect(btn.className).not.toContain('active');
  });

  it('clicking legend button again restores active class', () => {
    render(<GraphPanel varHistory={HIST} />);
    const btn = screen.getByTitle('Toggle legend');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn.className).toContain('active');
  });
});
