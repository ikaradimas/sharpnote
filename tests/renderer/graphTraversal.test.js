import { describe, it, expect } from 'vitest';
import { getUpstream, getDownstream, topoSort, computeStaleCells, computeRunPlan } from '../../src/utils/graph-traversal.js';

describe('getUpstream', () => {
  it('linear chain A→B→C returns all in topo order', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ];
    expect(getUpstream('C', edges)).toEqual(['A', 'B', 'C']);
  });

  it('diamond A→B, A→C, B→D, C→D includes all ancestors', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'D' },
      { from: 'C', to: 'D' },
    ];
    const result = getUpstream('D', edges);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
    expect(result).toContain('D');
    expect(result).toHaveLength(4);
    // A must come before B, C, D
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'));
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('C'));
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('D'));
    // D must be last
    expect(result.indexOf('D')).toBe(3);
  });

  it('isolated node returns just itself', () => {
    const edges = [{ from: 'X', to: 'Y' }];
    expect(getUpstream('Z', edges)).toEqual(['Z']);
  });

  it('empty edges returns just the target', () => {
    expect(getUpstream('A', [])).toEqual(['A']);
  });
});

describe('getDownstream', () => {
  it('linear chain A→B→C from A returns all in topo order', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ];
    expect(getDownstream('A', edges)).toEqual(['A', 'B', 'C']);
  });

  it('diamond from A returns all descendants', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'D' },
      { from: 'C', to: 'D' },
    ];
    const result = getDownstream('A', edges);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('A');
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('D'));
    expect(result.indexOf('C')).toBeLessThan(result.indexOf('D'));
  });

  it('isolated node returns just itself', () => {
    const edges = [{ from: 'X', to: 'Y' }];
    expect(getDownstream('Z', edges)).toEqual(['Z']);
  });

  it('empty edges returns just the target', () => {
    expect(getDownstream('A', [])).toEqual(['A']);
  });
});

describe('topoSort', () => {
  it('sorts linear chain in order', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ];
    expect(topoSort(['C', 'A', 'B'], edges)).toEqual(['A', 'B', 'C']);
  });

  it('with subset only considers edges within subset', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'D' },
    ];
    // Only sort A and C — the B→C edge is excluded because B is not in subset
    const result = topoSort(['C', 'A'], edges);
    expect(result).toHaveLength(2);
    expect(result).toContain('A');
    expect(result).toContain('C');
  });

  it('empty edges returns input in same order', () => {
    expect(topoSort(['C', 'B', 'A'], [])).toEqual(['C', 'B', 'A']);
  });

  it('handles cycles gracefully by appending remaining', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'A' },
    ];
    const result = topoSort(['A', 'B', 'C'], edges);
    // All three should still appear
    expect(result).toHaveLength(3);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
  });

  it('empty cellIds returns empty array', () => {
    expect(topoSort([], [{ from: 'A', to: 'B' }])).toEqual([]);
  });
});

describe('computeStaleCells', () => {
  it('flags downstream data-flow dependents and cascades', () => {
    const edges = [
      { from: 'A', to: 'B', vars: ['x'] },
      { from: 'B', to: 'C', vars: ['y'] },
    ];
    const stale = computeStaleCells('A', ['x'], edges).sort();
    expect(stale).toEqual(['B', 'C']); // B directly, C via cascade
  });

  it('only flags dependents that consume a changed variable', () => {
    const edges = [
      { from: 'A', to: 'B', vars: ['x'] },
      { from: 'A', to: 'D', vars: ['z'] },
    ];
    expect(computeStaleCells('A', ['x'], edges)).toEqual(['B']); // D reads z, unchanged
  });

  it('always flags a structural (explicit-link / decision) dependent', () => {
    const edges = [{ from: 'A', to: 'B', vars: [] }];
    expect(computeStaleCells('A', ['anything'], edges)).toEqual(['B']);
  });

  it('flags nothing when no dependent consumes a changed variable', () => {
    const edges = [{ from: 'A', to: 'B', vars: ['x'] }];
    expect(computeStaleCells('A', ['z'], edges)).toEqual([]);
  });

  it('ignores virtual Start/End edges and never includes the ran cell', () => {
    const edges = [
      { from: '__start__', to: 'A', vars: [] },
      { from: 'A', to: 'B', vars: ['x'] },
      { from: 'B', to: '__end__0', vars: [] },
    ];
    const stale = computeStaleCells('A', ['x'], edges);
    expect(stale).toEqual(['B']);
    expect(stale).not.toContain('A');
    expect(stale.some((id) => id.startsWith('__'))).toBe(false);
  });

  it('is cycle-safe', () => {
    const edges = [
      { from: 'A', to: 'B', vars: ['x'] },
      { from: 'B', to: 'A', vars: ['y'] },
    ];
    expect(computeStaleCells('A', ['x'], edges).sort()).toEqual(['B']);
  });
});

