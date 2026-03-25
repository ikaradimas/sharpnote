import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CommandPalette, PALETTE_COMMANDS } from '../../src/components/dialogs/CommandPalette.jsx';

function makeProps(overrides = {}) {
  return {
    onExecute: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('CommandPalette — rendering', () => {
  it('renders a search input', () => {
    render(<CommandPalette {...makeProps()} />);
    expect(document.querySelector('.cmd-palette-input')).toBeInTheDocument();
  });

  it('renders the full command list when query is empty', () => {
    render(<CommandPalette {...makeProps()} />);
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items.length).toBe(PALETTE_COMMANDS.length);
  });

  it('first item is selected by default', () => {
    render(<CommandPalette {...makeProps()} />);
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items[0].className).toContain('selected');
  });
});

// ── Required commands ─────────────────────────────────────────────────────────

describe('CommandPalette — required commands present', () => {
  it('includes toggle-graph command', () => {
    render(<CommandPalette {...makeProps()} />);
    expect(screen.getByText('Toggle Graph Panel')).toBeInTheDocument();
  });

  it('includes toggle-todo command', () => {
    render(<CommandPalette {...makeProps()} />);
    expect(screen.getByText('Toggle To Do Panel')).toBeInTheDocument();
  });

  it('includes about command', () => {
    render(<CommandPalette {...makeProps()} />);
    expect(screen.getByText('About SharpNote')).toBeInTheDocument();
  });

  it('toggle-config shows ⌘⇧, key binding', () => {
    render(<CommandPalette {...makeProps()} />);
    const item = [...document.querySelectorAll('.cmd-palette-item')].find(
      (el) => el.querySelector('.cmd-palette-label')?.textContent === 'Toggle Config Panel'
    );
    expect(item?.querySelector('.cmd-palette-keys')?.textContent).toBe('⌘⇧,');
  });

  it('toggle-graph shows ⌘⇧R key binding', () => {
    render(<CommandPalette {...makeProps()} />);
    const item = [...document.querySelectorAll('.cmd-palette-item')].find(
      (el) => el.querySelector('.cmd-palette-label')?.textContent === 'Toggle Graph Panel'
    );
    expect(item?.querySelector('.cmd-palette-keys')?.textContent).toBe('⌘⇧R');
  });

  it('toggle-todo shows ⌘⇧O key binding', () => {
    render(<CommandPalette {...makeProps()} />);
    const item = [...document.querySelectorAll('.cmd-palette-item')].find(
      (el) => el.querySelector('.cmd-palette-label')?.textContent === 'Toggle To Do Panel'
    );
    expect(item?.querySelector('.cmd-palette-keys')?.textContent).toBe('⌘⇧O');
  });
});

// ── Search / filter ───────────────────────────────────────────────────────────

describe('CommandPalette — search', () => {
  it('filters commands by label substring', () => {
    render(<CommandPalette {...makeProps()} />);
    fireEvent.change(document.querySelector('.cmd-palette-input'), { target: { value: 'graph' } });
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items.length).toBeGreaterThan(0);
    [...items].forEach((item) => {
      expect(item.textContent.toLowerCase()).toContain('graph');
    });
  });

  it('shows empty state when no commands match', () => {
    render(<CommandPalette {...makeProps()} />);
    fireEvent.change(document.querySelector('.cmd-palette-input'), { target: { value: 'zzznothing' } });
    expect(screen.getByText('No commands found')).toBeInTheDocument();
  });

  it('resets selection to 0 when query changes', () => {
    render(<CommandPalette {...makeProps()} />);
    const input = document.querySelector('.cmd-palette-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.change(input, { target: { value: 'save' } });
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items[0]?.className).toContain('selected');
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
    expect(items[0]?.className).not.toContain('selected');
  });

  it('ArrowUp moves selection to previous item', () => {
    render(<CommandPalette {...makeProps()} />);
    const input = document.querySelector('.cmd-palette-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items[0]?.className).toContain('selected');
  });

  it('ArrowDown does not go past last item', () => {
    render(<CommandPalette {...makeProps()} />);
    const input = document.querySelector('.cmd-palette-input');
    for (let i = 0; i < PALETTE_COMMANDS.length + 5; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    const items = document.querySelectorAll('.cmd-palette-item');
    expect(items[items.length - 1]?.className).toContain('selected');
  });

  it('Escape calls onClose', () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(document.querySelector('.cmd-palette-input'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('Enter calls onExecute with selected command id and then onClose', () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    fireEvent.keyDown(document.querySelector('.cmd-palette-input'), { key: 'Enter' });
    expect(props.onExecute).toHaveBeenCalledWith(PALETTE_COMMANDS[0].id);
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});

// ── Mouse interaction ─────────────────────────────────────────────────────────

describe('CommandPalette — mouse interaction', () => {
  it('clicking an item calls onExecute with its id', () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    const items = document.querySelectorAll('.cmd-palette-item');
    fireEvent.click(items[0]);
    expect(props.onExecute).toHaveBeenCalledWith(PALETTE_COMMANDS[0].id);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('hovering an item updates selection', () => {
    render(<CommandPalette {...makeProps()} />);
    const items = document.querySelectorAll('.cmd-palette-item');
    fireEvent.mouseEnter(items[2]);
    expect(items[2]?.className).toContain('selected');
  });

  it('clicking overlay backdrop calls onClose', () => {
    const props = makeProps();
    render(<CommandPalette {...props} />);
    const overlay = document.querySelector('.cmd-palette-overlay');
    fireEvent.click(overlay);
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});
