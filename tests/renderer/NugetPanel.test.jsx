import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
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
  onChangeVersion: vi.fn(),
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

// ── VersionPicker ─────────────────────────────────────────────────────────────

describe('VersionPicker — installed packages', () => {
  const pkg = { id: 'Newtonsoft.Json', version: '13.0.3', status: 'loaded' };

  it('shows current version on the picker button', () => {
    render(<NugetPanel {...defaultProps({ packages: [pkg] })} />);
    expect(document.querySelector('.nuget-ver-picker-btn')).toBeInTheDocument();
    expect(document.querySelector('.nuget-ver-picker-label').textContent).toBe('13.0.3');
  });

  it('shows "latest" on the button when version is null', () => {
    const p = { ...pkg, version: null };
    render(<NugetPanel {...defaultProps({ packages: [p] })} />);
    expect(document.querySelector('.nuget-ver-picker-label').textContent).toBe('latest');
  });

  it('opens dropdown when picker button is clicked', () => {
    // fetch not mocked → dropdown opens but shows loading
    global.fetch = vi.fn(() => new Promise(() => {}));
    render(<NugetPanel {...defaultProps({ packages: [pkg] })} />);
    fireEvent.click(document.querySelector('.nuget-ver-picker-btn'));
    expect(document.querySelector('.nuget-ver-picker-dropdown')).toBeInTheDocument();
  });

  it('shows loading state while versions are fetching', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    render(<NugetPanel {...defaultProps({ packages: [pkg] })} />);
    fireEvent.click(document.querySelector('.nuget-ver-picker-btn'));
    expect(screen.getByText('Loading versions…')).toBeInTheDocument();
  });

  it('closes dropdown when button is clicked again', () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    render(<NugetPanel {...defaultProps({ packages: [pkg] })} />);
    const btn = document.querySelector('.nuget-ver-picker-btn');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(document.querySelector('.nuget-ver-picker-dropdown')).toBeNull();
  });

  it('selecting a version calls onChangeVersion', async () => {
    const onChangeVersion = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        resources: [{ '@type': 'PackageBaseAddress/3.0.0', '@id': 'https://pkgs.example/flat/' }],
        versions: ['12.0.0', '13.0.0', '13.0.3'],
      }),
    });
    render(<NugetPanel {...defaultProps({ packages: [pkg], onChangeVersion })} />);
    fireEvent.click(document.querySelector('.nuget-ver-picker-btn'));
    // Wait for versions to load
    const option = await screen.findByText('latest');
    fireEvent.click(option);
    expect(onChangeVersion).toHaveBeenCalledWith('Newtonsoft.Json', null);
  });
});

// ── Add with version ──────────────────────────────────────────────────────────

describe('add form — version field', () => {
  it('passes the typed version to onAdd', () => {
    const onAdd = vi.fn();
    render(<NugetPanel {...defaultProps({ onAdd })} />);
    fireEvent.change(screen.getByPlaceholderText('Package ID'), { target: { value: 'Serilog' } });
    fireEvent.change(screen.getByPlaceholderText('Version'), { target: { value: '3.1.0' } });
    fireEvent.click(document.querySelector('.nuget-add-btn'));
    expect(onAdd).toHaveBeenCalledWith('Serilog', '3.1.0');
  });

  it('passes null version when version field is empty', () => {
    const onAdd = vi.fn();
    render(<NugetPanel {...defaultProps({ onAdd })} />);
    fireEvent.change(screen.getByPlaceholderText('Package ID'), { target: { value: 'Serilog' } });
    fireEvent.click(document.querySelector('.nuget-add-btn'));
    expect(onAdd).toHaveBeenCalledWith('Serilog', null);
  });
});
