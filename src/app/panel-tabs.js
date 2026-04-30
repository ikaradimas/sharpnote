// Pure state transitions for the detached panel-tab map.
//
// `panelTabs` is a Map<panelId, notebookId> — each entry says "this panel
// is popped out as a top-level tab and is showing data for that notebook".
// When a notebook closes, panel-tabs bound to it must be dropped (we don't
// keep showing data for a file that's gone). Pop-back puts the panel back
// on its bound notebook's dock zone, not just the first available file.

import { makePanelTabId } from '../utils.js';

/** Add `panelId → ownerNbId`. Returns a new Map (input untouched). */
export function panelTabsAfterDetach(prev, panelId, ownerNbId) {
  const next = new Map(prev);
  next.set(panelId, ownerNbId);
  return next;
}

/**
 * Remove the entry for `panelId` and report which notebook should regain
 * focus + own the re-attached panel. Returns null target when no notebooks
 * remain (caller decides what to do).
 */
export function panelTabsAfterReturn(prev, panelId, notebookIds) {
  const boundNbId = prev.get(panelId);
  const next = new Map(prev);
  next.delete(panelId);
  const target = (boundNbId && notebookIds.includes(boundNbId))
    ? boundNbId
    : (notebookIds[0] ?? null);
  return { next, target };
}

/**
 * Drop every entry whose ownerNbId matches `closedNbId`. Useful both for
 * the explicit "close panel-tab" action and for the cascade when the user
 * closes the underlying notebook.
 */
export function panelTabsAfterNotebookClosed(prev, closedNbId) {
  const next = new Map();
  const droppedTabIds = [];
  for (const [pid, ownerNbId] of prev) {
    if (ownerNbId === closedNbId) droppedTabIds.push(makePanelTabId(pid));
    else next.set(pid, ownerNbId);
  }
  // Preserve identity when nothing changed so React can short-circuit.
  return { next: next.size === prev.size ? prev : next, droppedTabIds };
}