describe('computeRunPlan', () => {
  // cells are ordered A(0) → B(1) → C(2); edges are producer→consumer.
  const cells = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const edges = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }];

  it('runs stale previous deps in execution order', () => {
    const plan = computeRunPlan('C', cells, edges, { cellResults: {} });
    expect(plan.willRun).toEqual(['A', 'B']); // neither has run → both stale
  });

  it('skips a fresh (already-run, unchanged) previous dep', () => {
    const cs = [{ id: 'A', content: 'x', _lastRunCode: 'x' }, { id: 'B' }];
    const plan = computeRunPlan('B', cs, [{ from: 'A', to: 'B' }], { cellResults: { A: 'success' } });
    expect(plan.willRun).toEqual([]);       // A is fresh
    expect(plan.deps).toEqual(['A']);       // still a dependency, just not stale
  });

  it('never includes a dependency that comes AFTER the target', () => {
    // 'late' (index 1) produces a var 'early' (index 0) reads → edge late→early.
    const cs = [{ id: 'early' }, { id: 'late' }];
    const plan = computeRunPlan('early', cs, [{ from: 'late', to: 'early' }], { cellResults: {} });
    expect(plan.willRun).toEqual([]);
    expect(plan.deps).toEqual([]);
  });

  it('excludes a manual-only producer and reports it', () => {
    const cs = [{ id: 'A', manualOnly: true }, { id: 'B' }];
    const plan = computeRunPlan('B', cs, [{ from: 'A', to: 'B' }], { cellResults: {} });
    expect(plan.willRun).toEqual([]);              // A is not auto-run
    expect(plan.deps).toEqual([]);                 // and not counted as a runnable dep
    expect(plan.skippedManualOnly).toEqual(['A']);
  });

  it('does not traverse THROUGH a manual-only producer', () => {
    // A → B(manualOnly) → C. Running C must not pull in A (only reachable via B).
    const cs = [{ id: 'A' }, { id: 'B', manualOnly: true }, { id: 'C' }];
    const es = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }];
    const plan = computeRunPlan('C', cs, es, { cellResults: {} });
    expect(plan.willRun).toEqual([]);
    expect(plan.skippedManualOnly).toEqual(['B']);
  });

  it('still pulls a shared producer reachable NOT only through the manual-only cell', () => {
    // A → B(manualOnly) → C, and A → C directly. C still needs A.
    const cs = [{ id: 'A' }, { id: 'B', manualOnly: true }, { id: 'C' }];
    const es = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'A', to: 'C' }];
    const plan = computeRunPlan('C', cs, es, { cellResults: {} });
    expect(plan.willRun).toEqual(['A']);
    expect(plan.skippedManualOnly).toEqual(['B']);
  });

  it('ignores virtual Start/End edges', () => {
    const cs = [{ id: 'A' }, { id: 'B' }];
    const es = [{ from: '__start__', to: 'A' }, { from: 'A', to: 'B' }, { from: 'B', to: '__end__0' }];
    const plan = computeRunPlan('B', cs, es, { cellResults: {} });
    expect(plan.willRun).toEqual(['A']);
  });

  it('returns empty for an unknown target', () => {
    expect(computeRunPlan('ghost', cells, edges, {})).toEqual({ willRun: [], deps: [], skippedManualOnly: [] });
  });
});
