import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettingsDialog } from '../../src/components/dialogs/SettingsDialog.jsx';

// ── Setup ──────────────────────────────────────────────────────────────────────

const MOCK_PATHS = {
  userData: '/home/user/.config/SharpNote',
  documents: '/home/user/Documents',
  library: '/home/user/Documents/SharpNote Notebooks/Library',
  logs: '/home/user/.config/SharpNote/logs',
};

function makeProps(overrides = {}) {
  return {
    theme: 'kl1nt',
    fontSize: 12.6,
    onThemeChange: vi.fn(),
    onFontSizeChange: vi.fn(),
    panelFontSize: 11.5,
    onPanelFontSizeChange: vi.fn(),
    pinnedPaths: new Set(),
    onUnpin: vi.fn(),
    onExport: vi.fn().mockResolvedValue({ success: true }),
    onImport: vi.fn().mockResolvedValue({ success: true }),
    onClose: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  window.electronAPI = {
    getAppPaths: vi.fn().mockResolvedValue(MOCK_PATHS),
    fsOpenPath: vi.fn(),
    setFontSize: vi.fn(),
  };
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('SettingsDialog rendering', () => {
  it('renders the sidebar with all section buttons', () => {
    render(<SettingsDialog {...makeProps()} />);
    const btns = document.querySelectorAll('.settings-section-btn');
    const labels = [...btns].map((b) => b.textContent);
    expect(labels).toContain('Appearance');
    expect(labels).toContain('Paths');
    expect(labels).toContain('Startup');
    expect(labels).toContain('Shortcuts');
  });

  it('shows Appearance section by default', () => {
    render(<SettingsDialog {...makeProps()} />);
    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('kl1nt')).toBeInTheDocument(); // theme tile
  });

  it('renders close button', () => {
    render(<SettingsDialog {...makeProps()} />);
    expect(screen.getByTitle('Close')).toBeInTheDocument();
  });
});

// ── Navigation ────────────────────────────────────────────────────────────────

describe('section navigation', () => {
  it('switches to Paths section on click', async () => {
    render(<SettingsDialog {...makeProps()} />);
    const pathsBtn = [...document.querySelectorAll('.settings-section-btn')].find((b) => b.textContent === 'Paths');
    fireEvent.click(pathsBtn);
    await waitFor(() => {
      expect(screen.getByText('Code Library')).toBeInTheDocument();
    });
  });

  it('switches to Startup section on click', () => {
    render(<SettingsDialog {...makeProps()} />);
    const startupBtn = [...document.querySelectorAll('.settings-section-btn')].find((b) => b.textContent === 'Startup');
    fireEvent.click(startupBtn);
    expect(screen.getByText('Pinned Notebooks')).toBeInTheDocument();
  });

  it('marks the active section button', () => {
    render(<SettingsDialog {...makeProps()} />);
    const btn = screen.getAllByRole('button').find((b) => b.textContent === 'Appearance');
    expect(btn?.className).toContain('active');
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe('close behaviour', () => {
  it('calls onClose when close button is clicked', () => {
    const props = makeProps();
    render(<SettingsDialog {...props} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay backdrop is clicked', () => {
    const props = makeProps();
    const { container } = render(<SettingsDialog {...props} />);
    const overlay = container.querySelector('.settings-overlay');
    fireEvent.click(overlay);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking inside the dialog', () => {
    const props = makeProps();
    const { container } = render(<SettingsDialog {...props} />);
    const dialog = container.querySelector('.settings-dialog');
    fireEvent.click(dialog);
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

// ── Appearance — font size ────────────────────────────────────────────────────

describe('font size slider', () => {
  it('shows current font size value', () => {
    render(<SettingsDialog {...makeProps({ fontSize: 14 })} />);
    expect(screen.getByText('14.0 px')).toBeInTheDocument();
  });

  it('slider has correct min/max', () => {
    render(<SettingsDialog {...makeProps()} />);
    const slider = screen.getAllByRole('slider')[0];
    expect(slider).toHaveAttribute('min', '10');
    expect(slider).toHaveAttribute('max', '28');
  });

  it('calls onFontSizeChange when slider moves', () => {
    const props = makeProps();
    render(<SettingsDialog {...props} />);
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '16' } });
    expect(props.onFontSizeChange).toHaveBeenCalledWith(16);
  });

  it('calls onFontSizeChange with 12.6 when Reset is clicked', () => {
    const props = makeProps({ fontSize: 20 });
    render(<SettingsDialog {...props} />);
    fireEvent.click(screen.getAllByText('Reset')[0]);
    expect(props.onFontSizeChange).toHaveBeenCalledWith(12.6);
  });

  it('font preview text is present', () => {
    render(<SettingsDialog {...makeProps()} />);
    expect(screen.getByText('The quick brown fox')).toBeInTheDocument();
  });
});

// ── Appearance — panel font size ──────────────────────────────────────────────

describe('panel font size slider', () => {
  it('shows current panel font size value', () => {
    render(<SettingsDialog {...makeProps({ panelFontSize: 14 })} />);
    expect(screen.getByText('14.0 px')).toBeInTheDocument();
  });

  it('panel slider has correct min/max', () => {
    render(<SettingsDialog {...makeProps()} />);
    const sliders = screen.getAllByRole('slider');
    const panelSlider = sliders[1]; // second slider is panel font size
    expect(panelSlider).toHaveAttribute('min', '8');
    expect(panelSlider).toHaveAttribute('max', '18');
  });

  it('calls onPanelFontSizeChange when panel slider moves', () => {
    const props = makeProps();
    render(<SettingsDialog {...props} />);
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[1], { target: { value: '13' } });
    expect(props.onPanelFontSizeChange).toHaveBeenCalledWith(13);
  });

  it('calls onPanelFontSizeChange with 11.5 when panel Reset is clicked', () => {
    const props = makeProps({ panelFontSize: 16 });
    render(<SettingsDialog {...props} />);
    const resetBtns = screen.getAllByText('Reset');
    fireEvent.click(resetBtns[1]); // second Reset is panel font size
    expect(props.onPanelFontSizeChange).toHaveBeenCalledWith(11.5);
  });
});

// ── Appearance — theme picker ─────────────────────────────────────────────────

describe('theme picker', () => {
  it('renders all eight theme tiles', () => {
    render(<SettingsDialog {...makeProps()} />);
    // kl1nt, Nord, Dracula, Tokyo Night, Monokai, Catppuccin, Solarized Dark, GitHub Light
    expect(screen.getByText('Nord')).toBeInTheDocument();
    expect(screen.getByText('Dracula')).toBeInTheDocument();
    expect(screen.getByText('GitHub Light')).toBeInTheDocument();
  });

  it('active theme tile has "active" class', () => {
    render(<SettingsDialog {...makeProps({ theme: 'nord' })} />);
    const tiles = document.querySelectorAll('.settings-theme-tile');
    const nord = [...tiles].find((t) => t.textContent.includes('Nord'));
    expect(nord?.className).toContain('active');
  });

  it('calls onThemeChange when a theme tile is clicked', () => {
    const props = makeProps();
    render(<SettingsDialog {...props} />);
    const tiles = document.querySelectorAll('.settings-theme-tile');
    const dracula = [...tiles].find((t) => t.textContent.includes('Dracula'));
    fireEvent.click(dracula);
    expect(props.onThemeChange).toHaveBeenCalledWith('dracula');
  });
});

// ── Paths section ─────────────────────────────────────────────────────────────

describe('Paths section', () => {
  function clickPathsBtn() {
    const btn = [...document.querySelectorAll('.settings-section-btn')].find((b) => b.textContent === 'Paths');
    fireEvent.click(btn);
  }

  it('shows path rows after app paths load', async () => {
    render(<SettingsDialog {...makeProps()} />);
    clickPathsBtn();
    await waitFor(() => {
      expect(screen.getByText('Code Library')).toBeInTheDocument();
      expect(screen.getByText('User Data')).toBeInTheDocument();
      expect(screen.getByText('Logs')).toBeInTheDocument();
    });
  });

  it('shows actual path strings', async () => {
    render(<SettingsDialog {...makeProps()} />);
    clickPathsBtn();
    await waitFor(() => {
      expect(screen.getByText(MOCK_PATHS.library)).toBeInTheDocument();
    });
  });

  it('calls fsOpenPath when open button is clicked', async () => {
    render(<SettingsDialog {...makeProps()} />);
    clickPathsBtn();
    await waitFor(() => screen.getByText(MOCK_PATHS.library));
    const openBtns = screen.getAllByTitle('Open in Finder / Explorer');
    fireEvent.click(openBtns[0]);
    expect(window.electronAPI.fsOpenPath).toHaveBeenCalledWith(MOCK_PATHS.library);
  });
});

// ── Startup section ───────────────────────────────────────────────────────────

function clickStartupBtn() {
  const btn = [...document.querySelectorAll('.settings-section-btn')].find((b) => b.textContent === 'Startup');
  fireEvent.click(btn);
}

describe('Startup section — no pinned notebooks', () => {
  it('shows empty state message when no paths pinned', () => {
    render(<SettingsDialog {...makeProps({ pinnedPaths: new Set() })} />);
    clickStartupBtn();
    expect(screen.getByText('No notebooks pinned yet.')).toBeInTheDocument();
  });
});

describe('Startup section — with pinned notebooks', () => {
  const pinned = new Set([
    '/home/user/notebooks/work.cnb',
    '/home/user/notebooks/scratch.cnb',
  ]);

  it('renders each pinned notebook by filename', () => {
    render(<SettingsDialog {...makeProps({ pinnedPaths: pinned })} />);
    clickStartupBtn();
    expect(screen.getByText('work')).toBeInTheDocument();
    expect(screen.getByText('scratch')).toBeInTheDocument();
  });

  it('renders full paths', () => {
    render(<SettingsDialog {...makeProps({ pinnedPaths: pinned })} />);
    clickStartupBtn();
    expect(screen.getByText('/home/user/notebooks/work.cnb')).toBeInTheDocument();
  });

  it('calls onUnpin with the path when unpin button is clicked', () => {
    const props = makeProps({ pinnedPaths: pinned });
    render(<SettingsDialog {...props} />);
    clickStartupBtn();
    const unpinBtns = screen.getAllByTitle('Unpin this notebook');
    fireEvent.click(unpinBtns[0]);
    expect(props.onUnpin).toHaveBeenCalledWith('/home/user/notebooks/work.cnb');
  });
});

// ── Shortcuts section ──────────────────────────────────────────────────────────

describe('Shortcuts section', () => {
  function clickShortcutsBtn() {
    const btn = [...document.querySelectorAll('.settings-section-btn')].find((b) => b.textContent === 'Shortcuts');
    fireEvent.click(btn);
  }

  it('switches to Shortcuts section on click', () => {
    render(<SettingsDialog {...makeProps()} />);
    clickShortcutsBtn();
    // ShortcutsSection renders .shortcuts-table
    expect(document.querySelector('.shortcuts-table')).toBeInTheDocument();
  });

  it('renders keyboard shortcut entries with kbd elements', () => {
    render(<SettingsDialog {...makeProps()} />);
    clickShortcutsBtn();
    expect(document.querySelectorAll('kbd').length).toBeGreaterThan(0);
  });

  it('renders at least one shortcut group heading', () => {
    render(<SettingsDialog {...makeProps()} />);
    clickShortcutsBtn();
    expect(document.querySelector('.settings-group-label')).toBeInTheDocument();
  });
});

// ── Appearance — lintEnabled toggle ──────────────────────────────────────────

describe('Appearance — lintEnabled toggle', () => {
  it('renders the linter toggle checkbox', () => {
    render(<SettingsDialog {...makeProps({ lintEnabled: true, onLintEnabledChange: vi.fn() })} />);
    expect(screen.getByText(/Code diagnostics/)).toBeInTheDocument();
  });

  it('checkbox is checked when lintEnabled=true', () => {
    render(<SettingsDialog {...makeProps({ lintEnabled: true, onLintEnabledChange: vi.fn() })} />);
    const checkboxes = document.querySelectorAll('.settings-toggle-row input[type="checkbox"]');
    const lintBox = [...checkboxes].find((cb) => cb.closest('.settings-toggle-row')?.textContent?.includes('Code diagnostics'));
    expect(lintBox?.checked).toBe(true);
  });

  it('checkbox is unchecked when lintEnabled=false', () => {
    render(<SettingsDialog {...makeProps({ lintEnabled: false, onLintEnabledChange: vi.fn() })} />);
    const checkboxes = document.querySelectorAll('.settings-toggle-row input[type="checkbox"]');
    const lintBox = [...checkboxes].find((cb) => cb.closest('.settings-toggle-row')?.textContent?.includes('Code diagnostics'));
    expect(lintBox?.checked).toBe(false);
  });

  it('calls onLintEnabledChange(false) when unchecked', () => {
    const onLintChange = vi.fn();
    render(<SettingsDialog {...makeProps({ lintEnabled: true, onLintEnabledChange: onLintChange })} />);
    const checkboxes = document.querySelectorAll('.settings-toggle-row input[type="checkbox"]');
    const lintBox = [...checkboxes].find((cb) => cb.closest('.settings-toggle-row')?.textContent?.includes('Code diagnostics'));
    fireEvent.click(lintBox);
    expect(onLintChange).toHaveBeenCalledWith(false);
  });

  it('calls onLintEnabledChange(true) when checked', () => {
    const onLintChange = vi.fn();
    render(<SettingsDialog {...makeProps({ lintEnabled: false, onLintEnabledChange: onLintChange })} />);
    const checkboxes = document.querySelectorAll('.settings-toggle-row input[type="checkbox"]');
    const lintBox = [...checkboxes].find((cb) => cb.closest('.settings-toggle-row')?.textContent?.includes('Code diagnostics'));
    fireEvent.click(lintBox);
    expect(onLintChange).toHaveBeenCalledWith(true);
  });
});

// ── Shortcuts — search ────────────────────────────────────────────────────────

describe('Shortcuts section — search', () => {
  function openShortcuts() {
    const btn = [...document.querySelectorAll('.settings-section-btn')].find((b) => b.textContent === 'Shortcuts');
    fireEvent.click(btn);
  }

  it('renders a search input in the Shortcuts section', () => {
    render(<SettingsDialog {...makeProps()} />);
    openShortcuts();
    expect(document.querySelector('.shortcuts-search')).toBeInTheDocument();
  });

  it('search filters shortcuts by description', () => {
    render(<SettingsDialog {...makeProps()} />);
    openShortcuts();
    const search = document.querySelector('.shortcuts-search');
    fireEvent.change(search, { target: { value: 'graph' } });
    expect(screen.getByText('Graph panel')).toBeInTheDocument();
    // unrelated shortcut should not appear
    expect(screen.queryByText('New notebook')).toBeNull();
  });

  it('shows empty state when search matches nothing', () => {
    render(<SettingsDialog {...makeProps()} />);
    openShortcuts();
    fireEvent.change(document.querySelector('.shortcuts-search'), { target: { value: 'zzznothing' } });
    expect(screen.getByText('No shortcuts found')).toBeInTheDocument();
  });

  it('clearing search restores all groups', () => {
    render(<SettingsDialog {...makeProps()} />);
    openShortcuts();
    const search = document.querySelector('.shortcuts-search');
    fireEvent.change(search, { target: { value: 'graph' } });
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByText('New notebook')).toBeInTheDocument();
    expect(screen.getByText('Graph panel')).toBeInTheDocument();
  });
});

// ── Shortcuts — custom bindings + edit/reset ──────────────────────────────────

describe('Shortcuts section — custom bindings and edit/reset', () => {
  function openShortcuts() {
    const btn = [...document.querySelectorAll('.settings-section-btn')].find((b) => b.textContent === 'Shortcuts');
    fireEvent.click(btn);
  }

  it('displays custom shortcut binding instead of default when provided', () => {
    render(<SettingsDialog {...makeProps({ customShortcuts: { 'panel-graph': 'Ctrl+G' } })} />);
    openShortcuts();
    // Should show kbd elements for Ctrl and G
    const kbds = [...document.querySelectorAll('kbd')].map((k) => k.textContent);
    expect(kbds).toContain('G');
  });

  it('edit button (✎) is visible on hover for reassignable shortcuts', () => {
    render(<SettingsDialog {...makeProps()} />);
    openShortcuts();
    // Edit buttons exist in DOM (visibility is CSS-only)
    expect(document.querySelectorAll('.shortcut-edit-btn').length).toBeGreaterThan(0);
  });

  it('clicking edit button shows capture mode text', () => {
    render(<SettingsDialog {...makeProps()} />);
    openShortcuts();
    const editBtn = document.querySelector('.shortcut-edit-btn');
    fireEvent.click(editBtn);
    expect(screen.getByText('Press a key combination…')).toBeInTheDocument();
  });

  it('pressing Escape in capture mode cancels without calling onShortcutsChange', () => {
    const onShortcuts = vi.fn();
    render(<SettingsDialog {...makeProps({ onShortcutsChange: onShortcuts })} />);
    openShortcuts();
    const editBtn = document.querySelector('.shortcut-edit-btn');
    fireEvent.click(editBtn);
    const capture = screen.getByText('Press a key combination…');
    fireEvent.keyDown(capture, { key: 'Escape' });
    expect(onShortcuts).not.toHaveBeenCalled();
    expect(screen.queryByText('Press a key combination…')).toBeNull();
  });

  it('pressing a key combo in capture mode calls onShortcutsChange with the new binding', () => {
    const onShortcuts = vi.fn();
    render(<SettingsDialog {...makeProps({ onShortcutsChange: onShortcuts })} />);
    openShortcuts();
    fireEvent.click(document.querySelector('.shortcut-edit-btn'));
    const capture = screen.getByText('Press a key combination…');
    fireEvent.keyDown(capture, { key: 'R', ctrlKey: true, shiftKey: true });
    expect(onShortcuts).toHaveBeenCalledWith(expect.any(String), 'Ctrl+Shift+R');
  });

  it('reset button (↺) is only shown when a custom shortcut override exists', () => {
    render(<SettingsDialog {...makeProps({ customShortcuts: {} })} />);
    openShortcuts();
    expect(document.querySelectorAll('.shortcut-reset-btn').length).toBe(0);
  });

  it('reset button appears when customShortcuts has an entry', () => {
    render(<SettingsDialog {...makeProps({ customShortcuts: { 'panel-graph': 'Ctrl+G' } })} />);
    openShortcuts();
    expect(document.querySelectorAll('.shortcut-reset-btn').length).toBe(1);
  });

  it('clicking reset button calls onShortcutsChange(id, null)', () => {
    const onShortcuts = vi.fn();
    render(<SettingsDialog {...makeProps({ customShortcuts: { 'panel-graph': 'Ctrl+G' }, onShortcutsChange: onShortcuts })} />);
    openShortcuts();
    fireEvent.click(document.querySelector('.shortcut-reset-btn'));
    expect(onShortcuts).toHaveBeenCalledWith('panel-graph', null);
  });
});

// ── Export / Import buttons ───────────────────────────────────────────────────

describe('Export / Import buttons', () => {
  it('renders Export… and Import… buttons', () => {
    render(<SettingsDialog {...makeProps()} />);
    expect(screen.getByTitle('Export all settings to a JSON file')).toBeInTheDocument();
    expect(screen.getByTitle('Import settings from a JSON file')).toBeInTheDocument();
  });

  it('calls onExport when Export… is clicked', async () => {
    const props = makeProps();
    render(<SettingsDialog {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Export all settings to a JSON file'));
    });
    expect(props.onExport).toHaveBeenCalledOnce();
  });

  it('calls onImport when Import… is clicked', async () => {
    const props = makeProps();
    render(<SettingsDialog {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Import settings from a JSON file'));
    });
    expect(props.onImport).toHaveBeenCalledOnce();
  });

  it('shows success status after successful export', async () => {
    const props = makeProps({ onExport: vi.fn().mockResolvedValue({ success: true }) });
    render(<SettingsDialog {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Export all settings to a JSON file'));
    });
    await waitFor(() => {
      expect(screen.getByText('Settings exported.')).toBeInTheDocument();
    });
  });

  it('shows success status after successful import', async () => {
    const props = makeProps({ onImport: vi.fn().mockResolvedValue({ success: true }) });
    render(<SettingsDialog {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Import settings from a JSON file'));
    });
    await waitFor(() => {
      expect(screen.getByText('Settings imported.')).toBeInTheDocument();
    });
  });

  it('shows error status when export returns an error', async () => {
    const props = makeProps({ onExport: vi.fn().mockResolvedValue({ success: false, error: 'Disk full' }) });
    render(<SettingsDialog {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Export all settings to a JSON file'));
    });
    await waitFor(() => {
      expect(screen.getByText('Disk full')).toBeInTheDocument();
    });
  });

  it('shows no status when export is cancelled (success: false, no error)', async () => {
    const props = makeProps({ onExport: vi.fn().mockResolvedValue({ success: false }) });
    render(<SettingsDialog {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Export all settings to a JSON file'));
    });
    expect(document.querySelector('.settings-status')).toBeNull();
  });
});
