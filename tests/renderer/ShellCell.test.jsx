import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShellCell } from '../../src/components/editor/ShellCell.jsx';

const makeCell = (overrides = {}) => ({
  id: 'shell-1',
  content: 'echo hello',
  ...overrides,
});

const defaultProps = (overrides = {}) => ({
  cell: makeCell(),
  cellIndex: 0,
  outputs: [],
  notebookId: 'nb-1',
  isRunning: false,
  anyRunning: false,
  kernelReady: true,
  onUpdate: vi.fn(),
  onRun: vi.fn(),
  onDelete: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  ...overrides,
});

describe('ShellCell', () => {
  it('renders Shell label and cell ID', () => {
    render(<ShellCell {...defaultProps()} />);
    expect(screen.getByText('Shell')).toBeInTheDocument();
    expect(screen.getByText('shell-1')).toBeInTheDocument();
  });

  it('renders Run button', () => {
    render(<ShellCell {...defaultProps()} />);
    const btn = screen.getByTitle('Run (Ctrl+Enter)');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain('Run');
  });

  it('Run button is disabled when anyRunning=true', () => {
    render(<ShellCell {...defaultProps({ anyRunning: true })} />);
    expect(screen.getByTitle('Run (Ctrl+Enter)')).toBeDisabled();
  });

  it('Run button is disabled when kernelReady=false', () => {
    render(<ShellCell {...defaultProps({ kernelReady: false })} />);
    expect(screen.getByTitle('Run (Ctrl+Enter)')).toBeDisabled();
  });

  it('shows Running button when isRunning=true', () => {
    render(<ShellCell {...defaultProps({ isRunning: true })} />);
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(screen.queryByTitle('Run (Ctrl+Enter)')).toBeNull();
  });

  it('renders CellOutput with provided outputs', () => {
    const outputs = [{ type: 'text', text: 'hello' }];
    render(<ShellCell {...defaultProps({ outputs })} />);
    expect(document.querySelector('.cell-output')).not.toBeNull();
  });

  // ── Manual-only toggle + ambiguity badge wiring (cell-side of #1/#2) ──
  it('renders the manual-only toggle and reflects the cell flag + persist call', () => {
    const onToggleManualOnly = vi.fn();
    render(<ShellCell {...defaultProps({ cell: makeCell({ manualOnly: true }), onToggleManualOnly })} />);
    const btn = document.querySelector('.cell-manual-btn');
    expect(btn).not.toBeNull();
    expect(btn.className).toContain('cell-manual-btn-on'); // reflects cell.manualOnly
    fireEvent.click(btn);
    expect(onToggleManualOnly).toHaveBeenCalledOnce();
  });

  it('marks the cell root with cell-manual-only when the flag is set', () => {
    render(<ShellCell {...defaultProps({ cell: makeCell({ manualOnly: true }), onToggleManualOnly: vi.fn() })} />);
    expect(document.querySelector('.cell.cell-manual-only')).not.toBeNull();
  });

  it('renders the ambiguity badge only when a tip is provided', () => {
    const { rerender } = render(<ShellCell {...defaultProps({ onToggleManualOnly: vi.fn() })} />);
    expect(document.querySelector('.cell-ambiguous-badge')).toBeNull();
    rerender(<ShellCell {...defaultProps({ onToggleManualOnly: vi.fn(), ambiguousTip: '"x" is also set by Cell 2 — "Cell 3" wins' })} />);
    expect(document.querySelector('.cell-ambiguous-badge')).not.toBeNull();
  });
});
