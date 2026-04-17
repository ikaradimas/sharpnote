import { useMemo } from 'react';

const START_ID = '__start__';
const END_ID_PREFIX = '__end__';

/**
 * Builds a cell dependency graph from notebook state.
 * Includes virtual Start (connects to root nodes) and End (connects from terminal nodes) nodes.
 * Computes depth (longest path from Start) for each node.
 *
 * @param {object} notebook - The active notebook with cells and vars
 * @returns {{ nodes, edges, startId, endIds }} - Graph data for visualization
 */
export function useCellDependencies(notebook) {
  return useMemo(() => {
    if (!notebook?.cells || !notebook?.vars) return { nodes: [], edges: [], startId: null, endIds: [] };

    const cells = notebook.cells.filter((c) =>
      c.type === 'code' || c.type === 'sql' || c.type === 'check' ||
      c.type === 'http' || c.type === 'shell' || c.type === 'docker' || c.type === 'decision'
    );
    if (cells.length === 0) return { nodes: [], edges: [], startId: null, endIds: [] };

    const vars = notebook.vars || [];
    const varNames = vars.map((v) => v.name);

    // ── Variable analysis ────────────────────────────────────────────────────
    const producerMap = {}; // varName → cellId
    const cellProduces = {}; // cellId → Set<varName>
    const cellConsumes = {}; // cellId → Set<varName>

    for (const cell of cells) {
      cellProduces[cell.id] = new Set();
      cellConsumes[cell.id] = new Set();
    }

    for (const cell of cells) {
      const content = cell.content || '';
      for (const name of varNames) {
        try {
          const defPattern = new RegExp(`(?:^|\\bvar\\s+|\\b\\w+\\s+)${escapeRegex(name)}\\s*=`, 'm');
          if (defPattern.test(content)) {
            producerMap[name] = cell.id;
            cellProduces[cell.id]?.add(name);
          }
        } catch { /* ignore */ }
      }
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

    // Implicit sequential edges
    for (let i = 0; i < cells.length - 1; i++) {
      const fromId = cells[i].id;
      const toId = cells[i + 1].id;
      const key = `${fromId}->${toId}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from: fromId, to: toId, vars: [], implicit: true }); }
    }

    // ── Identify roots and terminals ─────────────────────────────────────────
    const hasIncoming = new Set(edges.filter(e => !e.implicit).map(e => e.to));
    const hasOutgoing = new Set(edges.filter(e => !e.implicit).map(e => e.from));
    const rootIds = cellNodes.filter(n => !hasIncoming.has(n.id)).map(n => n.id);
    const terminalIds = cellNodes.filter(n => !hasOutgoing.has(n.id)).map(n => n.id);

    // ── Virtual Start node ───────────────────────────────────────────────────
    const startNode = {
      id: START_ID, index: -1, type: 'start', label: 'Start',
      color: null, produces: [], consumes: [], virtual: true, depth: 0,
    };
    const startEdges = rootIds.map(id => ({ from: START_ID, to: id, vars: [], virtual: true }));

    // ── Virtual End nodes ────────────────────────────────────────────────────
    const endNodes = [];
    const endEdges = [];
    const endIds = [];
    if (terminalIds.length > 0) {
      // Single shared End node
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

    // ── Compute depth (longest path from Start, explicit edges only) ─────────
    const depthMap = {};
    for (const n of allNodes) depthMap[n.id] = 0;

    // Use only non-implicit edges for depth computation
    const depthEdges = allEdges.filter(e => !e.implicit);
    const adjOut = {};
    const inDeg = {};
    for (const n of allNodes) { adjOut[n.id] = []; inDeg[n.id] = 0; }
    for (const e of depthEdges) {
      if (adjOut[e.from]) adjOut[e.from].push(e.to);
      if (inDeg[e.to] !== undefined) inDeg[e.to]++;
    }

    // Kahn's topological traversal for longest path
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

    // Apply depth to nodes
    for (const n of allNodes) n.depth = depthMap[n.id] || 0;

    return { nodes: allNodes, edges: allEdges, startId: START_ID, endIds };
  }, [notebook?.cells, notebook?.vars]);
}

export { START_ID, END_ID_PREFIX };

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
