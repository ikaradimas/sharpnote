import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuitDialog } from '../../src/renderer.jsx';

const makeNbs = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    id: `nb-${i}`,
    title: `Notebook ${i}`,
    path: null,
  }));

const defaultProps = (overrides = {}) => ({
  dirtyNbs: makeNbs(2),
  onSaveSelected: vi.fn(),
  onDiscardAll: vi.fn(),
  onCancel: vi.fn(),
  ...overrides,
});

describe('QuitDialog', () => {
  it('renders a checkbox per dirty notebook', () => {
    render(<QuitDialog {...defaultProps()} />);
    // 2 dirty nbs + 1 "Select All" = 3 checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(3);
  });

  it('all checkboxes are initially checked', () => {
    render(<QuitDialog {...defaultProps()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  it('"Select All" unchecks all when all were checked', () => {
    render(<QuitDialog {...defaultProps()} />);
    const selectAll = screen.getAllByRole('checkbox')[0]; // first is "All notebooks"
    fireEvent.click(selectAll); // uncheck all
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it('"Save Selected & Exit" is disabled when nothing is selected', () => {
    render(<QuitDialog {...defaultProps()} />);
    const selectAll = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAll); // uncheck all
    const saveBtn = screen.getByText(/Save Selected/);
    expect(saveBtn).toBeDisabled();
  });

  it('"Save Selected & Exit" fires onSaveSelected with selected IDs', () => {
    const onSaveSelected = vi.fn();
    render(<QuitDialog {...defaultProps({ onSaveSelected })} />);
    fireEvent.click(screen.getByText(/Save Selected/));
    expect(onSaveSelected).toHaveBeenCalledOnce();
    const ids = onSaveSelected.mock.calls[0][0];
    expect(ids).toContain('nb-0');
    expect(ids).toContain('nb-1');
  });

  it('"Discard All & Exit" fires onDiscardAll', () => {
    const onDiscardAll = vi.fn();
    render(<QuitDialog {...defaultProps({ onDiscardAll })} />);
    fireEvent.click(screen.getByText(/Discard All/));
    expect(onDiscardAll).toHaveBeenCalledOnce();
  });

  it('"Cancel" fires onCancel', () => {
    const onCancel = vi.fn();
    render(<QuitDialog {...defaultProps({ onCancel })} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('deselecting individual notebook removes it from save list', () => {
    const onSaveSelected = vi.fn();
    render(<QuitDialog {...defaultProps({ onSaveSelected })} />);
    // Uncheck the first notebook checkbox (index 1, after "All" at index 0)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // uncheck nb-0
    fireEvent.click(screen.getByText(/Save Selected/));
    const ids = onSaveSelected.mock.calls[0][0];
    expect(ids).not.toContain('nb-0');
    expect(ids).toContain('nb-1');
  });
});
