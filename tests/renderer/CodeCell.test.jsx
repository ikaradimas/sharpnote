import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodeCell } from '../../src/renderer.jsx';

const makeCell = (overrides = {}) => ({
  id: 'cell-1',
  content: 'var x = 1;',
  outputMode: 'auto',
  locked: false,
  ...overrides,
});

const defaultProps = (overrides = {}) => ({
  cell: makeCell(),
  cellIndex: 0,
  outputs: [],
  isRunning: false,
  anyRunning: false,
  onUpdate: vi.fn(),
  onRun: vi.fn(),
  onInterrupt: vi.fn(),
  onRunFrom: vi.fn(),
  onRunTo: vi.fn(),
  onDelete: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  onOutputModeChange: vi.fn(),
  onToggleLock: vi.fn(),
  requestCompletions: vi.fn(),
  requestLint: vi.fn(),
  ...overrides,
});

describe('CodeCell – run button', () => {
  it('Run button is enabled when anyRunning=false', () => {
    render(<CodeCell {...defaultProps()} />);
    const runBtn = screen.getByTitle(/Run \(Ctrl\+Enter\)/);
    expect(runBtn).not.toBeDisabled();
  });

  it('Run button is disabled when anyRunning=true', () => {
    render(<CodeCell {...defaultProps({ anyRunning: true })} />);
    const runBtn = screen.getByTitle(/Run \(Ctrl\+Enter\)/);
    expect(runBtn).toBeDisabled();
  });

  it('Run button is disabled when kernelReady=false', () => {
    render(<CodeCell {...defaultProps({ kernelReady: false })} />);
    expect(screen.getByTitle('Run (Ctrl+Enter)')).toBeDisabled();
  });

  it('Run button is enabled when kernelReady=true and anyRunning=false', () => {
    render(<CodeCell {...defaultProps({ kernelReady: true, anyRunning: false })} />);
    expect(screen.getByTitle('Run (Ctrl+Enter)')).not.toBeDisabled();
  });

  it('clicking Run fires onRun', () => {
    const onRun = vi.fn();
    render(<CodeCell {...defaultProps({ onRun })} />);
    fireEvent.click(screen.getByTitle(/Run \(Ctrl\+Enter\)/));
    expect(onRun).toHaveBeenCalledOnce();
  });
});

describe('CodeCell – running state', () => {
  it('shows Stop button when isRunning=true', () => {
    render(<CodeCell {...defaultProps({ isRunning: true })} />);
    expect(screen.getByText(/Stop/)).toBeInTheDocument();
  });

  it('hides Run button when isRunning=true', () => {
    render(<CodeCell {...defaultProps({ isRunning: true })} />);
    expect(screen.queryByTitle(/Run \(Ctrl\+Enter\)/)).toBeNull();
  });

  it('Stop button fires onInterrupt', () => {
    const onInterrupt = vi.fn();
    render(<CodeCell {...defaultProps({ isRunning: true, onInterrupt })} />);
    fireEvent.click(screen.getByText(/Stop/));
    expect(onInterrupt).toHaveBeenCalledOnce();
  });
});

describe('CodeCell – run dropdown', () => {
  it('chevron button opens dropdown', () => {
    render(<CodeCell {...defaultProps()} />);
    const chevron = screen.getByTitle('More run options');
    fireEvent.click(chevron);
    expect(screen.getByText(/Run from here/)).toBeInTheDocument();
    expect(screen.getByText(/Run to here/)).toBeInTheDocument();
  });

  it('"Run from here" fires onRunFrom', () => {
    const onRunFrom = vi.fn();
    render(<CodeCell {...defaultProps({ onRunFrom })} />);
    fireEvent.click(screen.getByTitle('More run options'));
    fireEvent.click(screen.getByText(/Run from here/));
    expect(onRunFrom).toHaveBeenCalledOnce();
  });

  it('"Run to here" fires onRunTo', () => {
    const onRunTo = vi.fn();
    render(<CodeCell {...defaultProps({ onRunTo })} />);
    fireEvent.click(screen.getByTitle('More run options'));
    fireEvent.click(screen.getByText(/Run to here/));
    expect(onRunTo).toHaveBeenCalledOnce();
  });
});

describe('CodeCell – lock', () => {
  it('lock button fires onToggleLock', () => {
    const onToggleLock = vi.fn();
    render(<CodeCell {...defaultProps({ onToggleLock })} />);
    const lockBtn = document.querySelector('.cell-lock-btn');
    fireEvent.click(lockBtn);
    expect(onToggleLock).toHaveBeenCalledOnce();
  });

  it('adds cell-locked class when locked=true', () => {
    render(<CodeCell {...defaultProps({ cell: makeCell({ locked: true }) })} />);
    expect(document.querySelector('.cell-locked')).not.toBeNull();
  });
});

describe('CodeCell – output mode', () => {
  it('output mode select fires onOutputModeChange', () => {
    const onOutputModeChange = vi.fn();
    render(<CodeCell {...defaultProps({ onOutputModeChange })} />);
    const select = document.querySelector('.output-mode-select');
    fireEvent.change(select, { target: { value: 'html' } });
    expect(onOutputModeChange).toHaveBeenCalledWith('html');
  });
});
