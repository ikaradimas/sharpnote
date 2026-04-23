import { useState, useRef, useCallback } from 'react';
import { getUpstream, getDownstream, topoSort } from '../utils/graph-traversal.js';

/**
 * Provides dependency-aware cell execution: run with deps, run downstream,
 * run arbitrary subgraphs, and execute named pipelines.
 */
export function useCellOrchestrator({
  notebooksRef,
  nodes,
  edges,
  runCell,
  runSqlCell,
  runHttpCell,
  runShellCell,
  runCheckCell,
  runDecisionCell,
  runDockerCell,
  runFlociCell,
}) {
  const [executionProgress, setProgress] = useState(null);
  const cancelledRef = useRef(false);

  const dispatchRun = useCallback(async (notebookId, cell) => {
    switch (cell.type) {
      case 'code':     return runCell(notebookId, cell);
      case 'sql':      return runSqlCell(notebookId, cell);
      case 'http':     return runHttpCell(notebookId, cell);
      case 'shell':    return runShellCell(notebookId, cell);
      case 'check':    return runCheckCell(notebookId, cell);
      case 'decision': return runDecisionCell(notebookId, cell);
      case 'docker':   return runDockerCell(notebookId, cell);
      case 'floci':    return runFlociCell(notebookId, cell);
      default:         return null;
    }
  }, [runCell, runSqlCell, runHttpCell, runShellCell, runCheckCell, runDecisionCell, runDockerCell, runFlociCell]);

  const executeQueue = useCallback(async (notebookId, orderedCellIds) => {
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

      // Decision cell branching: dynamically enqueue the chosen path
      if (cell.type === 'decision') {
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

  const runWithDeps = useCallback(async (notebookId, cellId) => {
    const ordered = getUpstream(cellId, edges);
    await executeQueue(notebookId, ordered);
  }, [edges, executeQueue]);

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
