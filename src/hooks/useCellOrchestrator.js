import { useState, useRef, useCallback } from 'react';
import { getDownstream, topoSort, computeRunPlan } from '../utils/graph-traversal.js';

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

  // Run a cell's stale dependencies first, then the cell itself. The set of
  // dependencies is computed by the shared computeRunPlan() helper — the same
  // one the run-button tooltip uses — so the preview matches what runs. Only
  // *previous*, *stale*, non-manual-only producers run; the explicit target
  // always runs last (even if it is itself marked manual-only).
  const runWithDeps = useCallback(async (notebookId, cellId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    const { willRun } = computeRunPlan(cellId, nb.cells || [], edges, {
      staleCellIds: nb.staleCellIds || [],
      cellResults: nb.cellResults || {},
    });
    await executeQueue(notebookId, [...willRun, cellId], { expandDecisions: false });
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
