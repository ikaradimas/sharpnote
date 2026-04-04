import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GraphPanel } from '../../src/renderer.jsx';

// Helper: create point objects in the { v, t, axis, chartType } format
const pt = (v, axis = 'y', chartType = undefined) => ({ v, t: Date.now(), axis, ...(chartType ? { chartType } : {}) });

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

const HIST = {
  x: [pt(1), pt(2), pt(3)],
  y: [pt(4), pt(5), pt(6)],
  z: [pt(7), pt(8)],
};

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
    const boxes = document.querySelectorAll('.graph-var-check');
    boxes.forEach((cb) => { if (cb.checked) fireEvent.click(cb); });
    expect(screen.getByText(/Select a variable above to plot/)).toBeInTheDocument();
  });

  it('toggling a checked var removes it from selection', () => {
    render(<GraphPanel varHistory={{ a: [pt(1), pt(2)] }} />);
    const cb = document.querySelector('.graph-var-check');
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
  });

  it('toggling an unchecked var adds it back', () => {
    render(<GraphPanel varHistory={{ a: [pt(1), pt(2)] }} />);
    const cb = document.querySelector('.graph-var-check');
    fireEvent.click(cb); // uncheck
    fireEvent.click(cb); // re-check
    expect(cb.checked).toBe(true);
  });

  it('handles legacy plain-number points gracefully', () => {
    render(<GraphPanel varHistory={{ x: [1, 2, 3] }} />);
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(document.querySelector('canvas')).toBeInTheDocument();
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

// ── Clear button ──────────────────────────────────────────────────────────────

describe('GraphPanel — clear button', () => {
  it('renders Clear button when onClearGraph is provided', () => {
    render(<GraphPanel varHistory={HIST} onClearGraph={() => {}} />);
    expect(screen.getByTitle('Clear all graph data')).toBeInTheDocument();
  });

  it('does not render Clear button when onClearGraph is not provided', () => {
    render(<GraphPanel varHistory={HIST} />);
    expect(screen.queryByTitle('Clear all graph data')).toBeNull();
  });

  it('calls onClearGraph when Clear button is clicked', () => {
    const onClear = vi.fn();
    render(<GraphPanel varHistory={HIST} onClearGraph={onClear} />);
    fireEvent.click(screen.getByTitle('Clear all graph data'));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

// ── Avg / max overlays ────────────────────────────────────────────────────────

describe('GraphPanel — avg/max overlays', () => {
  it('renders avg and max checkboxes for each variable', () => {
    render(<GraphPanel varHistory={{ x: [pt(1), pt(2), pt(3)] }} />);
    expect(screen.getByTitle('Show average line')).toBeInTheDocument();
    expect(screen.getByTitle('Show max line')).toBeInTheDocument();
  });

  it('avg checkbox is unchecked by default', () => {
    render(<GraphPanel varHistory={{ x: [pt(1), pt(2), pt(3)] }} />);
    const avgBox = screen.getByTitle('Show average line').querySelector('input');
    expect(avgBox.checked).toBe(false);
  });

  it('max checkbox is unchecked by default', () => {
    render(<GraphPanel varHistory={{ x: [pt(1), pt(2), pt(3)] }} />);
    const maxBox = screen.getByTitle('Show max line').querySelector('input');
    expect(maxBox.checked).toBe(false);
  });

  it('avg checkbox becomes checked after click', () => {
    render(<GraphPanel varHistory={{ x: [pt(1), pt(2), pt(3)] }} />);
    const avgBox = screen.getByTitle('Show average line').querySelector('input');
    fireEvent.click(avgBox);
    expect(avgBox.checked).toBe(true);
  });

  it('max checkbox becomes checked after click', () => {
    render(<GraphPanel varHistory={{ x: [pt(1), pt(2), pt(3)] }} />);
    const maxBox = screen.getByTitle('Show max line').querySelector('input');
    fireEvent.click(maxBox);
    expect(maxBox.checked).toBe(true);
  });

  it('avg and max checkboxes can both be checked independently', () => {
    render(<GraphPanel varHistory={{ x: [pt(1), pt(2), pt(3)] }} />);
    const avgBox = screen.getByTitle('Show average line').querySelector('input');
    const maxBox = screen.getByTitle('Show max line').querySelector('input');
    fireEvent.click(avgBox);
    fireEvent.click(maxBox);
    expect(avgBox.checked).toBe(true);
    expect(maxBox.checked).toBe(true);
  });

  it('each variable has its own independent overlay checkboxes', () => {
    render(<GraphPanel varHistory={{ x: [pt(1), pt(2)], y: [pt(3), pt(4)] }} />);
    const avgBoxes = screen.getAllByTitle('Show average line');
    expect(avgBoxes).toHaveLength(2);
    fireEvent.click(avgBoxes[0].querySelector('input'));
    expect(avgBoxes[0].querySelector('input').checked).toBe(true);
    expect(avgBoxes[1].querySelector('input').checked).toBe(false);
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

// ── Dual y-axis ───────────────────────────────────────────────────────────────

describe('GraphPanel — dual y-axis', () => {
  it('shows R badge for variables on the y2 axis', () => {
    const hist = { temp: [pt(22, 'y')], humidity: [pt(60, 'y2')] };
    render(<GraphPanel varHistory={hist} />);
    const badges = document.querySelectorAll('.graph-axis-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe('R');
  });

  it('does not show R badge for variables on the default y axis', () => {
    const hist = { temp: [pt(22)], pressure: [pt(1013)] };
    render(<GraphPanel varHistory={hist} />);
    expect(document.querySelectorAll('.graph-axis-badge')).toHaveLength(0);
  });
});

// ── Per-series chart type ────────────────────────────────────────────────────

describe('GraphPanel — per-series chart type', () => {
  it('renders a per-series type dropdown for each variable', () => {
    render(<GraphPanel varHistory={{ a: [pt(1)], b: [pt(2)] }} />);
    const selects = document.querySelectorAll('.graph-var-type');
    expect(selects).toHaveLength(2);
  });

  it('per-series type defaults to empty (use global default)', () => {
    render(<GraphPanel varHistory={{ a: [pt(1)] }} />);
    const sel = document.querySelector('.graph-var-type');
    expect(sel.value).toBe('');
  });

  it('changing per-series type updates the select value', () => {
    render(<GraphPanel varHistory={{ a: [pt(1)] }} />);
    const sel = document.querySelector('.graph-var-type');
    fireEvent.change(sel, { target: { value: 'column' } });
    expect(sel.value).toBe('column');
  });

  it('auto-initialises seriesType from kernel-supplied chartType', () => {
    const hist = { events: [pt(1, 'y', 'bar')] };
    render(<GraphPanel varHistory={hist} />);
    const sel = document.querySelector('.graph-var-type');
    expect(sel.value).toBe('column');
  });

  it('global default label shows current global type', () => {
    render(<GraphPanel varHistory={{ a: [pt(1)] }} />);
    expect(screen.getByText('Default:')).toBeInTheDocument();
  });
});
