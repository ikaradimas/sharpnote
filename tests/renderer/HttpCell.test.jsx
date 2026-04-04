import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HttpCell } from '../../src/components/editor/HttpCell.jsx';

const makeCell = (overrides = {}) => ({
  id: 'http-1',
  content: 'GET https://example.com',
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

describe('HttpCell', () => {
  it('renders HTTP label and cell ID', () => {
    render(<HttpCell {...defaultProps()} />);
    expect(screen.getByText('HTTP')).toBeInTheDocument();
    expect(screen.getByText('http-1')).toBeInTheDocument();
  });

  it('renders Send button', () => {
    render(<HttpCell {...defaultProps()} />);
    const btn = screen.getByTitle('Send request (Ctrl+Enter)');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain('Send');
  });

  it('Run button is disabled when anyRunning=true', () => {
    render(<HttpCell {...defaultProps({ anyRunning: true })} />);
    expect(screen.getByTitle('Send request (Ctrl+Enter)')).toBeDisabled();
  });

  it('Run button is disabled when kernelReady=false', () => {
    render(<HttpCell {...defaultProps({ kernelReady: false })} />);
    expect(screen.getByTitle('Send request (Ctrl+Enter)')).toBeDisabled();
  });

  it('shows Running button when isRunning=true', () => {
    render(<HttpCell {...defaultProps({ isRunning: true })} />);
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(screen.queryByTitle('Send request (Ctrl+Enter)')).toBeNull();
  });

  it('renders CellOutput with provided outputs', () => {
    const outputs = [{ type: 'text', text: 'HTTP 200 OK' }];
    render(<HttpCell {...defaultProps({ outputs })} />);
    // CellOutput is rendered; we verify it receives messages by checking the container exists
    expect(document.querySelector('.cell-output')).not.toBeNull();
  });
});
