/**
 * Pure dependency-graph builder shared by the Orchestration panel
 * (via useCellDependencies) and the reactive stale-cell tracking in the
 * kernel manager. Keeping it in one place ensures the graph the user sees
 * and the graph used to flag stale cells never diverge.
 */

export const START_ID = '__start__';
export const END_ID_PREFIX = '__end__';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Given a cell's source and a list of candidate variable names, return the
 * names that the cell *produces* (declares/assigns at a statement position).
 * A name counts as produced when it appears as `<name> =`, preceded by
 * start-of-line, `var `, or a type token (`Foo name =`). This is the single
 * source of truth for producer detection — buildCellGraph and the per-cell
 * variable inspector both rely on it, so "what a cell produces" never diverges.
 *
 * @param {string} content    cell source
 * @param {string[]} varNames candidate variable names (typically the live kernel snapshot)
 * @returns {string[]} the subset of varNames the content produces
 */
export function cellProducedVarNames(content, varNames) {
  const src = content || '';
  const out = [];
  for (const name of varNames || []) {
    try {
      const defPattern = new RegExp(`(?:^|\\bvar\\s+|\\b\\w+\\s+)${escapeRegex(name)}\\s*=`, 'm');
      if (defPattern.test(src)) out.push(name);
    } catch { /* ignore malformed name */ }
  }
  return out;
}

const GRAPH_CELL_TYPES = new Set(['code', 'sql', 'check', 'http', 'shell', 'docker', 'decision']);

/**
 * Build the cell dependency graph from cells + the current variable snapshot.
 * Edges: variable-flow (producer→consumer), decision-branch paths, and explicit
 * next/prev links. No implicit sequential edges. Includes virtual Start/End nodes
 * and per-node depth for visualization.
 *
 * @param {Array} cells - notebook cells
 * @param {Array} vars  - kernel variable snapshot ({ name, value })
 * @returns {{ nodes, edges, startId, endIds }}
 */
