import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NugetPanel } from '../../src/renderer.jsx';

const defaultSources = [
  { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
];

const defaultProps = (overrides = {}) => ({
  isOpen: true,
  onToggle: vi.fn(),
  packages: [],
  kernelStatus: 'ready',
  sources: defaultSources,
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onRetry: vi.fn(),
  onAddSource: vi.fn(),
  onRemoveSource: vi.fn(),
  onToggleSource: vi.fn(),
  ...overrides,
});

describe('NugetPanel', () => {
  it('does not render when isOpen=false', () => {
    const { container } = render(<NugetPanel {...defaultProps({ isOpen: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when isOpen=true', () => {
    render(<NugetPanel {...defaultProps()} />);
    expect(document.querySelector('.nuget-panel')).not.toBeNull();
  });

  it('shows empty state when no packages', () => {
    render(<NugetPanel {...defaultProps()} />);
    expect(screen.getByText(/No startup packages/)).toBeInTheDocument();
  });

  it('shows installed package in list', () => {
    const packages = [{ id: 'Newtonsoft.Json', version: '13.0.3', status: 'loaded' }];
    render(<NugetPanel {...defaultProps({ packages })} />);
    expect(screen.getByText('Newtonsoft.Json')).toBeInTheDocument();
  });

  it('add form: clicking + Add with empty ID does not fire onAdd', () => {
    const onAdd = vi.fn();
    render(<NugetPanel {...defaultProps({ onAdd })} />);
    const addBtn = document.querySelector('.nuget-add-btn');
    fireEvent.click(addBtn);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('add form: clicking + Add with package ID fires onAdd', () => {
    const onAdd = vi.fn();
    render(<NugetPanel {...defaultProps({ onAdd })} />);
    const idInput = screen.getByPlaceholderText('Package ID');
    fireEvent.change(idInput, { target: { value: 'Serilog' } });
    const addBtn = document.querySelector('.nuget-add-btn');
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalledWith('Serilog', null);
  });

  it('close button fires onToggle', () => {
    const onToggle = vi.fn();
    render(<NugetPanel {...defaultProps({ onToggle })} />);
    const closeBtn = document.querySelector('.nuget-close-btn');
    fireEvent.click(closeBtn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('remove button fires onRemove', () => {
    const onRemove = vi.fn();
    const packages = [{ id: 'Pkg.One', version: '1.0.0', status: 'loaded' }];
    render(<NugetPanel {...defaultProps({ packages, onRemove })} />);
    const removeBtn = document.querySelector('.nuget-remove-btn');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('Pkg.One');
  });
});
