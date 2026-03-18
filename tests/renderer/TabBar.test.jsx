import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '../../src/renderer.jsx';

const makeNb = (overrides = {}) => ({
  id: 'nb-1',
  title: 'My Notebook',
  path: null,
  isDirty: false,
  color: null,
  ...overrides,
});

const defaultProps = (overrides = {}) => ({
  notebooks: [makeNb()],
  activeId: 'nb-1',
  onActivate: vi.fn(),
  onClose: vi.fn(),
  onNew: vi.fn(),
  onRename: vi.fn(),
  onReorder: vi.fn(),
  onSetColor: vi.fn(),
  activeTabColor: null,
  docsOpen: false,
  onActivateDocs: vi.fn(),
  onCloseDocs: vi.fn(),
  libEditors: [],
  onCloseLibEditor: vi.fn(),
  pinnedPaths: new Set(),
  onTogglePin: vi.fn(),
  ...overrides,
});

describe('TabBar – active tab', () => {
  it('active tab has tab-active class', () => {
    render(<TabBar {...defaultProps()} />);
    const activeTabs = document.querySelectorAll('.tab-active');
    expect(activeTabs.length).toBeGreaterThan(0);
  });

  it('inactive tab does not have tab-active class when different activeId', () => {
    const notebooks = [makeNb({ id: 'nb-1' }), makeNb({ id: 'nb-2', title: 'Second' })];
    render(<TabBar {...defaultProps({ notebooks, activeId: 'nb-1' })} />);
    const tabs = document.querySelectorAll('.tab');
    // At least one tab should not be active
    const inactiveTabs = Array.from(tabs).filter((t) => !t.classList.contains('tab-active'));
    expect(inactiveTabs.length).toBeGreaterThan(0);
  });
});

describe('TabBar – close button', () => {
  it('close button fires onClose with notebook id', () => {
    const onClose = vi.fn();
    render(<TabBar {...defaultProps({ onClose })} />);
    const closeBtn = document.querySelector('.tab-close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledWith('nb-1');
  });
});

describe('TabBar – rename', () => {
  it('double-clicking title switches to rename input', () => {
    render(<TabBar {...defaultProps()} />);
    const title = screen.getByText('My Notebook');
    fireEvent.dblClick(title);
    expect(document.querySelector('.tab-rename-input')).not.toBeNull();
  });
});

describe('TabBar – dirty indicator', () => {
  it('shows dirty indicator when isDirty=true', () => {
    const notebooks = [makeNb({ isDirty: true })];
    render(<TabBar {...defaultProps({ notebooks })} />);
    expect(document.querySelector('.tab-dirty')).not.toBeNull();
  });

  it('does not show dirty indicator when isDirty=false', () => {
    render(<TabBar {...defaultProps()} />);
    expect(document.querySelector('.tab-dirty')).toBeNull();
  });
});

describe('TabBar – pin button', () => {
  it('pin button fires onTogglePin when notebook has a path', () => {
    const onTogglePin = vi.fn();
    const notebooks = [makeNb({ path: '/some/path.cnb' })];
    render(<TabBar {...defaultProps({ notebooks, onTogglePin })} />);
    const pinBtn = document.querySelector('.tab-pin-btn');
    expect(pinBtn).not.toBeNull();
    fireEvent.click(pinBtn);
    expect(onTogglePin).toHaveBeenCalledWith('/some/path.cnb');
  });
});
