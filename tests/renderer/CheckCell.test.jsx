import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CheckCell } from '../../src/components/editor/CheckCell.jsx';

const defaultProps = (overrides = {}) => ({
  cell: { id: 'c1', type: 'check', content: 'x > 0', label: 'Positive check' },
  cellIndex: 0,
  checkResult: null,
  notebookId: 'nb1',
  isRunning: false,
  anyRunning: false,
  kernelReady: true,
  onUpdate: vi.fn(),
  onLabelChange: vi.fn(),
  onRun: vi.fn(),
  onDelete: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  ...overrides,
});

describe('CheckCell', () => {
  it('renders expression and label inputs', () => {
    render(<CheckCell {...defaultProps()} />);
    expect(screen.getByDisplayValue('x > 0')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Positive check')).toBeInTheDocument();
  });

  it('renders pending icon when no result', () => {
    render(<CheckCell {...defaultProps()} />);
    expect(document.querySelector('.check-icon-pending')).toBeInTheDocument();
  });

  it('renders pass icon on successful check', () => {
    render(<CheckCell {...defaultProps({ checkResult: { passed: true, message: '42' } })} />);
    expect(document.querySelector('.check-icon-pass')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders fail icon on failed check', () => {
    render(<CheckCell {...defaultProps({ checkResult: { passed: false, message: 'was 0' } })} />);
    expect(document.querySelector('.check-icon-fail')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('shows message from check result', () => {
    render(<CheckCell {...defaultProps({ checkResult: { passed: true, message: 'count = 5' } })} />);
    expect(screen.getByText('count = 5')).toBeInTheDocument();
  });

  it('run button calls onRun', () => {
    const onRun = vi.fn();
    render(<CheckCell {...defaultProps({ onRun })} />);
    fireEvent.click(screen.getByTitle(/Run check/));
    expect(onRun).toHaveBeenCalledOnce();
  });

  it('run button is disabled when anyRunning', () => {
    render(<CheckCell {...defaultProps({ anyRunning: true })} />);
    expect(screen.getByTitle(/Run check/)).toBeDisabled();
  });

  it('run button is disabled when expression is empty', () => {
    render(<CheckCell {...defaultProps({ cell: { id: 'c1', type: 'check', content: '', label: '' } })} />);
    expect(screen.getByTitle(/Run check/)).toBeDisabled();
  });

  it('applies check-cell-pass class when passed', () => {
    render(<CheckCell {...defaultProps({ checkResult: { passed: true, message: 'ok' } })} />);
    expect(document.querySelector('.check-cell-pass')).toBeInTheDocument();
  });

  it('applies check-cell-fail class when failed', () => {
    render(<CheckCell {...defaultProps({ checkResult: { passed: false, message: 'fail' } })} />);
    expect(document.querySelector('.check-cell-fail')).toBeInTheDocument();
  });

  it('shows spinner when running', () => {
    render(<CheckCell {...defaultProps({ isRunning: true })} />);
    expect(document.querySelector('.check-spinner')).toBeInTheDocument();
  });

  it('Enter key in expression input triggers onRun', () => {
    const onRun = vi.fn();
    render(<CheckCell {...defaultProps({ onRun })} />);
    fireEvent.keyDown(screen.getByDisplayValue('x > 0'), { key: 'Enter' });
    expect(onRun).toHaveBeenCalledOnce();
  });
});
