import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TodoPanel } from '../../src/renderer.jsx';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCell(id, content, type = 'code') {
  return { id, type, content };
}

// ── Empty state ────────────────────────────────────────────────────────────────

describe('TodoPanel — empty state', () => {
  it('shows empty message when no cells', () => {
    render(<TodoPanel cells={[]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText(/No TODOs, FIXMEs, or BUGs/)).toBeInTheDocument();
  });

  it('shows empty message when cells have no comments', () => {
    render(<TodoPanel cells={[makeCell('a1b2c3d4', 'var x = 1;')]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText(/No TODOs, FIXMEs, or BUGs/)).toBeInTheDocument();
  });

  it('ignores markdown cells', () => {
    render(<TodoPanel cells={[makeCell('a1b2c3d4', '// TODO: fix this', 'markdown')]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText(/No TODOs, FIXMEs, or BUGs/)).toBeInTheDocument();
  });

  it('shows count of 0 in header', () => {
    render(<TodoPanel cells={[]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

// ── TODO extraction ────────────────────────────────────────────────────────────

describe('TodoPanel — comment extraction', () => {
  it('extracts a TODO comment', () => {
    render(<TodoPanel cells={[makeCell('a1b2c3d4', '// TODO: fix the thing')]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('fix the thing')).toBeInTheDocument();
    expect(document.querySelector('.todo-tag-todo')).toBeInTheDocument();
  });

  it('extracts a FIXME comment', () => {
    render(<TodoPanel cells={[makeCell('a1b2c3d4', '// FIXME: broken logic')]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('broken logic')).toBeInTheDocument();
    expect(document.querySelector('.todo-tag-fixme')).toBeInTheDocument();
  });

  it('extracts a BUG comment', () => {
    render(<TodoPanel cells={[makeCell('a1b2c3d4', '// BUG: null ref')]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('null ref')).toBeInTheDocument();
    expect(document.querySelector('.todo-tag-bug')).toBeInTheDocument();
  });

  it('extracts multiple comments from one cell', () => {
    const content = '// TODO: first\n// FIXME: second';
    render(<TodoPanel cells={[makeCell('a1b2c3d4', content)]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('extracts comments across multiple cells', () => {
    const cells = [
      makeCell('a1b2c3d4', '// TODO: cell one task'),
      makeCell('e5f6g7h8', '// BUG: cell two bug'),
    ];
    render(<TodoPanel cells={cells} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('cell one task')).toBeInTheDocument();
    expect(screen.getByText('cell two bug')).toBeInTheDocument();
  });

  it('shows count equal to number of extracted items', () => {
    const content = '// TODO: a\n// FIXME: b\n// BUG: c';
    render(<TodoPanel cells={[makeCell('a1b2c3d4', content)]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('matches case-insensitively', () => {
    render(<TodoPanel cells={[makeCell('a1b2c3d4', '// todo: lowercase')]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('lowercase')).toBeInTheDocument();
  });
});

// ── Navigation ─────────────────────────────────────────────────────────────────

describe('TodoPanel — navigation', () => {
  it('calls onNavigateToCell with cellId when item is clicked', () => {
    const onNav = vi.fn();
    render(<TodoPanel cells={[makeCell('a1b2c3d4', '// TODO: click me')]} onNavigateToCell={onNav} />);
    fireEvent.click(screen.getByText('click me').closest('button'));
    expect(onNav).toHaveBeenCalledWith('a1b2c3d4');
  });

  it('shows cell number in each item', () => {
    render(<TodoPanel cells={[makeCell('a1b2c3d4', '// TODO: task')]} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('[1]')).toBeInTheDocument();
  });

  it('shows correct cell numbers for items from different cells', () => {
    const cells = [
      makeCell('aaaaaaaa', '// TODO: first'),
      makeCell('bbbbbbbb', '// TODO: second'),
    ];
    render(<TodoPanel cells={cells} onNavigateToCell={vi.fn()} />);
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[2]')).toBeInTheDocument();
  });
});
