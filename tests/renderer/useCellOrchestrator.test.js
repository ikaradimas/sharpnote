import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCellOrchestrator } from '../../src/hooks/useCellOrchestrator.js';
import { useCellDependencies } from '../../src/hooks/useCellDependencies.js';

function setup(cells, edges, decisionResults = {}, nbExtra = {}) {
  const nb = { id: 'nb', cells, decisionResults, ...nbExtra };
  const notebooksRef = { current: [nb] };
  const runOrder = [];
  const dispatchRun = vi.fn(async (_nbId, cell) => { runOrder.push(cell.id); return { success: true }; });
  const { result } = renderHook(() =>
    useCellOrchestrator({ notebooksRef, nodes: [], edges, dispatchRun }));
  return { result, runOrder };
}

describe('useCellOrchestrator', () => {
  it('runWithDeps runs upstream dependencies first, target last', async () => {
    const cells = [{ id: 'a', type: 'code' }, { id: 'b', type: 'code' }, { id: 'c', type: 'code' }];
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    const { result, runOrder } = setup(cells, edges);
    await act(async () => { await result.current.runWithDeps('nb', 'c'); });
    expect(runOrder).toEqual(['a', 'b', 'c']);
  });

  it('runWithDeps on an isolated cell runs only that cell', async () => {
    const cells = [{ id: 'a', type: 'code' }, { id: 'x', type: 'code' }];
    const edges = [];
    const { result, runOrder } = setup(cells, edges);
    await act(async () => { await result.current.runWithDeps('nb', 'x'); });
    expect(runOrder).toEqual(['x']);
  });

  it('runWithDeps does NOT expand an upstream decision cell\'s downstream branch', async () => {
    // target t depends on decision d (d -> t). d.truePath references x, which is NOT
    // upstream of t and must not be dragged in by an upstream run.
    const cells = [
      { id: 'd', type: 'decision', mode: 'bool', truePath: ['x'], falsePath: [] },
      { id: 't', type: 'code' },
      { id: 'x', type: 'code' },
    ];
    const edges = [{ from: 'd', to: 't', branch: 'true' }];
    const { result, runOrder } = setup(cells, edges, { d: { result: true } });
    await act(async () => { await result.current.runWithDeps('nb', 't'); });
    expect(runOrder).toEqual(['d', 't']);
    expect(runOrder).not.toContain('x');
  });

  // Composition test: edges built by useCellDependencies (data-flow) fed into the
  // orchestrator, exactly as App wires them. Running the consumer runs its producer first.
  it('running a variable consumer runs its producer first (data-flow, no explicit links)', async () => {
    const cells = [
      { id: 'producer', type: 'code', content: 'var x = 1;' },
      { id: 'consumer', type: 'code', content: 'Console.WriteLine(x);' },
      { id: 'unrelated', type: 'code', content: 'var y = 2;' },
    ];
    const notebook = { cells, vars: [{ name: 'x', value: '1' }, { name: 'y', value: '2' }] };
    const { result: dep } = renderHook(() => useCellDependencies(notebook));

    const nb = { id: 'nb', cells, decisionResults: {} };
    const notebooksRef = { current: [nb] };
    const runOrder = [];
    const dispatchRun = vi.fn(async (_id, cell) => { runOrder.push(cell.id); return { success: true }; });
    const { result: orch } = renderHook(() =>
      useCellOrchestrator({ notebooksRef, nodes: dep.current.nodes, edges: dep.current.edges, dispatchRun }));

    await act(async () => { await orch.current.runWithDeps('nb', 'consumer'); });
    expect(runOrder).toEqual(['producer', 'consumer']); // producer first, unrelated not run
  });

  it('runWithDeps does NOT run a dependency that comes AFTER the target', async () => {
    // 'early' (index 0) reads a variable that 'late' (index 1) defines, so the
    // data-flow edge points late -> early. Running 'early' must not drag the
    // later cell into the run.
    const cells = [{ id: 'early', type: 'code' }, { id: 'late', type: 'code' }];
    const edges = [{ from: 'late', to: 'early' }];
    const { result, runOrder } = setup(cells, edges);
    await act(async () => { await result.current.runWithDeps('nb', 'early'); });
    expect(runOrder).toEqual(['early']);
    expect(runOrder).not.toContain('late');
  });

  it('runWithDeps skips a fresh (already-run, not stale) previous dependency', async () => {
    // 'a' ran successfully and is unchanged; running 'b' should run 'b' only.
    const cells = [
      { id: 'a', type: 'code', content: 'var x = 1;', _lastRunCode: 'var x = 1;' },
      { id: 'b', type: 'code', content: 'x;' },
    ];
    const edges = [{ from: 'a', to: 'b' }];
    const { result, runOrder } = setup(cells, edges, {}, { cellResults: { a: 'success' }, staleCellIds: [] });
    await act(async () => { await result.current.runWithDeps('nb', 'b'); });
    expect(runOrder).toEqual(['b']);
  });

  it('runWithDeps runs a previous dependency that is stale', async () => {
    // 'a' ran successfully but was flagged stale (downstream of a change);
    // running 'b' re-runs 'a' first.
    const cells = [
      { id: 'a', type: 'code', content: 'var x = 1;', _lastRunCode: 'var x = 1;' },
      { id: 'b', type: 'code', content: 'x;' },
    ];
    const edges = [{ from: 'a', to: 'b' }];
    const { result, runOrder } = setup(cells, edges, {}, { cellResults: { a: 'success', b: 'success' }, staleCellIds: ['a'] });
    await act(async () => { await result.current.runWithDeps('nb', 'b'); });
    expect(runOrder).toEqual(['a', 'b']);
  });

  it('runWithDeps re-runs a previous dependency edited since its last run', async () => {
    const cells = [
      { id: 'a', type: 'code', content: 'var x = 2;', _lastRunCode: 'var x = 1;' }, // edited
      { id: 'b', type: 'code', content: 'x;' },
    ];
    const edges = [{ from: 'a', to: 'b' }];
    const { result, runOrder } = setup(cells, edges, {}, { cellResults: { a: 'success', b: 'success' }, staleCellIds: [] });
    await act(async () => { await result.current.runWithDeps('nb', 'b'); });
    expect(runOrder).toEqual(['a', 'b']);
  });
});
