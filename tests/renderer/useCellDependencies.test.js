import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCellDependencies } from '../../src/hooks/useCellDependencies.js';
import { getUpstream } from '../../src/utils/graph-traversal.js';

const nb = (cells, vars = []) => ({ cells, vars });
const realEdges = (edges) => edges.filter((e) => !e.virtual);
const realIds = (ids) => ids.filter((id) => !id.startsWith('__'));

describe('useCellDependencies — default "none" (no implicit sequential edges)', () => {
  it('creates no edge between independent cells', () => {
    const cells = [
      { id: 'a', type: 'code', content: 'var x = 1;' },
      { id: 'b', type: 'code', content: 'var y = 2;' },
    ];
    const { result } = renderHook(() =>
      useCellDependencies(nb(cells, [{ name: 'x', value: '1' }, { name: 'y', value: '2' }])));
    const edges = realEdges(result.current.edges);
    expect(edges.find((e) => e.from === 'a' && e.to === 'b')).toBeUndefined();
    expect(edges.find((e) => e.from === 'b' && e.to === 'a')).toBeUndefined();
  });

  it('creates a data-flow edge from a variable producer to its consumer', () => {
    const cells = [
      { id: 'a', type: 'code', content: 'var x = 1;' },
      { id: 'b', type: 'code', content: 'Console.WriteLine(x);' },
    ];
    const { result } = renderHook(() =>
      useCellDependencies(nb(cells, [{ name: 'x', value: '1' }])));
    const e = realEdges(result.current.edges).find((x) => x.from === 'a' && x.to === 'b');
    expect(e).toBeTruthy();
    expect(e.vars).toContain('x');
    expect(realIds(getUpstream('b', result.current.edges))).toEqual(['a', 'b']);
  });

  it('creates an explicit link edge from nextCells', () => {
    const cells = [
      { id: 'a', type: 'code', content: 'Foo();', nextCells: ['b'] },
      { id: 'b', type: 'code', content: 'Bar();' },
    ];
    const { result } = renderHook(() => useCellDependencies(nb(cells, [])));
    const e = realEdges(result.current.edges).find((x) => x.from === 'a' && x.to === 'b');
    expect(e).toBeTruthy();
    expect(e.link).toBe('next');
  });

  it('an isolated cell has no upstream cells — it runs alone', () => {
    const cells = [
      { id: 'a', type: 'code', content: 'var x = 1;' },
      { id: 'b', type: 'code', content: 'Console.WriteLine(x);' },
      { id: 'c', type: 'code', content: 'Standalone();' },
    ];
    const { result } = renderHook(() =>
      useCellDependencies(nb(cells, [{ name: 'x', value: '1' }])));
    expect(realIds(getUpstream('c', result.current.edges))).toEqual(['c']);
  });
});

describe('useCellDependencies — ambiguous producers', () => {
  const node = (result, id) => result.current.nodes.find((n) => n.id === id);

  it('flags a variable produced by two cells on both producer nodes + ambiguousVars', () => {
    const cells = [
      { id: 'p1', type: 'code', content: 'var shared = LoadA();' },
      { id: 'p2', type: 'code', content: 'var shared = LoadB();' },
      { id: 'c',  type: 'code', content: 'Use(shared);' },
    ];
    const { result } = renderHook(() =>
      useCellDependencies(nb(cells, [{ name: 'shared', value: '1' }])));

    expect(result.current.ambiguousVars).toEqual({ shared: ['p1', 'p2'] });
    expect(node(result, 'p1').ambiguous).toEqual(['shared']);
    expect(node(result, 'p2').ambiguous).toEqual(['shared']);
    expect(node(result, 'c').ambiguous).toEqual([]); // a consumer, not a producer
  });

  it('leaves a single-producer variable unflagged', () => {
    const cells = [
      { id: 'p', type: 'code', content: 'var only = 1;' },
      { id: 'c', type: 'code', content: 'Use(only);' },
    ];
    const { result } = renderHook(() =>
      useCellDependencies(nb(cells, [{ name: 'only', value: '1' }])));
    expect(result.current.ambiguousVars).toEqual({});
    expect(node(result, 'p').ambiguous).toEqual([]);
  });

  it('surfaces manualOnly on the node', () => {
    const cells = [{ id: 'a', type: 'sql', content: 'INSERT …', manualOnly: true }];
    const { result } = renderHook(() => useCellDependencies(nb(cells, [])));
    expect(node(result, 'a').manualOnly).toBe(true);
  });
});
