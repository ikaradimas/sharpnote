import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CellControls } from '../../src/components/editor/CellControls.jsx';

const defaultProps = (overrides = {}) => ({
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  onDelete: vi.fn(),
  ...overrides,
});

describe('CellControls', () => {
  it('renders move up, move down, and delete buttons', () => {
    render(<CellControls {...defaultProps()} />);
    expect(screen.getByTitle('Move Up')).toBeInTheDocument();
    expect(screen.getByTitle('Move Down')).toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('clicking delete shows confirm and cancel buttons', () => {
    render(<CellControls {...defaultProps()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByTitle('Confirm delete')).toBeInTheDocument();
    expect(screen.getByTitle('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Delete?')).toBeInTheDocument();
  });

  it('confirm triggers onDelete', () => {
    const onDelete = vi.fn();
    render(<CellControls {...defaultProps({ onDelete })} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByTitle('Confirm delete'));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('cancel returns to normal buttons', () => {
    render(<CellControls {...defaultProps()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByTitle('Cancel'));
    expect(screen.getByTitle('Move Up')).toBeInTheDocument();
    expect(screen.getByTitle('Move Down')).toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('auto-dismisses confirm after 3 seconds', () => {
    vi.useFakeTimers();
    render(<CellControls {...defaultProps()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText('Delete?')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.queryByText('Delete?')).toBeNull();
    expect(screen.getByTitle('Move Up')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
