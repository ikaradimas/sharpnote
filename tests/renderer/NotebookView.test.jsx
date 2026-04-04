import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// Mock Toolbar to avoid its deep dependency tree (ToolsMenu portals, ThemePicker, LayoutManager)
vi.mock('../../src/components/toolbar/Toolbar.jsx', () => ({
  Toolbar: vi.fn(() => null),
}));

import { Toolbar } from '../../src/components/toolbar/Toolbar.jsx';
import { NotebookView } from '../../src/components/NotebookView.jsx';

const makeNb = (overrides = {}) => ({
  cells: [],
  outputs: {},
  running: new Set(),
  kernelStatus: 'ready',
  config: [],
  logPanelOpen: false,
  nugetPanelOpen: false,
  configPanelOpen: false,
  dbPanelOpen: false,
  varsPanelOpen: false,
  tocPanelOpen: false,
  path: null,
  title: 'Test',
  ...overrides,
});

const defaultProps = (overrides = {}) => ({
  nb: makeNb(),
  isActive: true,
  onSetNb: vi.fn(),
  onSetNbDirty: vi.fn(),
  onRunCell: vi.fn(),
  onRunAll: vi.fn(),
  onSave: vi.fn(),
  onLoad: vi.fn(),
  onReset: vi.fn(),
  onInterrupt: vi.fn(),
  onRunFrom: vi.fn(),
  onRunTo: vi.fn(),
  onRename: vi.fn(),
  libraryPanelOpen: false,
  onToggleLibrary: vi.fn(),
  filesPanelOpen: false,
  onToggleFiles: vi.fn(),
  onFocusPanel: vi.fn(),
  theme: 'dark',
  onThemeChange: vi.fn(),
  dockLayout: null,
  savedLayouts: [],
  onSaveLayout: vi.fn(),
  onLoadLayout: vi.fn(),
  onDeleteLayout: vi.fn(),
  ...overrides,
});

// Helper: get the props NotebookView passed to Toolbar after the most recent render
const getToolbarProps = () => Toolbar.mock.calls[Toolbar.mock.calls.length - 1][0];

beforeEach(() => {
  Toolbar.mockClear();
});

// ── onFocusPanel wired to panel toggles ───────────────────────────────────────

describe('NotebookView – onFocusPanel called when opening a panel', () => {
  it('calls onFocusPanel("log") when Logs toggled from closed', () => {
    const onFocusPanel = vi.fn();
    render(<NotebookView {...defaultProps({ onFocusPanel, nb: makeNb({ logPanelOpen: false }) })} />);
    getToolbarProps().onToggleLogs();
    expect(onFocusPanel).toHaveBeenCalledWith('log');
  });

  it('does not call onFocusPanel when Logs toggled from open', () => {
    const onFocusPanel = vi.fn();
    render(<NotebookView {...defaultProps({ onFocusPanel, nb: makeNb({ logPanelOpen: true }) })} />);
    getToolbarProps().onToggleLogs();
    expect(onFocusPanel).not.toHaveBeenCalled();
  });

  it('calls onFocusPanel("nuget") when Packages toggled from closed', () => {
    const onFocusPanel = vi.fn();
    render(<NotebookView {...defaultProps({ onFocusPanel, nb: makeNb({ nugetPanelOpen: false }) })} />);
    getToolbarProps().onToggleNuget();
    expect(onFocusPanel).toHaveBeenCalledWith('nuget');
  });

  it('calls onFocusPanel("config") when Config toggled from closed', () => {
    const onFocusPanel = vi.fn();
    render(<NotebookView {...defaultProps({ onFocusPanel, nb: makeNb({ configPanelOpen: false }) })} />);
    getToolbarProps().onToggleConfig();
    expect(onFocusPanel).toHaveBeenCalledWith('config');
  });

  it('calls onFocusPanel("db") when Database toggled from closed', () => {
    const onFocusPanel = vi.fn();
    render(<NotebookView {...defaultProps({ onFocusPanel, nb: makeNb({ dbPanelOpen: false }) })} />);
    getToolbarProps().onToggleDb();
    expect(onFocusPanel).toHaveBeenCalledWith('db');
  });

  it('calls onFocusPanel("vars") when Variables toggled from closed', () => {
    const onFocusPanel = vi.fn();
    render(<NotebookView {...defaultProps({ onFocusPanel, nb: makeNb({ varsPanelOpen: false }) })} />);
    getToolbarProps().onToggleVars();
    expect(onFocusPanel).toHaveBeenCalledWith('vars');
  });

  it('calls onFocusPanel("toc") when Table of Contents toggled from closed', () => {
    const onFocusPanel = vi.fn();
    render(<NotebookView {...defaultProps({ onFocusPanel, nb: makeNb({ tocPanelOpen: false }) })} />);
    getToolbarProps().onToggleToC();
    expect(onFocusPanel).toHaveBeenCalledWith('toc');
  });
});

// ── Dashboard mode ───────────────────────────────────────────────────────────

describe('NotebookView – Dashboard mode', () => {
  it('adds dashboard-mode class to .notebook when dashboardMode is true', () => {
    const { container } = render(
      <NotebookView {...defaultProps({
        dashboardMode: true,
        onToggleDashboard: vi.fn(),
        nb: makeNb({ cells: [{ id: 'c1', type: 'code', content: '' }] }),
      })} />
    );
    expect(container.querySelector('.notebook.dashboard-mode')).not.toBeNull();
  });

  it('does not add dashboard-mode class when dashboardMode is false', () => {
    const { container } = render(
      <NotebookView {...defaultProps({
        dashboardMode: false,
        onToggleDashboard: vi.fn(),
      })} />
    );
    expect(container.querySelector('.notebook.dashboard-mode')).toBeNull();
  });

  it('shows exit button when dashboardMode is true', () => {
    const { container } = render(
      <NotebookView {...defaultProps({
        dashboardMode: true,
        onToggleDashboard: vi.fn(),
        nb: makeNb({ cells: [{ id: 'c1', type: 'code', content: '' }] }),
      })} />
    );
    const btn = container.querySelector('.dashboard-exit-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Exit Dashboard');
  });

  it('clicking exit button calls onToggleDashboard', () => {
    const onToggleDashboard = vi.fn();
    const { container } = render(
      <NotebookView {...defaultProps({
        dashboardMode: true,
        onToggleDashboard,
        nb: makeNb({ cells: [{ id: 'c1', type: 'code', content: '' }] }),
      })} />
    );
    container.querySelector('.dashboard-exit-btn').click();
    expect(onToggleDashboard).toHaveBeenCalledTimes(1);
  });

  it('hides AddBar components when dashboardMode is true', () => {
    const { container } = render(
      <NotebookView {...defaultProps({
        dashboardMode: true,
        onToggleDashboard: vi.fn(),
        nb: makeNb({ cells: [{ id: 'c1', type: 'code', content: '' }] }),
      })} />
    );
    expect(container.querySelector('.cell-add-bar')).toBeNull();
  });
});

// ── toggle also calls onSetNb ─────────────────────────────────────────────────

describe('NotebookView – toggle always calls onSetNb', () => {
  it('calls onSetNb when Logs is toggled (either direction)', () => {
    const onSetNb = vi.fn();
    render(<NotebookView {...defaultProps({ onSetNb, nb: makeNb({ logPanelOpen: false }) })} />);
    getToolbarProps().onToggleLogs();
    expect(onSetNb).toHaveBeenCalled();
  });
});
