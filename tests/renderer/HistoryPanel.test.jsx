import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HistoryPanel } from '../../src/renderer.jsx';

// ── Mock electronAPI ──────────────────────────────────────────────────────────

const mockGetHistory = vi.fn();
const mockRestoreSnapshot = vi.fn();
const mockDeleteHistory = vi.fn();

beforeEach(() => {
  mockGetHistory.mockReset();
  mockRestoreSnapshot.mockReset();
  mockDeleteHistory.mockReset();
  window.electronAPI = {
    getNotebookHistory: mockGetHistory,
    restoreNotebookSnapshot: mockRestoreSnapshot,
    deleteNotebookHistory: mockDeleteHistory,
  };
});

// ── Empty states ──────────────────────────────────────────────────────────────

describe('HistoryPanel — empty states', () => {
  it('shows save prompt when no notebook path', () => {
    render(<HistoryPanel notebookPath={null} onRestore={vi.fn()} />);
    expect(screen.getByText(/Save the notebook/)).toBeInTheDocument();
  });

  it('shows empty message when no snapshots', async () => {
    mockGetHistory.mockResolvedValue([]);
    render(<HistoryPanel notebookPath="/tmp/test.cnb" onRestore={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/No snapshots yet/)).toBeInTheDocument();
    });
  });
});

// ── Snapshot list ─────────────────────────────────────────────────────────────

describe('HistoryPanel — snapshot list', () => {
  const snapshots = [
    { index: 0, timestamp: '2025-01-15T10:00:00.000Z', title: 'Test', cellCount: 3, configCount: 1, cellSummary: [] },
    { index: 1, timestamp: '2025-01-15T11:00:00.000Z', title: 'Test', cellCount: 5, configCount: 2, cellSummary: [] },
  ];

  it('renders snapshot count', async () => {
    mockGetHistory.mockResolvedValue(snapshots);
    render(<HistoryPanel notebookPath="/tmp/test.cnb" onRestore={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('renders cell count for each snapshot', async () => {
    mockGetHistory.mockResolvedValue(snapshots);
    render(<HistoryPanel notebookPath="/tmp/test.cnb" onRestore={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('3 cells')).toBeInTheDocument();
      expect(screen.getByText('5 cells')).toBeInTheDocument();
    });
  });
});

// ── Restore ───────────────────────────────────────────────────────────────────

describe('HistoryPanel — restore', () => {
  const snapshots = [
    {
      index: 0,
      timestamp: '2025-01-15T10:00:00.000Z',
      title: 'Test',
      cellCount: 2,
      configCount: 0,
      cellSummary: [{ id: 'c1', type: 'code', preview: 'Console.Write("hi")' }],
    },
  ];

  it('calls onRestore after confirm', async () => {
    mockGetHistory.mockResolvedValue(snapshots);
    const restoredData = { title: 'Test', cells: [{ id: 'c1' }], config: [] };
    mockRestoreSnapshot.mockResolvedValue(restoredData);
    window.confirm = vi.fn(() => true);

    const onRestore = vi.fn();
    render(<HistoryPanel notebookPath="/tmp/test.cnb" onRestore={onRestore} />);

    // Wait for snapshots to load, then click to select
    await waitFor(() => {
      expect(screen.getByText('2 cells')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('2 cells').closest('button'));

    // Now click Restore
    await waitFor(() => {
      expect(screen.getByText('Restore')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Restore'));

    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith(restoredData);
    });
  });
});
