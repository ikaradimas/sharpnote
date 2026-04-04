import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewNotebookDialog } from '../../src/components/dialogs/NewNotebookDialog.jsx';

const defaultProps = (overrides = {}) => ({
  onSelect: vi.fn(),
  onCancel: vi.fn(),
  ...overrides,
});

describe('NewNotebookDialog', () => {
  it('renders all template options plus Blank Notebook', () => {
    render(<NewNotebookDialog {...defaultProps()} />);
    // 6 templates + Blank Notebook = 7 items
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Data & Charts')).toBeInTheDocument();
    expect(screen.getByText('Databases')).toBeInTheDocument();
    expect(screen.getByText('Display & Rich Output')).toBeInTheDocument();
    expect(screen.getByText('Scripting & Utilities')).toBeInTheDocument();
    expect(screen.getByText('Workspace & Panels')).toBeInTheDocument();
    expect(screen.getByText('Blank Notebook')).toBeInTheDocument();
  });

  it('clicking a template calls onSelect with the correct key', () => {
    const onSelect = vi.fn();
    render(<NewNotebookDialog {...defaultProps({ onSelect })} />);
    fireEvent.click(screen.getByText('Databases'));
    expect(onSelect).toHaveBeenCalledWith('databases');
  });

  it('clicking Blank Notebook calls onSelect with null', () => {
    const onSelect = vi.fn();
    render(<NewNotebookDialog {...defaultProps({ onSelect })} />);
    fireEvent.click(screen.getByText('Blank Notebook'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn();
    render(<NewNotebookDialog {...defaultProps({ onCancel })} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('ArrowDown moves selection forward', () => {
    render(<NewNotebookDialog {...defaultProps()} />);
    // Initially first item is selected
    const items = document.querySelectorAll('.new-nb-item');
    expect(items[0].classList.contains('new-nb-item-selected')).toBe(true);

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    const updatedItems = document.querySelectorAll('.new-nb-item');
    expect(updatedItems[1].classList.contains('new-nb-item-selected')).toBe(true);
  });

  it('ArrowUp wraps to last item from first', () => {
    render(<NewNotebookDialog {...defaultProps()} />);
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    const items = document.querySelectorAll('.new-nb-item');
    // Should wrap to last item (Blank Notebook)
    expect(items[items.length - 1].classList.contains('new-nb-item-selected')).toBe(true);
  });
});
