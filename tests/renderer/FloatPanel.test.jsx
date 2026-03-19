import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FloatPanel } from '../../src/components/dock/FloatPanel.jsx';

const defaultProps = (overrides = {}) => ({
  panelId: 'log',
  pos: { x: 100, y: 100, w: 400, h: 300 },
  onMove: vi.fn(),
  onClose: vi.fn(),
  onStartDrag: vi.fn(),
  flashing: false,
  children: null,
  ...overrides,
});

describe('FloatPanel – flashing prop', () => {
  it('adds flashing class when flashing=true', () => {
    const { container } = render(<FloatPanel {...defaultProps({ flashing: true })} />);
    expect(container.querySelector('.float-panel').classList.contains('flashing')).toBe(true);
  });

  it('does not add flashing class when flashing=false', () => {
    const { container } = render(<FloatPanel {...defaultProps({ flashing: false })} />);
    expect(container.querySelector('.float-panel').classList.contains('flashing')).toBe(false);
  });

  it('does not add flashing class when flashing is omitted', () => {
    const { flashing: _, ...propsWithoutFlashing } = defaultProps();
    const { container } = render(<FloatPanel {...propsWithoutFlashing} />);
    expect(container.querySelector('.float-panel').classList.contains('flashing')).toBe(false);
  });
});

describe('FloatPanel – close button', () => {
  it('calls onClose with panelId when close button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<FloatPanel {...defaultProps({ onClose })} />);
    container.querySelector('.dock-zone-tab-close').click();
    expect(onClose).toHaveBeenCalledWith('log');
  });
});
