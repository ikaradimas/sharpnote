import { describe, it, expect } from 'vitest';
import { getUpstream, getDownstream, topoSort } from '../../src/utils/graph-traversal.js';

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
