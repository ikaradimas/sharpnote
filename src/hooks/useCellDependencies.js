import { useMemo } from 'react';
import { buildCellGraph, START_ID, END_ID_PREFIX } from '../utils/dependency-graph.js';

/**
 * Memoized cell dependency graph for the active notebook (visualization).
 * The graph itself is built by the pure buildCellGraph() so the Orchestration
 * panel and the reactive stale-cell tracking stay in sync.
 *
 * @param {object} notebook - The active notebook with cells and vars
 * @returns {{ nodes, edges, startId, endIds }}
 */
export function useCellDependencies(notebook) {
  return useMemo(
    () => buildCellGraph(notebook?.cells, notebook?.vars),
    [notebook?.cells, notebook?.vars]
  );
}

export { START_ID, END_ID_PREFIX };
