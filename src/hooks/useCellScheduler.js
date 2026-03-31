import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Manages interval-based cell scheduling.
 *
 * Cells can be scheduled to re-execute on a repeating interval.
 * If a cell is still running when the next tick fires, that tick is skipped.
 * Schedules are runtime-only — they do NOT auto-start on notebook load.
 *
 * @param {object}   opts
 * @param {object}   opts.notebooksRef - Ref to current notebooks array
 * @param {function} opts.runCell      - (notebookId, cell) => Promise
 */
export function useCellScheduler({ notebooksRef, runCell }) {
  // Reactive set of scheduled cell IDs — drives re-renders
  const [scheduledCells, setScheduledCells] = useState(() => new Set());

  // Ref-based timer storage: Map<cellId, { notebookId, intervalMs, timerId }>
  const timersRef = useRef(new Map());

  const startSchedule = useCallback((notebookId, cellId, intervalMs) => {
    // Stop any existing schedule for this cell first
    const existing = timersRef.current.get(cellId);
    if (existing) clearInterval(existing.timerId);

    const tick = () => {
      const nb = notebooksRef.current.find((n) => n.id === notebookId);
      if (!nb) {
        // Notebook gone — clean up
        stopSchedule(cellId);
        return;
      }
      if (nb.kernelStatus !== 'ready') return; // skip if kernel not ready
      if (nb.running.has(cellId)) return;       // skip if still running

      const cell = nb.cells.find((c) => c.id === cellId);
      if (!cell) {
        // Cell deleted — clean up
        stopSchedule(cellId);
        return;
      }
      runCell(notebookId, cell);
    };

    const timerId = setInterval(tick, intervalMs);
    timersRef.current.set(cellId, { notebookId, intervalMs, timerId });
    setScheduledCells((prev) => new Set([...prev, cellId]));
  }, [notebooksRef, runCell]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopSchedule = useCallback((cellId) => {
    const entry = timersRef.current.get(cellId);
    if (entry) {
      clearInterval(entry.timerId);
      timersRef.current.delete(cellId);
    }
    setScheduledCells((prev) => {
      const next = new Set(prev);
      next.delete(cellId);
      return next;
    });
  }, []);

  const stopAllSchedules = useCallback((notebookId) => {
    const toRemove = [];
    for (const [cellId, entry] of timersRef.current) {
      if (!notebookId || entry.notebookId === notebookId) {
        clearInterval(entry.timerId);
        toRemove.push(cellId);
      }
    }
    for (const cellId of toRemove) timersRef.current.delete(cellId);

    setScheduledCells(new Set([...timersRef.current.keys()]));
  }, []);

  // Cleanup all intervals on unmount
  useEffect(() => {
    return () => {
      for (const [, entry] of timersRef.current) {
        clearInterval(entry.timerId);
      }
      timersRef.current.clear();
    };
  }, []);

  return { scheduledCells, startSchedule, stopSchedule, stopAllSchedules };
}
