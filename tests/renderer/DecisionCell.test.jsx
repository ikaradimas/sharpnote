import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DecisionCell } from '../../src/components/editor/DecisionCell.jsx';

const defaultProps = (overrides = {}) => ({
  cell: { id: 'd1', type: 'decision', content: 'x > 0', label: 'Is positive', name: '', truePath: [], falsePath: [] },
  cellIndex: 0,
  decisionResult: null,
  notebookId: 'nb1',
  isRunning: false,
  anyRunning: false,
  kernelReady: true,
  allCells: [],
  onUpdate: vi.fn(),
  onLabelChange: vi.fn(),
  onNameChange: vi.fn(),
  onColorChange: vi.fn(),
  onModeChange: vi.fn(),
  onTruePathChange: vi.fn(),
  onFalsePathChange: vi.fn(),
  onSwitchPathsChange: vi.fn(),
  onRun: vi.fn(),
  onDelete: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  ...overrides,
});

describe('DecisionCell', () => {
  it('renders diamond indicator, expression input, and label input', () => {
    render(<DecisionCell {...defaultProps()} />);
    expect(screen.getByDisplayValue('x > 0')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Is positive')).toBeInTheDocument();
    expect(document.querySelector('.decision-diamond')).toBeInTheDocument();
  });

  it('shows pending state (◇) when no result', () => {
    render(<DecisionCell {...defaultProps()} />);
    const diamond = document.querySelector('.decision-diamond-pending');
    expect(diamond).toBeInTheDocument();
    expect(diamond.textContent).toBe('◇');
  });

  it('shows true state (◆ green class) when result is true', () => {
    render(<DecisionCell {...defaultProps({ decisionResult: { result: true, message: 'yes' } })} />);
    const diamond = document.querySelector('.decision-diamond-true');
    expect(diamond).toBeInTheDocument();
    expect(diamond.textContent).toBe('◆');
  });

  it('shows false state (◆ red class) when result is false', () => {
    render(<DecisionCell {...defaultProps({ decisionResult: { result: false, message: 'no' } })} />);
    const diamond = document.querySelector('.decision-diamond-false');
    expect(diamond).toBeInTheDocument();
    expect(diamond.textContent).toBe('◆');
  });

  it('applies decision-cell-true class when result is true', () => {
    render(<DecisionCell {...defaultProps({ decisionResult: { result: true, message: '' } })} />);
    expect(document.querySelector('.decision-cell-true')).toBeInTheDocument();
  });

  it('applies decision-cell-false class when result is false', () => {
    render(<DecisionCell {...defaultProps({ decisionResult: { result: false, message: '' } })} />);
    expect(document.querySelector('.decision-cell-false')).toBeInTheDocument();
  });

  it('shows message from decision result', () => {
    render(<DecisionCell {...defaultProps({ decisionResult: { result: true, message: 'count = 5' } })} />);
    expect(screen.getByText('count = 5')).toBeInTheDocument();
  });

  it('calls onRun when Enter pressed in expression input', () => {
    const onRun = vi.fn();
    render(<DecisionCell {...defaultProps({ onRun })} />);
    fireEvent.keyDown(screen.getByDisplayValue('x > 0'), { key: 'Enter' });
    expect(onRun).toHaveBeenCalledOnce();
  });

  it('does not call onRun when Enter pressed while anyRunning', () => {
    const onRun = vi.fn();
    render(<DecisionCell {...defaultProps({ onRun, anyRunning: true })} />);
    fireEvent.keyDown(screen.getByDisplayValue('x > 0'), { key: 'Enter' });
    expect(onRun).not.toHaveBeenCalled();
  });

  it('calls onUpdate when expression changes', () => {
    const onUpdate = vi.fn();
    render(<DecisionCell {...defaultProps({ onUpdate })} />);
    fireEvent.change(screen.getByDisplayValue('x > 0'), { target: { value: 'x < 10' } });
    expect(onUpdate).toHaveBeenCalledWith('x < 10');
  });

  it('run button calls onRun', () => {
    const onRun = vi.fn();
    render(<DecisionCell {...defaultProps({ onRun })} />);
    fireEvent.click(screen.getByTitle(/Evaluate/));
    expect(onRun).toHaveBeenCalledOnce();
  });

  it('run button is disabled when anyRunning', () => {
    render(<DecisionCell {...defaultProps({ anyRunning: true })} />);
    expect(screen.getByTitle(/Evaluate/)).toBeDisabled();
  });

  it('run button is disabled when expression is empty', () => {
    render(<DecisionCell {...defaultProps({ cell: { id: 'd1', type: 'decision', content: '  ', label: '', truePath: [], falsePath: [] } })} />);
    expect(screen.getByTitle(/Evaluate/)).toBeDisabled();
  });

  it('shows spinner when running', () => {
    render(<DecisionCell {...defaultProps({ isRunning: true })} />);
    expect(document.querySelector('.check-spinner')).toBeInTheDocument();
  });

  it('renders path selectors for true and false paths', () => {
    render(<DecisionCell {...defaultProps()} />);
    expect(screen.getByText('True →')).toBeInTheDocument();
    expect(screen.getByText('False →')).toBeInTheDocument();
  });

  it('path selector shows cell options when toggled open', () => {
    const allCells = [
      { id: 'd1', type: 'decision', content: 'x > 0' },
      { id: 'c2', type: 'code', content: 'Console.WriteLine("hi")', name: 'Logger' },
      { id: 'c3', type: 'code', content: 'var y = 2;' },
    ];
    render(<DecisionCell {...defaultProps({ allCells })} />);
    // Click the True path toggle to open dropdown
    const toggles = document.querySelectorAll('.decision-path-toggle');
    fireEvent.click(toggles[0]);
    // Should see the other cells (not self)
    expect(screen.getByText('Logger')).toBeInTheDocument();
  });

  // ── Switch mode ──────────────────────────────────────────────────────────

  it('renders mode selector', () => {
    render(<DecisionCell {...defaultProps()} />);
    expect(document.querySelector('.decision-mode-select')).toBeInTheDocument();
  });

  it('in switch mode, shows switch path editor instead of true/false', () => {
    render(<DecisionCell {...defaultProps({
      cell: { id: 'd1', type: 'decision', content: 'status', label: '', mode: 'switch', truePath: [], falsePath: [], switchPaths: { 'ok': ['c1'], 'error': [] } },
    })} />);
    expect(screen.queryByText('True →')).not.toBeInTheDocument();
    expect(screen.getByText('"ok" →')).toBeInTheDocument();
    expect(screen.getByText('"error" →')).toBeInTheDocument();
  });

  it('switch mode shows matched result with arrow prefix', () => {
    render(<DecisionCell {...defaultProps({
      cell: { id: 'd1', type: 'decision', content: 'status', label: '', mode: 'switch', truePath: [], falsePath: [], switchPaths: {} },
      decisionResult: { result: 'active', message: 'active' },
    })} />);
    expect(screen.getByText('→ "active"')).toBeInTheDocument();
  });

  it('switch mode applies decision-cell-matched class', () => {
    render(<DecisionCell {...defaultProps({
      cell: { id: 'd1', type: 'decision', content: 'x', label: '', mode: 'switch', truePath: [], falsePath: [], switchPaths: {} },
      decisionResult: { result: 'a', message: 'a' },
    })} />);
    expect(document.querySelector('.decision-cell-matched')).toBeInTheDocument();
  });

  it('switch mode has add case input and button', () => {
    render(<DecisionCell {...defaultProps({
      cell: { id: 'd1', type: 'decision', content: 'x', label: '', mode: 'switch', truePath: [], falsePath: [], switchPaths: {} },
    })} />);
    expect(screen.getByPlaceholderText('Case value…')).toBeInTheDocument();
    expect(screen.getByText('+ Case')).toBeInTheDocument();
    expect(screen.getByText('+ Default')).toBeInTheDocument();
  });
});
