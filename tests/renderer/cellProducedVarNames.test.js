import { describe, it, expect } from 'vitest';
import { cellProducedVarNames } from '../../src/utils/dependency-graph.js';

describe('cellProducedVarNames', () => {
  it('detects a `var name =` declaration', () => {
    expect(cellProducedVarNames('var x = 1;', ['x'])).toEqual(['x']);
  });

  it('detects a typed declaration `Foo name =`', () => {
    expect(cellProducedVarNames('long keyFound = 0;', ['keyFound'])).toEqual(['keyFound']);
  });

  it('detects a start-of-line assignment', () => {
    expect(cellProducedVarNames('total = 5;', ['total'])).toEqual(['total']);
  });

  it('does NOT treat a pure usage as production', () => {
    expect(cellProducedVarNames('Console.WriteLine(x);', ['x'])).toEqual([]);
  });

  it('only returns names present in the candidate list', () => {
    const src = 'var a = 1; var b = 2;';
    expect(cellProducedVarNames(src, ['a']).sort()).toEqual(['a']);
    expect(cellProducedVarNames(src, ['a', 'b']).sort()).toEqual(['a', 'b']);
    expect(cellProducedVarNames(src, ['c'])).toEqual([]);
  });

  it('returns multiple produced names', () => {
    const src = 'var first = 1;\nvar second = 2;\nthird = first + second;';
    expect(cellProducedVarNames(src, ['first', 'second', 'third']).sort())
      .toEqual(['first', 'second', 'third']);
  });

  it('handles empty / missing content gracefully', () => {
    expect(cellProducedVarNames('', ['x'])).toEqual([]);
    expect(cellProducedVarNames(null, ['x'])).toEqual([]);
    expect(cellProducedVarNames('var x = 1;', [])).toEqual([]);
    expect(cellProducedVarNames('var x = 1;', null)).toEqual([]);
  });
});
