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
 * Given the cell that just ran and the variable names whose values changed,
 * return the IDs of the cells that are now stale — i.e. downstream of the ran
 * cell in the dependency graph. Propagation rules:
 *   - A direct data-flow dependent is stale only if the edge carries a changed
 *     variable (so changing var `a` doesn't stale a cell that only reads `b`).
 *   - A direct structural dependent (explicit link / decision branch, no vars on
 *     the edge) is always considered stale.
 *   - Once a cell is stale, every cell downstream of it is stale too (cascade).
 * Virtual Start/End edges (ids beginning with "__") are ignored. The ran cell
 * itself is never included.
 *
 * @param {string} ranCellId
 * @param {string[]} changedVars
 * @param {{ from: string, to: string, vars?: string[] }[]} edges
 * @returns {string[]} stale cell IDs
 */
export function computeStaleCells(ranCellId, changedVars, edges) {
  const changed = new Set(changedVars || []);
  const out = {};
  for (const e of edges) {
    if (String(e.from).startsWith('__') || String(e.to).startsWith('__')) continue;
    (out[e.from] ||= []).push(e);
  }

  const stale = new Set();
  const queue = [];

  // Seed: direct dependents of the ran cell affected by the change.
  for (const e of out[ranCellId] || []) {
    const isDataEdge = Array.isArray(e.vars) && e.vars.length > 0;
    const relevant = isDataEdge ? e.vars.some((v) => changed.has(v)) : true;
    if (relevant && e.to !== ranCellId && !stale.has(e.to)) {
      stale.add(e.to);
      queue.push(e.to);
    }
  }

  // Cascade: anything downstream of a stale cell is stale too.
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const e of out[cur] || []) {
      if (e.to !== ranCellId && !stale.has(e.to)) {
        stale.add(e.to);
        queue.push(e.to);
      }
    }
  }

  return [...stale];
}

/**
 * Compute what the dependency-first ▶ run of `cellId` will do: the transitive
 * data-flow / link producers that sit *before* the target in notebook order and
 * are stale, in execution order. This is the single source of truth shared by
 * the orchestrator (which runs the plan) and the run-button tooltip (which
 * previews it), so what the user is told matches what actually runs.
 *
 * `manualOnly` producers are excluded and are NOT traversed through — a cell the
 * user marked "run manually" is never dragged into another cell's run, and cells
 * reachable only through it are not either. Such skipped producers are reported
 * separately so the UI can explain why a consumed variable may be out of date.
 *
 * @param {string} cellId target cell
 * @param {Array} cells notebook cells (need id, content, _lastRunCode, manualOnly)
 * @param {{from,to}[]} edges dependency edges
 * @param {{ staleCellIds?: string[], cellResults?: Record<string,string> }} [opts]
 * @returns {{ willRun: string[], deps: string[], skippedManualOnly: string[] }}
 *   willRun — stale, non-manual previous deps in execution order (excludes target);
 *   deps — all such previous deps (stale or not); skippedManualOnly — excluded
 *   manual-only producers.
 */
export function computeRunPlan(cellId, cells, edges, opts = {}) {
  const { staleCellIds = [], cellResults = {} } = opts;
  const cellList = cells || [];
  const orderIndex = new Map(cellList.map((c, i) => [c.id, i]));
  const cellById = new Map(cellList.map((c) => [c.id, c]));
  const targetIndex = orderIndex.get(cellId);
  if (targetIndex == null) return { willRun: [], deps: [], skippedManualOnly: [] };

  const staleSet = new Set(staleCellIds);
  const isStale = (id) => {
    const c = cellById.get(id);
    if (!c) return false;
    if (staleSet.has(id)) return true;                                       // downstream-invalidated
    if (cellResults[id] !== 'success') return true;                          // never ran / pending / errored
    if (c._lastRunCode != null && c._lastRunCode !== c.content) return true; // edited since last run
    return false;
  };

  const incoming = {};
  for (const e of edges || []) {
    if (String(e.from).startsWith('__') || String(e.to).startsWith('__')) continue;
    (incoming[e.to] ||= []).push(e.from);
  }

  const deps = new Set();
  const skippedManualOnly = new Set();
  const visit = (id) => {
    for (const parent of incoming[id] || []) {
      const pIdx = orderIndex.get(parent);
      if (pIdx == null || pIdx >= targetIndex) continue;   // only cells before the target
      if (deps.has(parent) || skippedManualOnly.has(parent)) continue;
      if (cellById.get(parent)?.manualOnly) {              // never auto-run a manual-only cell
        skippedManualOnly.add(parent);
        continue;                                          // ...and don't traverse through it
      }
      deps.add(parent);
      visit(parent);
    }
  };
  visit(cellId);

  return {
    willRun: topoSort([...deps].filter(isStale), edges),
    deps: [...deps],
    skippedManualOnly: [...skippedManualOnly],
  };
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
