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

  it('renders type dropdown for existing entries', () => {
    const config = [{ key: 'K', value: 'V', type: 'secret' }];
    render(<ConfigPanel {...defaultProps({ config })} />);
    const select = document.querySelector('.config-item .config-type-select');
    expect(select).not.toBeNull();
    expect(select.value).toBe('secret');
  });

  it('changing type dropdown fires onUpdate with { type }', () => {
    const onUpdate = vi.fn();
    const config = [{ key: 'K', value: 'V', type: 'string' }];
    render(<ConfigPanel {...defaultProps({ config, onUpdate })} />);
    const select = document.querySelector('.config-item .config-type-select');
    fireEvent.change(select, { target: { value: 'number' } });
    expect(onUpdate).toHaveBeenCalledWith(0, { type: 'number' });
  });

  it('renders envVar input for existing entries', () => {
    const config = [{ key: 'K', value: 'V', envVar: 'MY_ENV' }];
    render(<ConfigPanel {...defaultProps({ config })} />);
    expect(screen.getByDisplayValue('MY_ENV')).toBeInTheDocument();
  });

  it('changing envVar input fires onUpdate with { envVar }', () => {
    const onUpdate = vi.fn();
    const config = [{ key: 'K', value: 'V' }];
    render(<ConfigPanel {...defaultProps({ config, onUpdate })} />);
    const envInput = document.querySelector('.config-item .config-env-input');
    fireEvent.change(envInput, { target: { value: 'NEW_ENV' } });
    expect(onUpdate).toHaveBeenCalledWith(0, { envVar: 'NEW_ENV' });
  });

  it('show/hide secrets button renders', () => {
    render(<ConfigPanel {...defaultProps()} />);
    const btn = document.querySelector('.config-show-btn');
    expect(btn).not.toBeNull();
    expect(btn.title).toBe('Show secret values');
  });

  it('clicking show/hide secrets toggles button state', () => {
    render(<ConfigPanel {...defaultProps()} />);
    const btn = document.querySelector('.config-show-btn');
    expect(btn.textContent).toBe('◎');
    fireEvent.click(btn);
    expect(btn.textContent).toBe('◉');
    expect(btn.title).toBe('Hide secret values');
  });

  it('secret entries use password type when secrets hidden', () => {
    const config = [{ key: 'TOKEN', value: 'abc', type: 'secret' }];
    render(<ConfigPanel {...defaultProps({ config })} />);
    const valueInput = document.querySelector('.config-item .config-value-input');
    expect(valueInput.type).toBe('password');
  });

  it('secret entries use text type when secrets shown', () => {
    const config = [{ key: 'TOKEN', value: 'abc', type: 'secret' }];
    render(<ConfigPanel {...defaultProps({ config })} />);
    const btn = document.querySelector('.config-show-btn');
    fireEvent.click(btn);
    const valueInput = document.querySelector('.config-item .config-value-input');
    expect(valueInput.type).toBe('text');
  });

  it('add row with type and envVar fires onAdd with all params', () => {
    const onAdd = vi.fn();
    render(<ConfigPanel {...defaultProps({ onAdd })} />);
    fireEvent.change(screen.getByPlaceholderText('Key'), { target: { value: 'SECRET_KEY' } });
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 's3cret' } });
    const addRowSelects = document.querySelectorAll('.config-add-row .config-type-select');
    fireEvent.change(addRowSelects[0], { target: { value: 'secret' } });
    const envInputs = document.querySelectorAll('.config-add-row .config-env-input');
    fireEvent.change(envInputs[0], { target: { value: 'MY_SECRET' } });
    fireEvent.click(screen.getByText('+ Add'));
    expect(onAdd).toHaveBeenCalledWith('SECRET_KEY', 's3cret', 'secret', 'MY_SECRET');
  });
});
