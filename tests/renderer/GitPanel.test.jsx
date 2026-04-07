import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GitPanel } from '../../src/components/panels/GitPanel.jsx';

// ── Setup ────────────────────────────────────────────────────────────────────

function makeAPI(overrides = {}) {
  return {
    gitIsRepo:     vi.fn().mockResolvedValue({ success: true, data: true }),
    gitStatus:     vi.fn().mockResolvedValue({ success: true, data: { branch: 'main', ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] } }),
    gitBranches:   vi.fn().mockResolvedValue({ success: true, data: { current: 'main', branches: ['main'] } }),
    gitLog:        vi.fn().mockResolvedValue({ success: true, data: [] }),
    gitDiff:       vi.fn().mockResolvedValue({ success: true, data: '' }),
    gitDiffCommit: vi.fn().mockResolvedValue({ success: true, data: '' }),
    gitStage:      vi.fn().mockResolvedValue({ success: true }),
    gitUnstage:    vi.fn().mockResolvedValue({ success: true }),
    gitDiscard:    vi.fn().mockResolvedValue({ success: true }),
    gitCommit:     vi.fn().mockResolvedValue({ success: true }),
    gitCheckout:   vi.fn().mockResolvedValue({ success: true }),
    gitInit:       vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

beforeEach(() => {
  window.electronAPI = makeAPI();
});

// ── No folder open ───────────────────────────────────────────────────────────

describe('GitPanel – no folder', () => {
  it('shows "No folder open" when notebookDir is null', () => {
    render(<GitPanel onToggle={vi.fn()} notebookDir={null} />);
    expect(screen.getByText('No folder open')).toBeInTheDocument();
  });
});

// ── Not a repo ───────────────────────────────────────────────────────────────

describe('GitPanel – not a repo', () => {
  it('shows "Not a Git repository" with init button', async () => {
    window.electronAPI = makeAPI({
      gitIsRepo: vi.fn().mockResolvedValue({ success: true, data: false }),
    });

    await act(async () => {
      render(<GitPanel onToggle={vi.fn()} notebookDir="/tmp/not-a-repo" />);
    });

    expect(screen.getByText('Not a Git repository')).toBeInTheDocument();
    expect(screen.getByText('Initialize Repository')).toBeInTheDocument();
  });
});

// ── Normal repo state ────────────────────────────────────────────────────────

describe('GitPanel – normal repo', () => {
  it('shows branch name and file lists', async () => {
    window.electronAPI = makeAPI({
      gitStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          branch: 'feature/test',
          ahead: 0,
          behind: 0,
          staged: [{ file: 'staged.txt', status: 'A' }],
          unstaged: [{ file: 'modified.txt', status: 'M' }],
          untracked: [{ file: 'new.txt', status: '?' }],
        },
      }),
    });

    await act(async () => {
      render(<GitPanel onToggle={vi.fn()} notebookDir="/tmp/repo" />);
    });

    expect(screen.getByText('feature/test')).toBeInTheDocument();
    expect(screen.getByText('staged.txt')).toBeInTheDocument();
    expect(screen.getByText('modified.txt')).toBeInTheDocument();
    expect(screen.getByText('new.txt')).toBeInTheDocument();
  });

  it('shows commit input and button', async () => {
    await act(async () => {
      render(<GitPanel onToggle={vi.fn()} notebookDir="/tmp/repo" />);
    });

    expect(screen.getByPlaceholderText('Commit message…')).toBeInTheDocument();
    expect(screen.getByText('Commit ✓')).toBeInTheDocument();
  });

  it('commit button is disabled when no staged files', async () => {
    await act(async () => {
      render(<GitPanel onToggle={vi.fn()} notebookDir="/tmp/repo" />);
    });

    const btn = screen.getByText('Commit ✓');
    expect(btn).toBeDisabled();
  });

  it('shows "Working tree clean" when all lists are empty', async () => {
    await act(async () => {
      render(<GitPanel onToggle={vi.fn()} notebookDir="/tmp/repo" />);
    });

    expect(screen.getByText('Working tree clean')).toBeInTheDocument();
  });

  it('has a refresh button', async () => {
    await act(async () => {
      render(<GitPanel onToggle={vi.fn()} notebookDir="/tmp/repo" />);
    });

    expect(screen.getByTitle('Refresh')).toBeInTheDocument();
  });
});
