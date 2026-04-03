import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigPanel } from '../../src/renderer.jsx';

const defaultProps = (overrides = {}) => ({
  isOpen: true,
  onToggle: vi.fn(),
  config: [],
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onUpdate: vi.fn(),
  ...overrides,
});

describe('ConfigPanel', () => {
  it('does not render when isOpen=false', () => {
    const { container } = render(<ConfigPanel {...defaultProps({ isOpen: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows empty state with no entries', () => {
    render(<ConfigPanel {...defaultProps()} />);
    expect(screen.getByText(/No entries/)).toBeInTheDocument();
  });

  it('renders existing config entries', () => {
    const config = [{ key: 'DB_HOST', value: 'localhost' }];
    render(<ConfigPanel {...defaultProps({ config })} />);
    expect(screen.getByText('DB_HOST')).toBeInTheDocument();
    expect(screen.getByDisplayValue('localhost')).toBeInTheDocument();
  });

  it('add: fires onAdd with key and value', () => {
    const onAdd = vi.fn();
    render(<ConfigPanel {...defaultProps({ onAdd })} />);
    const keyInput = screen.getByPlaceholderText('Key');
    const valInput = screen.getByPlaceholderText('Value');
    fireEvent.change(keyInput, { target: { value: 'MY_KEY' } });
    fireEvent.change(valInput, { target: { value: 'my-value' } });
    fireEvent.click(screen.getByText('+ Add'));
    expect(onAdd).toHaveBeenCalledWith('MY_KEY', 'my-value', 'string', undefined);
  });

  it('add: empty key does not fire onAdd', () => {
    const onAdd = vi.fn();
    render(<ConfigPanel {...defaultProps({ onAdd })} />);
    fireEvent.click(screen.getByText('+ Add'));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('delete button fires onRemove with index', () => {
    const onRemove = vi.fn();
    const config = [{ key: 'K', value: 'V' }];
    render(<ConfigPanel {...defaultProps({ config, onRemove })} />);
    const removeBtn = document.querySelector('.nuget-remove-btn');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('value input fires onUpdate on change', () => {
    const onUpdate = vi.fn();
    const config = [{ key: 'K', value: 'old' }];
    render(<ConfigPanel {...defaultProps({ config, onUpdate })} />);
    const valueInput = screen.getByDisplayValue('old');
    fireEvent.change(valueInput, { target: { value: 'new' } });
    expect(onUpdate).toHaveBeenCalledWith(0, { value: 'new' });
  });

  it('close button fires onToggle', () => {
    const onToggle = vi.fn();
    render(<ConfigPanel {...defaultProps({ onToggle })} />);
    const closeBtn = document.querySelector('.config-close-btn');
    fireEvent.click(closeBtn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('Enter key in key input fires onAdd', () => {
    const onAdd = vi.fn();
    render(<ConfigPanel {...defaultProps({ onAdd })} />);
    const keyInput = screen.getByPlaceholderText('Key');
    fireEvent.change(keyInput, { target: { value: 'K' } });
    fireEvent.keyDown(keyInput, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('K', '', 'string', undefined);
  });
});
