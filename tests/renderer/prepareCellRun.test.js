import { describe, it, expect, vi } from 'vitest';
import { prepareCellRun } from '../../src/hooks/useKernelManager.js';

// Run prepareCellRun against a mocked setNb and return the resulting state
// patch (the object returned by the updater, ready to merge with the
// previous notebook state).
function runPrepare(prevState, cellId = 'c1') {
  const captured = {};
  const setNb = vi.fn((notebookId, updater) => {
    captured.notebookId = notebookId;
    captured.patch = updater(prevState);
  });
  const pendingResolversRef = { current: {} };
  const resolve = vi.fn();
  prepareCellRun(setNb, pendingResolversRef, 'nb-1', cellId, resolve);
  return captured;
}

describe('prepareCellRun', () => {
  it('clears outputs and resets cellResults for the cell', () => {
    const { patch } = runPrepare({
      cells: [{ id: 'c1', content: 'var x = 1;' }],
      outputs: { c1: [{ type: 'error', text: 'CS0103' }] },
      cellResults: { c1: 'error' },
      running: new Set(),
    });
    expect(patch.outputs.c1).toEqual([]);
    expect(patch.cellResults.c1).toBeNull();
    expect(patch.running.has('c1')).toBe(true);
  });

  it('snapshots previous outputs into outputHistory', () => {
    const prev = [{ type: 'stdout', text: 'old' }];
    const { patch } = runPrepare({
      cells:    [{ id: 'c1', content: 'var x = 1;' }],
      outputs:  { c1: prev },
      cellResults: {},
      running:  new Set(),
      outputHistory: { c1: [] },
    });
    expect(patch.outputHistory.c1).toEqual([prev]);
  });

  // ── Bug fix coverage: re-running a cell that previously had compile errors
  // should clear the inline diagnostics so the squiggles disappear.
  it('clears inlineDiagnostics for the cell when previous run left some', () => {
    const { patch } = runPrepare({
      cells: [{ id: 'c1', content: 'var x = 1;' }],
      outputs: { c1: [] },
      cellResults: {},
      running: new Set(),
      inlineDiagnostics: { c1: [{ line: 1, col: 1, severity: 'error', message: 'CS0103' }] },
    });
    expect(patch.inlineDiagnostics.c1).toEqual([]);
  });

  it('does not touch inlineDiagnostics when the cell had none (avoid spurious churn)', () => {
    const { patch } = runPrepare({
      cells: [{ id: 'c1', content: 'var x = 1;' }],
      outputs: { c1: [] },
      cellResults: {},
      running: new Set(),
      inlineDiagnostics: { c1: [] },
    });
    expect(patch.inlineDiagnostics).toBeUndefined();
  });
});
