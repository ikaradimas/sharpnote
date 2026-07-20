import { useState, useRef, useCallback } from 'react';
import { getDownstream, topoSort } from '../utils/graph-traversal.js';

/**
 * Provides dependency-aware cell execution: run with deps, run downstream,
 * run arbitrary subgraphs, and execute named pipelines.
 */
export function useCellOrchestrator({
  notebooksRef,
  nodes,
  edges,
  dispatchRun,
}) {
  const [executionProgress, setProgress] = useState(null);
  const cancelledRef = useRef(false);

  const executeQueue = useCallback(async (notebookId, orderedCellIds, opts = {}) => {
    const { expandDecisions = true } = opts;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;

    cancelledRef.current = false;
    const queue = [...orderedCellIds];
    const completed = [];

    setProgress({ activeCellId: null, queue: [...queue], completed: [], failed: null });

    let i = 0;
    while (i < queue.length) {
      if (cancelledRef.current) {
        setProgress(null);
        return;
      }

      const cellId = queue[i];
      const freshNb = notebooksRef.current.find((n) => n.id === notebookId);
      const cell = freshNb?.cells.find((c) => c.id === cellId);
      if (!cell || cell.type === 'markdown') { i++; continue; }

      setProgress({ activeCellId: cellId, queue: queue.slice(i + 1), completed: [...completed], failed: null });

      const result = await dispatchRun(notebookId, cell);

      if (result && !result.success) {
        setProgress({ activeCellId: null, queue: queue.slice(i + 1), completed: [...completed], failed: cellId });
        return;
      }

      completed.push(cellId);

      // Decision cell branching: dynamically enqueue the chosen path.
      // Skipped for upstream ("run with deps") runs — there we only want the
      // cells that feed the target, not a decision's whole downstream branch.
      if (expandDecisions && cell.type === 'decision') {
        const freshNb2 = notebooksRef.current.find((n) => n.id === notebookId);
        const decisionResult = freshNb2?.decisionResults?.[cellId];
        let pathCells;
        if ((cell.mode || 'bool') === 'switch') {
          // Switch mode: look up result string in switchPaths
          const key = String(decisionResult?.result ?? '');
          pathCells = cell.switchPaths?.[key] || cell.switchPaths?.['default'] || [];
        } else {
          // Bool mode: true/false paths
          pathCells = decisionResult?.result ? (cell.truePath || []) : (cell.falsePath || []);
        }
        // Insert path cells right after current position, in topo order
        const sorted = topoSort(pathCells, edges);
        // Only insert cells not already in the queue
        const existing = new Set(queue);
        const toInsert = sorted.filter((id) => !existing.has(id));
        queue.splice(i + 1, 0, ...toInsert);
      }

      i++;
    }

    setProgress({ activeCellId: null, queue: [], completed: [...completed], failed: null });
    // Clear progress after brief delay
    setTimeout(() => setProgress(null), 2000);
  }, [notebooksRef, edges, dispatchRun]);

  // Run a cell's stale dependencies first, then the cell itself.
  // Only *previous* cells (earlier in notebook order) are considered — a
  // data-flow edge from a later cell (e.g. a variable reassigned below) must
  // never drag "the next cell" into the run. Traversal never passes through a
  // later cell either. Of the previous dependencies, only stale ones actually
  // run: cells that are downstream-invalidated, have never run successfully, or
  // were edited since their last run. Fresh dependencies are left untouched.
  const runWithDeps = useCallback(async (notebookId, cellId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    const cells = nb.cells || [];
    const orderIndex = new Map(cells.map((c, i) => [c.id, i]));
    const targetIndex = orderIndex.get(cellId);
    if (targetIndex == null) {
      await executeQueue(notebookId, [cellId], { expandDecisions: false });
      return;
    }

    const staleSet = new Set(nb.staleCellIds || []);
    const cellResults = nb.cellResults || {};
    const cellById = new Map(cells.map((c) => [c.id, c]));
    const isStale = (id) => {
      const c = cellById.get(id);
      if (!c) return false;
      if (staleSet.has(id)) return true;                                  // downstream-invalidated
      if (cellResults[id] !== 'success') return true;                     // never ran / pending / errored
      if (c._lastRunCode != null && c._lastRunCode !== c.content) return true; // edited since last run
      return false;
    };

    // Incoming adjacency (producer → consumer), ignoring virtual Start/End edges.
    const incoming = {};
    for (const e of edges) {
      if (String(e.from).startsWith('__') || String(e.to).startsWith('__')) continue;
      (incoming[e.to] ||= []).push(e.from);
    }

    // Collect transitive dependencies that sit *before* the target, without
    // traversing into or through any cell at/after the target's position.
    const deps = new Set();
    const visit = (id) => {
      for (const parent of incoming[id] || []) {
        const pIdx = orderIndex.get(parent);
        if (pIdx == null || pIdx >= targetIndex) continue;
        if (deps.has(parent)) continue;
        deps.add(parent);
        visit(parent);
      }
    };
    visit(cellId);

    const staleDeps = topoSort([...deps].filter(isStale), edges);
    await executeQueue(notebookId, [...staleDeps, cellId], { expandDecisions: false });
  }, [notebooksRef, edges, executeQueue]);

  const runDownstream = useCallback(async (notebookId, cellId) => {
    const ordered = getDownstream(cellId, edges);
    await executeQueue(notebookId, ordered);
  }, [edges, executeQueue]);

  const runSubgraph = useCallback(async (notebookId, cellIds) => {
    const ordered = topoSort(cellIds, edges);
    await executeQueue(notebookId, ordered);
  }, [edges, executeQueue]);

  const runPipeline = useCallback(async (notebookId, pipelineId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    const pipeline = nb?.pipelines?.find((p) => p.id === pipelineId);
    if (!pipeline) return;
    await runSubgraph(notebookId, pipeline.cellIds);
  }, [notebooksRef, runSubgraph]);

  const cancelOrchestration = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  return {
    runWithDeps,
    runDownstream,
    runSubgraph,
    runPipeline,
    executionProgress,
    cancelOrchestration,
    dispatchRun,
  };
}
