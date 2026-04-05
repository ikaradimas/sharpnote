import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CellNameColor } from '../../src/components/editor/CellNameColor.jsx';

const defaultProps = (overrides = {}) => ({
  name: '',
  color: null,
  onNameChange: vi.fn(),
  onColorChange: vi.fn(),
  ...overrides,
});

describe('CellNameColor', () => {
  it('renders "unnamed" when no name', () => {
    render(<CellNameColor {...defaultProps()} />);
    expect(screen.getByText('unnamed')).toBeInTheDocument();
    expect(document.querySelector('.cell-name-empty')).toBeInTheDocument();
  });

  it('renders the name when provided', () => {
    render(<CellNameColor {...defaultProps({ name: 'MyCell' })} />);
    expect(screen.getByText('MyCell')).toBeInTheDocument();
    expect(document.querySelector('.cell-name-empty')).toBeNull();
  });

  it('renders color dot button', () => {
    render(<CellNameColor {...defaultProps()} />);
    expect(screen.getByTitle('Set cell color')).toBeInTheDocument();
  });

  it('opens color picker on dot click', () => {
    render(<CellNameColor {...defaultProps()} />);
    expect(document.querySelector('.cell-color-picker')).toBeNull();
    fireEvent.click(screen.getByTitle('Set cell color'));
    expect(document.querySelector('.cell-color-picker')).toBeInTheDocument();
  });

  it('calls onColorChange when swatch clicked', () => {
    const onColorChange = vi.fn();
    render(<CellNameColor {...defaultProps({ onColorChange })} />);
    fireEvent.click(screen.getByTitle('Set cell color'));
    // Click the first swatch (blue)
    const swatches = document.querySelectorAll('.cell-color-swatch');
    expect(swatches.length).toBeGreaterThan(0);
    fireEvent.click(swatches[0]);
    expect(onColorChange).toHaveBeenCalledWith('blue');
  });

  it('closes picker after swatch selection', () => {
    render(<CellNameColor {...defaultProps()} />);
    fireEvent.click(screen.getByTitle('Set cell color'));
    const swatches = document.querySelectorAll('.cell-color-swatch');
    fireEvent.click(swatches[0]);
    expect(document.querySelector('.cell-color-picker')).toBeNull();
  });

  it('enters edit mode on name click', () => {
    render(<CellNameColor {...defaultProps({ name: 'Foo' })} />);
    fireEvent.click(screen.getByText('Foo'));
    const input = document.querySelector('.cell-name-input');
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Foo');
  });

  it('enters edit mode on "unnamed" click', () => {
    render(<CellNameColor {...defaultProps()} />);
    fireEvent.click(screen.getByText('unnamed'));
    expect(document.querySelector('.cell-name-input')).toBeInTheDocument();
  });

  it('calls onNameChange on blur', () => {
    const onNameChange = vi.fn();
    render(<CellNameColor {...defaultProps({ onNameChange })} />);
    fireEvent.click(screen.getByText('unnamed'));
    const input = document.querySelector('.cell-name-input');
    fireEvent.change(input, { target: { value: 'NewName' } });
    fireEvent.blur(input);
    expect(onNameChange).toHaveBeenCalledWith('NewName');
  });

  it('calls onNameChange on Enter', () => {
    const onNameChange = vi.fn();
    render(<CellNameColor {...defaultProps({ onNameChange })} />);
    fireEvent.click(screen.getByText('unnamed'));
    const input = document.querySelector('.cell-name-input');
    fireEvent.change(input, { target: { value: 'Typed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNameChange).toHaveBeenCalledWith('Typed');
  });

  it('exits edit mode on Escape without calling onNameChange', () => {
    const onNameChange = vi.fn();
    render(<CellNameColor {...defaultProps({ name: 'Original', onNameChange })} />);
    fireEvent.click(screen.getByText('Original'));
    const input = document.querySelector('.cell-name-input');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    // Should exit edit mode — label should reappear
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(onNameChange).not.toHaveBeenCalled();
  });

  it('shows clear button when color is set', () => {
    render(<CellNameColor {...defaultProps({ color: 'blue' })} />);
    fireEvent.click(screen.getByTitle('Set cell color'));
    expect(screen.getByTitle('Clear color')).toBeInTheDocument();
  });

  it('calls onColorChange(null) when clear clicked', () => {
    const onColorChange = vi.fn();
    render(<CellNameColor {...defaultProps({ color: 'blue', onColorChange })} />);
    fireEvent.click(screen.getByTitle('Set cell color'));
    fireEvent.click(screen.getByTitle('Clear color'));
    expect(onColorChange).toHaveBeenCalledWith(null);
  });
});
