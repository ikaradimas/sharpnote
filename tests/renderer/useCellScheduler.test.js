import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCellScheduler } from '../../src/hooks/useCellScheduler.js';

function makeNotebooksRef(overrides = {}) {
  const nb = {
    id: 'nb-1',
    cells: [{ id: 'c1', type: 'code', content: 'var x=1;', outputMode: 'auto' }],
    running: new Set(),
    kernelStatus: 'ready',
    ...overrides,
  };
  return { current: [nb] };
}

describe('useCellScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('startSchedule adds cell to scheduledCells', () => {
    const runCell = vi.fn();
    const notebooksRef = makeNotebooksRef();
    const { result } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => result.current.startSchedule('nb-1', 'c1', 5000));

    expect(result.current.scheduledCells.has('c1')).toBe(true);
  });

  it('fires runCell on each interval tick', () => {
    const runCell = vi.fn();
    const notebooksRef = makeNotebooksRef();
    const { result } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => result.current.startSchedule('nb-1', 'c1', 5000));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(runCell).toHaveBeenCalledOnce();
    expect(runCell).toHaveBeenCalledWith('nb-1', notebooksRef.current[0].cells[0]);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(runCell).toHaveBeenCalledTimes(2);
  });

  it('skips tick when cell is still running', () => {
    const runCell = vi.fn();
    const notebooksRef = makeNotebooksRef();
    const { result } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => result.current.startSchedule('nb-1', 'c1', 5000));

    // Mark cell as running
    notebooksRef.current[0].running = new Set(['c1']);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(runCell).not.toHaveBeenCalled();

    // Unmark — next tick should fire
    notebooksRef.current[0].running = new Set();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(runCell).toHaveBeenCalledOnce();
  });

  it('skips tick when kernel is not ready', () => {
    const runCell = vi.fn();
    const notebooksRef = makeNotebooksRef({ kernelStatus: 'starting' });
    const { result } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => result.current.startSchedule('nb-1', 'c1', 5000));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(runCell).not.toHaveBeenCalled();
  });

  it('stopSchedule removes cell from scheduledCells and stops ticks', () => {
    const runCell = vi.fn();
    const notebooksRef = makeNotebooksRef();
    const { result } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => result.current.startSchedule('nb-1', 'c1', 5000));
    act(() => result.current.stopSchedule('c1'));

    expect(result.current.scheduledCells.has('c1')).toBe(false);

    act(() => { vi.advanceTimersByTime(10000); });
    expect(runCell).not.toHaveBeenCalled();
  });

  it('stopAllSchedules(notebookId) stops only that notebook', () => {
    const runCell = vi.fn();
    const nb2 = {
      id: 'nb-2',
      cells: [{ id: 'c2', type: 'code', content: '', outputMode: 'auto' }],
      running: new Set(),
      kernelStatus: 'ready',
    };
    const notebooksRef = makeNotebooksRef();
    notebooksRef.current.push(nb2);

    const { result } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => {
      result.current.startSchedule('nb-1', 'c1', 5000);
      result.current.startSchedule('nb-2', 'c2', 5000);
    });

    act(() => result.current.stopAllSchedules('nb-1'));

    expect(result.current.scheduledCells.has('c1')).toBe(false);
    expect(result.current.scheduledCells.has('c2')).toBe(true);

    act(() => { vi.advanceTimersByTime(5000); });
    // Only c2 should have fired
    expect(runCell).toHaveBeenCalledOnce();
    expect(runCell).toHaveBeenCalledWith('nb-2', nb2.cells[0]);
  });

  it('auto-stops when cell is removed from notebook', () => {
    const runCell = vi.fn();
    const notebooksRef = makeNotebooksRef();
    const { result } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => result.current.startSchedule('nb-1', 'c1', 5000));

    // Remove cell
    notebooksRef.current[0].cells = [];
    act(() => { vi.advanceTimersByTime(5000); });
    expect(runCell).not.toHaveBeenCalled();
    expect(result.current.scheduledCells.has('c1')).toBe(false);
  });

  it('auto-stops when notebook is removed', () => {
    const runCell = vi.fn();
    const notebooksRef = makeNotebooksRef();
    const { result } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => result.current.startSchedule('nb-1', 'c1', 5000));

    notebooksRef.current = [];
    act(() => { vi.advanceTimersByTime(5000); });
    expect(runCell).not.toHaveBeenCalled();
    expect(result.current.scheduledCells.has('c1')).toBe(false);
  });

  it('cleans up all timers on unmount', () => {
    const runCell = vi.fn();
    const notebooksRef = makeNotebooksRef();
    const { result, unmount } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => result.current.startSchedule('nb-1', 'c1', 5000));
    unmount();

    act(() => { vi.advanceTimersByTime(10000); });
    expect(runCell).not.toHaveBeenCalled();
  });

  it('replaces existing schedule when startSchedule is called again', () => {
    const runCell = vi.fn();
    const notebooksRef = makeNotebooksRef();
    const { result } = renderHook(() => useCellScheduler({ notebooksRef, runCell }));

    act(() => result.current.startSchedule('nb-1', 'c1', 5000));
    act(() => result.current.startSchedule('nb-1', 'c1', 10000));

    // After 5s, should NOT fire (old interval cleared)
    act(() => { vi.advanceTimersByTime(5000); });
    expect(runCell).not.toHaveBeenCalled();

    // After 10s total, should fire once
    act(() => { vi.advanceTimersByTime(5000); });
    expect(runCell).toHaveBeenCalledOnce();
  });
});
