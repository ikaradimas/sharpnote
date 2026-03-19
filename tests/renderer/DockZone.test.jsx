import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DockZone } from '../../src/components/dock/DockZone.jsx';

// Avoid rendering real panel content (complex deps) in these structural tests
vi.mock('../../src/components/dock/renderPanelContent.jsx', () => ({
  renderPanelContent: () => null,
}));

// happy-dom doesn't implement ResizeObserver
beforeEach(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const makeDockLayout = ({ zone = 'left', panelId = 'log' } = {}) => ({
  assignments: { [panelId]: zone },
  zoneTab: { [zone]: panelId },
  sizes: { [zone]: 300 },
  order: { [panelId]: 0 },
  floatPos: {},
});

const defaultProps = (overrides = {}) => ({
  zone: 'left',
  dockLayout: makeDockLayout(),
  openFlags: { log: true },
  panelProps: { log: {} },
  onTabChange: vi.fn(),
  onPanelClose: vi.fn(),
  onStartDrag: vi.fn(),
  onResizeEnd: vi.fn(),
  flashingPanel: null,
  ...overrides,
});

// ── flashingPanel → CSS classes ───────────────────────────────────────────────

describe('DockZone – flashingPanel', () => {
  it('adds flashing class to the matching tab', () => {
    const { container } = render(<DockZone {...defaultProps({ flashingPanel: 'log' })} />);
    expect(container.querySelector('.dock-zone-tab').classList.contains('flashing')).toBe(true);
  });

  it('does not add flashing class when flashingPanel is null', () => {
    const { container } = render(<DockZone {...defaultProps({ flashingPanel: null })} />);
    expect(container.querySelector('.dock-zone-tab').classList.contains('flashing')).toBe(false);
  });

  it('does not add flashing class when flashingPanel targets a different panel', () => {
    const { container } = render(<DockZone {...defaultProps({ flashingPanel: 'nuget' })} />);
    expect(container.querySelector('.dock-zone-tab').classList.contains('flashing')).toBe(false);
  });

  it('adds panel-flash class to content when flashingPanel matches', () => {
    const { container } = render(<DockZone {...defaultProps({ flashingPanel: 'log' })} />);
    expect(container.querySelector('.dock-zone-content').classList.contains('panel-flash')).toBe(true);
  });

  it('does not add panel-flash class when flashingPanel is null', () => {
    const { container } = render(<DockZone {...defaultProps({ flashingPanel: null })} />);
    expect(container.querySelector('.dock-zone-content').classList.contains('panel-flash')).toBe(false);
  });
});

// ── Basic tab bar rendering ───────────────────────────────────────────────────

describe('DockZone – tab bar', () => {
  it('renders one tab per open panel', () => {
    const { container } = render(<DockZone {...defaultProps()} />);
    expect(container.querySelectorAll('.dock-zone-tab').length).toBe(1);
  });

  it('active tab has active class', () => {
    const { container } = render(<DockZone {...defaultProps()} />);
    expect(container.querySelector('.dock-zone-tab.active')).not.toBeNull();
  });

  it('close button calls onPanelClose with the panel id', () => {
    const onPanelClose = vi.fn();
    const { container } = render(<DockZone {...defaultProps({ onPanelClose })} />);
    fireEvent.click(container.querySelector('.dock-zone-tab-close'));
    expect(onPanelClose).toHaveBeenCalledWith('log');
  });

  it('clicking tab calls onTabChange with zone and panel id', () => {
    const onTabChange = vi.fn();
    const { container } = render(<DockZone {...defaultProps({ onTabChange })} />);
    fireEvent.click(container.querySelector('.dock-zone-tab'));
    expect(onTabChange).toHaveBeenCalledWith('left', 'log');
  });

  it('is hidden when no panels are open', () => {
    const { container } = render(
      <DockZone {...defaultProps({ openFlags: { log: false } })} />
    );
    expect(container.querySelector('.dock-zone-hidden')).not.toBeNull();
  });
});
