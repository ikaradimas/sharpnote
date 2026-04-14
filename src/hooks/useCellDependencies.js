import { useMemo } from 'react';

/**
 * Builds a cell dependency graph from notebook state.
 * Each cell "produces" variables it defines, and "consumes" variables
 * it references from other cells. Edges flow from producer to consumer.
 *
 * @param {object} notebook - The active notebook with cells and vars
 * @returns {{ nodes, edges }} - Graph data for visualization
 */
export function useCellDependencies(notebook) {
  return useMemo(() => {
    if (!notebook?.cells || !notebook?.vars) return { nodes: [], edges: [] };

    const cells = notebook.cells.filter((c) =>
      c.type === 'code' || c.type === 'sql' || c.type === 'check' ||
      c.type === 'http' || c.type === 'shell' || c.type === 'docker' || c.type === 'decision'
    );
    const vars = notebook.vars || [];
    const varNames = vars.map((v) => v.name);

    // Build variable name → producing cell ID map.
    // Heuristic: scan each cell's content for assignment patterns.
    // For code cells: `var x =`, `int x =`, `x =` at line start
    // For simplicity, assign each variable to the LAST cell that mentions it
    // in an assignment-like pattern. Fallback: the variable exists but we
    // don't know which cell produced it.
    const producerMap = {}; // varName → cellId
    const cellProduces = {}; // cellId → Set<varName>
    const cellConsumes = {}; // cellId → Set<varName>

    for (const cell of cells) {
      cellProduces[cell.id] = new Set();
      cellConsumes[cell.id] = new Set();
    }

    // Pass 1: find which cells define variables (assignment patterns)
    for (const cell of cells) {
      const content = cell.content || '';
      for (const name of varNames) {
        try {
          // Match: `var name`, `type name =`, `name =` (at word boundary)
          const defPattern = new RegExp(`(?:^|\\bvar\\s+|\\b\\w+\\s+)${escapeRegex(name)}\\s*=`, 'm');
          if (defPattern.test(content)) {
            producerMap[name] = cell.id;
            cellProduces[cell.id]?.add(name);
          }
        } catch { /* ignore regex errors for unusual var names */ }
      }
    }

    // Pass 2: find which cells consume variables (any reference that isn't a definition)
    for (const cell of cells) {
      const content = cell.content || '';
      for (const name of varNames) {
        if (cellProduces[cell.id]?.has(name)) continue; // skip self-produced
        try {
          const usePattern = new RegExp(`\\b${escapeRegex(name)}\\b`);
          if (usePattern.test(content)) {
            cellConsumes[cell.id]?.add(name);
          }
        } catch { /* ignore */ }
      }
    }

    // Build nodes
    const nodes = cells.map((cell, i) => ({
      id: cell.id,
      index: i,
      type: cell.type,
      label: cell.name || cell.label || (cell.content || '').split('\n')[0].slice(0, 40) || `Cell ${i + 1}`,
      color: cell.color || null,
      produces: [...(cellProduces[cell.id] || [])],
      consumes: [...(cellConsumes[cell.id] || [])],
    }));

    // Build edges: producer → consumer
    const edges = [];
    const edgeSet = new Set();
    for (const cell of cells) {
      for (const varName of cellConsumes[cell.id] || []) {
        const producerId = producerMap[varName];
        if (producerId && producerId !== cell.id) {
          const key = `${producerId}->${cell.id}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({
              from: producerId,
              to: cell.id,
              vars: [],
            });
          }
          edges.find((e) => e.from === producerId && e.to === cell.id)?.vars.push(varName);
        }
      }
    }

    // Add decision cell path edges (bool: true/false, switch: case keys)
    const cellIdSet = new Set(cells.map((c) => c.id));
    for (const cell of cells) {
      if (cell.type !== 'decision') continue;
      if ((cell.mode || 'bool') === 'switch') {
        // Switch mode: edges for each case key
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
        // Bool mode: true/false edges
        for (const targetId of cell.truePath || []) {
          if (!cellIdSet.has(targetId)) continue;
          const key = `${cell.id}->${targetId}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ from: cell.id, to: targetId, vars: [], branch: 'true' });
          }
        }
        for (const targetId of cell.falsePath || []) {
          if (!cellIdSet.has(targetId)) continue;
          const key = `${cell.id}->${targetId}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ from: cell.id, to: targetId, vars: [], branch: 'false' });
          }
        }
      }
    }

    // Add implicit sequential edges between consecutive cells with no explicit connection
    for (let i = 0; i < cells.length - 1; i++) {
      const fromId = cells[i].id;
      const toId = cells[i + 1].id;
      const key = `${fromId}->${toId}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ from: fromId, to: toId, vars: [], implicit: true });
      }
    }

    return { nodes, edges };
  }, [notebook?.cells, notebook?.vars]);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
