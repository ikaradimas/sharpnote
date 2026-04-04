import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    const btn = screen.getByTitle('Run command (Ctrl+Enter)');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain('Run');
  });

  it('Run button is disabled when anyRunning=true', () => {
    render(<ShellCell {...defaultProps({ anyRunning: true })} />);
    expect(screen.getByTitle('Run command (Ctrl+Enter)')).toBeDisabled();
  });

  it('Run button is disabled when kernelReady=false', () => {
    render(<ShellCell {...defaultProps({ kernelReady: false })} />);
    expect(screen.getByTitle('Run command (Ctrl+Enter)')).toBeDisabled();
  });

  it('shows Running button when isRunning=true', () => {
    render(<ShellCell {...defaultProps({ isRunning: true })} />);
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(screen.queryByTitle('Run command (Ctrl+Enter)')).toBeNull();
  });

  it('renders CellOutput with provided outputs', () => {
    const outputs = [{ type: 'text', text: 'hello' }];
    render(<ShellCell {...defaultProps({ outputs })} />);
    expect(document.querySelector('.cell-output')).not.toBeNull();
  });
});
