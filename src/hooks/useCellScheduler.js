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
export const NOTEBOOK_SCHEDULE_PRESETS = [
  { label: 'Every 5 min',  ms: 5 * 60_000 },
  { label: 'Every 15 min', ms: 15 * 60_000 },
  { label: 'Every hour',   ms: 60 * 60_000 },
  { label: 'Every 6 hours', ms: 6 * 60 * 60_000 },
];

export function useCellScheduler({ notebooksRef, runCell, runAll }) {
  // Reactive set of scheduled cell IDs — drives re-renders
  const [scheduledCells, setScheduledCells] = useState(() => new Set());
  // Notebook-level schedules: Map<notebookId, { intervalMs, timerId }>
  const [scheduledNotebooks, setScheduledNotebooks] = useState(() => new Map());

  // Ref-based timer storage: Map<cellId, { notebookId, intervalMs, timerId }>
  const timersRef = useRef(new Map());
  const nbTimersRef = useRef(new Map());

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

  // ── Notebook-level scheduling ─────────────────────────────────────────────

  const startNotebookSchedule = useCallback((notebookId, intervalMs) => {
    const existing = nbTimersRef.current.get(notebookId);
    if (existing) clearInterval(existing.timerId);

    const tick = () => {
      const nb = notebooksRef.current.find((n) => n.id === notebookId);
      if (!nb) { stopNotebookSchedule(notebookId); return; }
      if (nb.kernelStatus !== 'ready') return;
      if (nb.running.size > 0) return;
      runAll?.(notebookId);
    };

    const timerId = setInterval(tick, intervalMs);
    nbTimersRef.current.set(notebookId, { intervalMs, timerId });
    setScheduledNotebooks((prev) => new Map([...prev, [notebookId, intervalMs]]));
  }, [notebooksRef, runAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopNotebookSchedule = useCallback((notebookId) => {
    const entry = nbTimersRef.current.get(notebookId);
    if (entry) {
      clearInterval(entry.timerId);
      nbTimersRef.current.delete(notebookId);
    }
    setScheduledNotebooks((prev) => {
      const next = new Map(prev);
      next.delete(notebookId);
      return next;
    });
  }, []);

  // Cleanup all intervals on unmount
  useEffect(() => {
    return () => {
      for (const [, entry] of timersRef.current) clearInterval(entry.timerId);
      timersRef.current.clear();
      for (const [, entry] of nbTimersRef.current) clearInterval(entry.timerId);
      nbTimersRef.current.clear();
    };
  }, []);

  return {
    scheduledCells, startSchedule, stopSchedule, stopAllSchedules,
    scheduledNotebooks, startNotebookSchedule, stopNotebookSchedule,
  };
}