export function buildCellGraph(cellsInput, varsInput) {
  if (!cellsInput || !varsInput) return { nodes: [], edges: [], startId: null, endIds: [] };

  const cells = cellsInput.filter((c) => GRAPH_CELL_TYPES.has(c.type));
  if (cells.length === 0) return { nodes: [], edges: [], startId: null, endIds: [] };

  const vars = varsInput || [];
  const varNames = vars.map((v) => v.name);

  // ── Variable analysis ────────────────────────────────────────────────────
  const producerMap = {};   // varName → cellId (last writer wins — drives edges)
  const producersOf = {};   // varName → [cellId,…] (every cell that produces it, in order)
  const cellProduces = {};  // cellId → Set<varName>
  const cellConsumes = {};  // cellId → Set<varName>

  for (const cell of cells) {
    cellProduces[cell.id] = new Set();
    cellConsumes[cell.id] = new Set();
  }

  for (const cell of cells) {
    for (const name of cellProducedVarNames(cell.content, varNames)) {
      producerMap[name] = cell.id; // last writer wins (unchanged — feeds the data-flow edges)
      (producersOf[name] ||= []).push(cell.id);
      cellProduces[cell.id]?.add(name);
    }
  }

  // Variables produced by more than one cell: the source of "why is that cell a
  // prerequisite?" surprises (last-writer-wins picks one producer for the edge,
  // which may not be the one the reader expects). Exposed so the UI can flag it.
  const ambiguousVars = {}; // varName → [cellId,…] (only vars with 2+ producers)
  for (const [name, ids] of Object.entries(producersOf)) {
    if (ids.length > 1) ambiguousVars[name] = ids;
  }

  for (const cell of cells) {
    const content = cell.content || '';
    for (const name of varNames) {
      if (cellProduces[cell.id]?.has(name)) continue;
      try {
        const usePattern = new RegExp(`\\b${escapeRegex(name)}\\b`);
        if (usePattern.test(content)) {
          cellConsumes[cell.id]?.add(name);
        }
      } catch { /* ignore */ }
    }
  }

  // ── Build cell nodes ─────────────────────────────────────────────────────
  const cellNodes = cells.map((cell, i) => ({
    id: cell.id,
    index: i,
    type: cell.type,
    label: cell.name || cell.label || (cell.content || '').split('\n')[0].slice(0, 40) || `Cell ${i + 1}`,
    color: cell.color || null,
    produces: [...(cellProduces[cell.id] || [])],
    consumes: [...(cellConsumes[cell.id] || [])],
    // Vars this cell produces that are ALSO produced by another cell (ambiguous).
    ambiguous: [...(cellProduces[cell.id] || [])].filter((n) => ambiguousVars[n]),
    manualOnly: !!cell.manualOnly,
    virtual: false,
    depth: 0,
  }));

  // ── Build edges (one per connection, not per variable) ───────────────────
  const edges = [];
  const edgeSet = new Set();

  // Variable-flow edges (dedup: one edge per from→to pair, vars accumulated)
  const varEdgeMap = new Map(); // "from->to" → edge object
  for (const cell of cells) {
    for (const varName of cellConsumes[cell.id] || []) {
      const producerId = producerMap[varName];
      if (producerId && producerId !== cell.id) {
        const key = `${producerId}->${cell.id}`;
        if (!varEdgeMap.has(key)) {
          varEdgeMap.set(key, { from: producerId, to: cell.id, vars: [] });
        }
        varEdgeMap.get(key).vars.push(varName);
      }
    }
  }
  for (const [key, edge] of varEdgeMap) {
    edgeSet.add(key);
    edges.push(edge);
  }

  // Decision cell path edges
  const cellIdSet = new Set(cells.map((c) => c.id));
  for (const cell of cells) {
    if (cell.type !== 'decision') continue;
    if ((cell.mode || 'bool') === 'switch') {
      for (const [caseKey, targetIds] of Object.entries(cell.switchPaths || {})) {
        for (const targetId of targetIds) {
          if (!cellIdSet.has(targetId)) continue;
          const key = `${cell.id}->${targetId}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ from: cell.id, to: targetId, vars: [], branch: caseKey });
          }
        }
      }
    } else {
      for (const targetId of cell.truePath || []) {
        if (!cellIdSet.has(targetId)) continue;
        const key = `${cell.id}->${targetId}`;
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from: cell.id, to: targetId, vars: [], branch: 'true' }); }
      }
      for (const targetId of cell.falsePath || []) {
        if (!cellIdSet.has(targetId)) continue;
        const key = `${cell.id}->${targetId}`;
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from: cell.id, to: targetId, vars: [], branch: 'false' }); }
      }
    }
  }

  // Explicit next/prev cell edges
  for (const cell of cells) {
    for (const targetId of cell.nextCells || []) {
      if (!cellIdSet.has(targetId)) continue;
      const key = `${cell.id}->${targetId}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from: cell.id, to: targetId, vars: [], link: 'next' }); }
    }
    for (const sourceId of cell.prevCells || []) {
      if (!cellIdSet.has(sourceId)) continue;
      const key = `${sourceId}->${cell.id}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from: sourceId, to: cell.id, vars: [], link: 'prev' }); }
    }
  }

  // NOTE: cells no longer get an implicit sequential edge to the next cell.
  // A cell's dependencies are only its data-flow producers, explicit next/prev
  // links, and decision-branch targets. A cell with none of those runs alone.

  // ── Identify roots and terminals ─────────────────────────────────────────
  const hasIncoming = new Set(edges.map((e) => e.to));
  const hasOutgoing = new Set(edges.map((e) => e.from));
  const rootIds = cellNodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
  const terminalIds = cellNodes.filter((n) => !hasOutgoing.has(n.id)).map((n) => n.id);

  // ── Virtual Start node ───────────────────────────────────────────────────
  const startNode = {
    id: START_ID, index: -1, type: 'start', label: 'Start',
    color: null, produces: [], consumes: [], virtual: true, depth: 0,
  };
  const startEdges = rootIds.map((id) => ({ from: START_ID, to: id, vars: [], virtual: true }));

  // ── Virtual End nodes ────────────────────────────────────────────────────
  const endNodes = [];
  const endEdges = [];
  const endIds = [];
  if (terminalIds.length > 0) {
    const endId = `${END_ID_PREFIX}0`;
    endIds.push(endId);
    endNodes.push({
      id: endId, index: -2, type: 'end', label: 'End',
      color: null, produces: [], consumes: [], virtual: true, depth: 0,
    });
    for (const tid of terminalIds) {
      endEdges.push({ from: tid, to: endId, vars: [], virtual: true });
    }
  }

  // ── Combine all ──────────────────────────────────────────────────────────
  const allNodes = [startNode, ...cellNodes, ...endNodes];
  const allEdges = [...startEdges, ...edges, ...endEdges];

  // ── Compute depth (longest path from Start) ──────────────────────────────
  const depthMap = {};
  for (const n of allNodes) depthMap[n.id] = 0;

  const adjOut = {};
  const inDeg = {};
  for (const n of allNodes) { adjOut[n.id] = []; inDeg[n.id] = 0; }
  for (const e of allEdges) {
    if (adjOut[e.from]) adjOut[e.from].push(e.to);
    if (inDeg[e.to] !== undefined) inDeg[e.to]++;
  }

  const queue = [];
  for (const n of allNodes) { if (inDeg[n.id] === 0) queue.push(n.id); }
  while (queue.length > 0) {
    const curr = queue.shift();
    for (const next of adjOut[curr] || []) {
      depthMap[next] = Math.max(depthMap[next], depthMap[curr] + 1);
      inDeg[next]--;
      if (inDeg[next] === 0) queue.push(next);
    }
  }

  for (const n of allNodes) n.depth = depthMap[n.id] || 0;

  return { nodes: allNodes, edges: allEdges, startId: START_ID, endIds, ambiguousVars };
}
