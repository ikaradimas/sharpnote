import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardShortcutsOverlay } from '../../src/components/dialogs/KeyboardShortcutsOverlay.jsx';

const defaultProps = (overrides = {}) => ({
  onClose: vi.fn(),
  ...overrides,
});

describe('KeyboardShortcutsOverlay', () => {
  it('renders "Keyboard Shortcuts" header', () => {
    render(<KeyboardShortcutsOverlay {...defaultProps()} />);
    const header = document.querySelector('.shortcuts-header span');
    expect(header).not.toBeNull();
    expect(header.textContent).toBe('Keyboard Shortcuts');
  });

  it('renders shortcut groups', () => {
    render(<KeyboardShortcutsOverlay {...defaultProps()} />);
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Execution')).toBeInTheDocument();
    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Panels')).toBeInTheDocument();
  });

  it('renders individual shortcuts within groups', () => {
    render(<KeyboardShortcutsOverlay {...defaultProps()} />);
    expect(screen.getByText('Run Cell')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Command Palette')).toBeInTheDocument();
    expect(screen.getByText('Variables')).toBeInTheDocument();
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsOverlay {...defaultProps({ onClose })} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking overlay backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsOverlay {...defaultProps({ onClose })} />);
    // The outer overlay div has the click handler
    const overlay = document.querySelector('.cmd-palette-overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking inside the dialog does not call onClose', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsOverlay {...defaultProps({ onClose })} />);
    const dialog = document.querySelector('.shortcuts-overlay');
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });
});
