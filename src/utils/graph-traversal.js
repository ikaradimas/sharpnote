/**
 * Pure graph traversal utilities for cell dependency analysis.
 * All functions operate on node/edge arrays from useCellDependencies.
 */

/**
 * Get all upstream (transitive producer) cell IDs for a target, in topological order.
 * @param {string} targetId
 * @param {{ from: string, to: string }[]} edges
 * @returns {string[]} Cell IDs in execution order (roots first, target last)
 */
export function getUpstream(targetId, edges) {
  const incoming = {};
  for (const e of edges) {
    if (!incoming[e.to]) incoming[e.to] = [];
    incoming[e.to].push(e.from);
  }

  const visited = new Set();
  const collect = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const parent of incoming[id] || []) collect(parent);
  };
  collect(targetId);

  return topoSort([...visited], edges);
}

/**
 * Get all downstream (transitive consumer) cell IDs for a target, in topological order.
 * @param {string} targetId
 * @param {{ from: string, to: string }[]} edges
 * @returns {string[]} Cell IDs in execution order (target first, leaves last)
 */
export function getDownstream(targetId, edges) {
  const outgoing = {};
  for (const e of edges) {
    if (!outgoing[e.from]) outgoing[e.from] = [];
    outgoing[e.from].push(e.to);
  }

  const visited = new Set();
  const collect = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const child of outgoing[id] || []) collect(child);
  };
  collect(targetId);

  return topoSort([...visited], edges);
}

/**
 * Topologically sort a subset of cell IDs using Kahn's algorithm.
 * Only considers edges between cells in the given subset.
 * @param {string[]} cellIds
 * @param {{ from: string, to: string }[]} edges
 * @returns {string[]} Sorted cell IDs (roots first)
 */
export function topoSort(cellIds, edges) {
  const idSet = new Set(cellIds);
  const inDegree = {};
  const adj = {};
  for (const id of cellIds) { inDegree[id] = 0; adj[id] = []; }

  for (const e of edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
    inDegree[e.to]++;
    adj[e.from].push(e.to);
  }

  const queue = cellIds.filter((id) => inDegree[id] === 0);
  const sorted = [];
  let head = 0;

  while (head < queue.length) {
    const id = queue[head++];
    sorted.push(id);
    for (const to of adj[id]) {
      inDegree[to]--;
      if (inDegree[to] === 0) queue.push(to);
    }
  }

  // Append any remaining nodes (cycles) at the end
  for (const id of cellIds) {
    if (!sorted.includes(id)) sorted.push(id);
  }

  return sorted;
}
