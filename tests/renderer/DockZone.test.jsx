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

// ── Scroll buttons ─────────────────────────────────────────────────────────────

// Helper: configure scrollLeft/clientWidth/scrollWidth on the tabbar element,
// then fire a scroll event so the component reads the new values and shows/hides buttons.
const simulateOverflow = (tabbar, { scrollLeft, clientWidth, scrollWidth }) => {
  Object.defineProperty(tabbar, 'scrollLeft', { get: () => scrollLeft, configurable: true });
  Object.defineProperty(tabbar, 'clientWidth', { get: () => clientWidth, configurable: true });
  Object.defineProperty(tabbar, 'scrollWidth', { get: () => scrollWidth, configurable: true });
  fireEvent.scroll(tabbar);
};

describe('DockZone – scroll buttons', () => {
  it('no scroll buttons when tabs fit without overflow', () => {
    const { container } = render(<DockZone {...defaultProps()} />);
    const tabbar = container.querySelector('.dock-zone-tabbar');
    simulateOverflow(tabbar, { scrollLeft: 0, clientWidth: 300, scrollWidth: 300 });
    expect(container.querySelector('.dock-zone-scroll-btn')).toBeNull();
  });

  it('shows right button when content overflows to the right', () => {
    const { container } = render(<DockZone {...defaultProps()} />);
    const tabbar = container.querySelector('.dock-zone-tabbar');
    simulateOverflow(tabbar, { scrollLeft: 0, clientWidth: 100, scrollWidth: 300 });
    expect(container.querySelector('.dock-zone-scroll-btn.scroll-right')).not.toBeNull();
    expect(container.querySelector('.dock-zone-scroll-btn.scroll-left')).toBeNull();
  });

  it('shows left button when scrolled right', () => {
    const { container } = render(<DockZone {...defaultProps()} />);
    const tabbar = container.querySelector('.dock-zone-tabbar');
    simulateOverflow(tabbar, { scrollLeft: 50, clientWidth: 100, scrollWidth: 200 });
    expect(container.querySelector('.dock-zone-scroll-btn.scroll-left')).not.toBeNull();
  });

  it('shows both buttons when scrolled into the middle', () => {
    const { container } = render(<DockZone {...defaultProps()} />);
    const tabbar = container.querySelector('.dock-zone-tabbar');
    simulateOverflow(tabbar, { scrollLeft: 50, clientWidth: 100, scrollWidth: 300 });
    expect(container.querySelector('.dock-zone-scroll-btn.scroll-left')).not.toBeNull();
    expect(container.querySelector('.dock-zone-scroll-btn.scroll-right')).not.toBeNull();
  });

  it('clicking right button calls scrollBy({ left: 120 })', () => {
    const { container } = render(<DockZone {...defaultProps()} />);
    const tabbar = container.querySelector('.dock-zone-tabbar');
    tabbar.scrollBy = vi.fn();
    simulateOverflow(tabbar, { scrollLeft: 0, clientWidth: 100, scrollWidth: 300 });
    fireEvent.click(container.querySelector('.dock-zone-scroll-btn.scroll-right'));
    expect(tabbar.scrollBy).toHaveBeenCalledWith({ left: 120, behavior: 'smooth' });
  });

  it('clicking left button calls scrollBy({ left: -120 })', () => {
    const { container } = render(<DockZone {...defaultProps()} />);
    const tabbar = container.querySelector('.dock-zone-tabbar');
    tabbar.scrollBy = vi.fn();
    simulateOverflow(tabbar, { scrollLeft: 50, clientWidth: 100, scrollWidth: 200 });
    fireEvent.click(container.querySelector('.dock-zone-scroll-btn.scroll-left'));
    expect(tabbar.scrollBy).toHaveBeenCalledWith({ left: -120, behavior: 'smooth' });
  });
});
