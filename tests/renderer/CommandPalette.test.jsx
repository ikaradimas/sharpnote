import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CommandPalette, PALETTE_COMMANDS } from '../../src/components/dialogs/CommandPalette.jsx';

function makeProps(overrides = {}) {
  return {
    onExecute: vi.fn(),
    onClose: vi.fn(),
    cells: [],
    onNavigateToCell: vi.fn(),
    ...overrides,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('CommandPalette — rendering', () => {
  it('renders a search input', () => {
    render(<CommandPalette {...makeProps()} />);
    expect(document.querySelector('.cmd-palette-input')).toBeInTheDocument();
  });

  it('renders three tabs (Search, Commands, Tools)', () => {
    render(<CommandPalette {...makeProps()} />);
    const tabs = document.querySelectorAll('.cmd-palette-tab');
    expect(tabs.length).toBe(3);
    expect(tabs[0].textContent).toContain('Search');
    expect(tabs[1].textContent).toContain('Commands');
    expect(tabs[2].textContent).toContain('Tools');
  });

  it('Commands tab is active by default', () => {
    render(<CommandPalette {...makeProps()} />);
    const tabs = document.querySelectorAll('.cmd-palette-tab');
    expect(tabs[1].className).toContain('active');
  });

  it('renders command items on the Commands tab', () => {
    render(<CommandPalette {...makeProps()} />);
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items.length).toBeGreaterThan(0);
  });

  it('first item is selected by default', () => {
    render(<CommandPalette {...makeProps()} />);
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items[0].className).toContain('selected');
  });
});

// ── Required commands ─────────────────────────────────────────────────────────

describe('CommandPalette — required commands present', () => {
  it('PALETTE_COMMANDS includes toggle-graph', () => {
    expect(PALETTE_COMMANDS.find((c) => c.id === 'toggle-graph')).toBeTruthy();
  });

  it('PALETTE_COMMANDS includes toggle-todo', () => {
    expect(PALETTE_COMMANDS.find((c) => c.id === 'toggle-todo')).toBeTruthy();
  });

  it('includes about command on Commands tab', () => {
    render(<CommandPalette {...makeProps()} />);
    expect(screen.getByText('About SharpNote')).toBeInTheDocument();
  });

  it('Tools tab shows panel items with icons', () => {
    render(<CommandPalette {...makeProps()} />);
    // Click the Tools tab
    fireEvent.click(document.querySelectorAll('.cmd-palette-tab')[2]);
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items.length).toBeGreaterThan(0);
    // Tools have icons
    const logsItem = [...items].find((el) => el.textContent.includes('Logs'));
    expect(logsItem).toBeTruthy();
    expect(logsItem.querySelector('.cmd-palette-icon')).not.toBeNull();
  });
});

// ── Search / filter ───────────────────────────────────────────────────────────

describe('CommandPalette — search', () => {
  it('typing switches to Search tab', () => {
    render(<CommandPalette {...makeProps({ cells: [{ id: 'c1', type: 'code', content: 'var x = 1;' }] })} />);
    fireEvent.change(document.querySelector('.cmd-palette-input'), { target: { value: 'var' } });
    const tabs = document.querySelectorAll('.cmd-palette-tab');
    expect(tabs[0].className).toContain('active');
  });

  it('shows notebook search results for matching cell content', () => {
    const cells = [
      { id: 'c1', type: 'code', content: 'var greeting = "hello";' },
      { id: 'c2', type: 'markdown', content: '# Chapter\nSome text' },
    ];
    render(<CommandPalette {...makeProps({ cells })} />);
    fireEvent.change(document.querySelector('.cmd-palette-input'), { target: { value: 'greeting' } });
    const results = document.querySelectorAll('.cmd-palette-search-result');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].textContent).toContain('greeting');
  });

  it('shows empty state when no content matches', () => {
    render(<CommandPalette {...makeProps({ cells: [{ id: 'c1', type: 'code', content: 'x' }] })} />);
    fireEvent.change(document.querySelector('.cmd-palette-input'), { target: { value: 'zzznothing' } });
    expect(screen.getByText('No matches found')).toBeInTheDocument();
  });

  it('resets selection to 0 when query changes', () => {
    render(<CommandPalette {...makeProps()} />);
    const input = document.querySelector('.cmd-palette-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.change(input, { target: { value: 'save' } });
    const items = document.querySelectorAll('.cmd-palette-item');
    if (items.length > 0) expect(items[0]?.className).toContain('selected');
  });
});

// ── Keyboard navigation ───────────────────────────────────────────────────────

describe('CommandPalette — keyboard navigation', () => {
  it('ArrowDown moves selection to next item', () => {
    render(<CommandPalette {...makeProps()} />);
    const input = document.querySelector('.cmd-palette-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items[1]?.className).toContain('selected');
  });

  it('ArrowUp moves selection to previous item', () => {
    render(<CommandPalette {...makeProps()} />);
    const input = document.querySelector('.cmd-palette-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items[0]?.className).toContain('selected');
  });

  it('Escape calls onClose', () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(document.querySelector('.cmd-palette-input'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('Enter calls onExecute with selected command id', () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(document.querySelector('.cmd-palette-input'), { key: 'Enter' });
    expect(props.onExecute).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('Tab cycles through tabs', () => {
    render(<CommandPalette {...makeProps()} />);
    const input = document.querySelector('.cmd-palette-input');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(document.querySelectorAll('.cmd-palette-tab')[2].className).toContain('active');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(document.querySelectorAll('.cmd-palette-tab')[0].className).toContain('active');
  });
});

// ── Mouse interaction ─────────────────────────────────────────────────────────

describe('CommandPalette — mouse interaction', () => {
  it('clicking an item calls onExecute with its id', () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    const items = document.querySelectorAll('.cmd-palette-item');
    fireEvent.click(items[0]);
    expect(props.onExecute).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('hovering an item updates selection', () => {
    render(<CommandPalette {...makeProps()} />);
    const items = document.querySelectorAll('.cmd-palette-item');
    if (items.length > 2) {
      fireEvent.mouseEnter(items[2]);
      expect(items[2]?.className).toContain('selected');
    }
  });

  it('clicking overlay backdrop calls onClose', () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    const overlay = document.querySelector('.cmd-palette-overlay');
    fireEvent.click(overlay);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('clicking a tab switches to it', () => {
    render(<CommandPalette {...makeProps()} />);
    fireEvent.click(document.querySelectorAll('.cmd-palette-tab')[2]); // Tools
    expect(document.querySelectorAll('.cmd-palette-tab')[2].className).toContain('active');
  });
});

// ── Categories ───────────────────────────────────────────────────────────────

describe('CommandPalette — categories', () => {
  it('Commands tab shows category headers (File, Execution, Settings)', () => {
    render(<CommandPalette {...makeProps()} />);
    const headers = document.querySelectorAll('.cmd-palette-category');
    const texts = [...headers].map((h) => h.textContent);
    expect(texts).toContain('File');
    expect(texts).toContain('Execution');
    expect(texts).toContain('Settings');
  });
});
