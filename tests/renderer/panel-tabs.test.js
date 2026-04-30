import { describe, it, expect } from 'vitest';
import {
  panelTabsAfterDetach,
  panelTabsAfterReturn,
  panelTabsAfterNotebookClosed,
} from '../../src/app/panel-tabs.js';

describe('panelTabsAfterDetach', () => {
  it('records the panel→notebook binding', () => {
    const next = panelTabsAfterDetach(new Map(), 'log', 'nb-A');
    expect(next.get('log')).toBe('nb-A');
  });

  it('does not mutate the input map', () => {
    const prev = new Map([['vars', 'nb-A']]);
    panelTabsAfterDetach(prev, 'log', 'nb-B');
    expect([...prev.entries()]).toEqual([['vars', 'nb-A']]);
  });

  it('replaces the binding when re-detaching the same panel from a different notebook', () => {
    const prev = new Map([['log', 'nb-A']]);
    const next = panelTabsAfterDetach(prev, 'log', 'nb-B');
    expect(next.get('log')).toBe('nb-B');
  });
});

describe('panelTabsAfterReturn', () => {
  it('removes the panel and reports its bound notebook as the target', () => {
    const prev = new Map([['log', 'nb-A'], ['vars', 'nb-B']]);
    const { next, target } = panelTabsAfterReturn(prev, 'log', ['nb-A', 'nb-B']);
    expect(target).toBe('nb-A');
    expect(next.has('log')).toBe(false);
    expect(next.get('vars')).toBe('nb-B');
  });

  it('falls back to the first available notebook when the bound one is gone', () => {
    // The bug we are fixing: previously, returning ALWAYS landed on the
    // first notebook regardless of binding. Make sure we only fall back
    // when the binding is genuinely stale.
    const prev = new Map([['log', 'nb-CLOSED']]);
    const { target } = panelTabsAfterReturn(prev, 'log', ['nb-A', 'nb-B']);
    expect(target).toBe('nb-A');
  });

  it('returns null target when there are no notebooks left', () => {
    const prev = new Map([['log', 'nb-A']]);
    const { target } = panelTabsAfterReturn(prev, 'log', []);
    expect(target).toBeNull();
  });
});

describe('panelTabsAfterNotebookClosed', () => {
  it('drops every entry bound to the closed notebook', () => {
    const prev = new Map([
      ['log',  'nb-A'],
      ['vars', 'nb-A'],
      ['toc',  'nb-B'],
    ]);
    const { next, droppedTabIds } = panelTabsAfterNotebookClosed(prev, 'nb-A');
    expect([...next.entries()]).toEqual([['toc', 'nb-B']]);
    expect(droppedTabIds).toHaveLength(2);
    expect(droppedTabIds.every((id) => id.startsWith('__panel__'))).toBe(true);
  });

  it('preserves identity when nothing changes (lets React skip a render)', () => {
    const prev = new Map([['log', 'nb-A']]);
    const { next, droppedTabIds } = panelTabsAfterNotebookClosed(prev, 'nb-OTHER');
    expect(next).toBe(prev);
    expect(droppedTabIds).toEqual([]);
  });
});
