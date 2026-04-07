import React, { useState, useEffect, useCallback } from 'react';
import { FileStatusList } from './git/FileStatusList.jsx';
import { DiffView } from './git/DiffView.jsx';

export function GitPanel({ onToggle, notebookDir, refreshKey }) {
  const [isRepo, setIsRepo] = useState(null); // null = loading, true/false
  const [status, setStatus] = useState(null);
  const [branches, setBranches] = useState(null);
  const [log, setLog] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedStaged, setSelectedStaged] = useState(false);
  const [diffText, setDiffText] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [commitMsg, setCommitMsg] = useState('');
  const [branchDropdown, setBranchDropdown] = useState(false);
  const [error, setError] = useState(null);

  const cwd = notebookDir || null;

  const refresh = useCallback(async () => {
    if (!cwd || !window.electronAPI) return;
    setError(null);

    const repoCheck = await window.electronAPI.gitIsRepo(cwd);
    setIsRepo(repoCheck?.data ?? false);
    if (!repoCheck?.data) return;

    const [statusRes, branchRes, logRes] = await Promise.all([
      window.electronAPI.gitStatus(cwd),
      window.electronAPI.gitBranches(cwd),
      window.electronAPI.gitLog(cwd, 15),
    ]);

    if (statusRes?.success) setStatus(statusRes.data);
    else setError(statusRes?.error);
    if (branchRes?.success) setBranches(branchRes.data);
    if (logRes?.success) setLog(logRes.data);
  }, [cwd]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (refreshKey > 0) refresh(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [diffMode, setDiffMode] = useState('auto'); // 'auto' | 'head'

  const loadDiff = useCallback(async (file, staged = false, mode = 'auto') => {
    if (!cwd) return;
    setSelectedFile(file);
    setSelectedStaged(staged);
    setDiffMode(mode);
    const result = mode === 'head'
      ? await window.electronAPI?.gitDiffHead(cwd, file)
      : await window.electronAPI?.gitDiff(cwd, file, staged);
    setDiffText(result?.success ? result.data : (result?.error || ''));
  }, [cwd]);

  const handleSelect = useCallback((file, action) => {
    if (action === 'discard') {
      window.electronAPI?.gitDiscard(cwd, [file]).then(refresh);
      return;
    }
    // Determine if file is staged
    const isStaged = status?.staged?.some(f => f.file === file);
    loadDiff(file, isStaged);
  }, [cwd, status, loadDiff, refresh]);

  const handleStage = useCallback(async (files) => {
    await window.electronAPI?.gitStage(cwd, files);
    refresh();
  }, [cwd, refresh]);

  const handleUnstage = useCallback(async (files) => {
    await window.electronAPI?.gitUnstage(cwd, files);
    refresh();
  }, [cwd, refresh]);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    const result = await window.electronAPI?.gitCommit(cwd, commitMsg.trim());
    if (result?.success) {
      setCommitMsg('');
      setSelectedFile(null);
      setDiffText('');
      refresh();
    } else {
      setError(result?.error);
    }
  }, [cwd, commitMsg, refresh]);

  const handleCheckout = useCallback(async (branch) => {
    setBranchDropdown(false);
    await window.electronAPI?.gitCheckout(cwd, branch);
    refresh();
  }, [cwd, refresh]);

  const handleCreateBranch = useCallback(async () => {
    const name = newBranchName.trim();
    if (!name) return;
    const result = await window.electronAPI?.gitCreateBranch(cwd, name);
    if (result?.success) {
      setNewBranchName('');
      setBranchDropdown(false);
      refresh();
    } else {
      setError(result?.error);
    }
  }, [cwd, newBranchName, refresh]);

  const handleInit = useCallback(async () => {
    await window.electronAPI?.gitInit(cwd);
    refresh();
  }, [cwd, refresh]);

  const handleLogClick = useCallback(async (hash) => {
    const result = await window.electronAPI?.gitDiffCommit(cwd, hash);
    if (result?.success) {
      setSelectedFile(`commit:${hash.slice(0, 7)}`);
      setDiffText(result.data);
    }
  }, [cwd]);

  // No working directory
  if (!cwd) {
    return (
      <div className="panel-empty-state">
        <span className="panel-empty-title">No folder open</span>
        <span className="panel-empty-hint">Open a notebook to use Git integration</span>
      </div>
    );
  }

  // Loading
  if (isRepo === null) {
    return <div className="panel-empty-state"><span className="panel-empty-hint">Checking repository…</span></div>;
  }

  // Not a repo
  if (!isRepo) {
    return (
      <div className="panel-empty-state">
        <span className="panel-empty-title">Not a Git repository</span>
        <span className="panel-empty-hint">{cwd}</span>
        <button className="git-init-btn" onClick={handleInit}>Initialize Repository</button>
      </div>
    );
  }

  const hasStaged = status?.staged?.length > 0;

  return (
    <div className="git-panel">
      {/* Branch bar */}
      <div className="git-branch-bar">
        <span className="git-branch-dot" />
        <span className="git-branch-name">{status?.branch || '…'}</span>
        {status?.ahead > 0 && <span className="git-branch-badge">↑{status.ahead}</span>}
        {status?.behind > 0 && <span className="git-branch-badge">↓{status.behind}</span>}
        <div className="git-branch-dropdown-wrap">
          <button className="git-branch-btn" onClick={() => setBranchDropdown(v => !v)}>Branch ▾</button>
          {branchDropdown && branches && (
            <div className="git-branch-dropdown">
              {branches.branches.map(b => (
                <button
                  key={b}
                  className={`git-branch-option${b === branches.current ? ' current' : ''}`}
                  onClick={() => handleCheckout(b)}
                >
                  {b === branches.current ? `● ${b}` : `  ${b}`}
                </button>
              ))}
              <div className="git-new-branch-row">
                <input
                  className="git-new-branch-input"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBranch(); e.stopPropagation(); }}
                  placeholder="New branch…"
                  spellCheck={false}
                />
                <button
                  className="git-new-branch-btn"
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim()}
                  title="Create and switch to new branch"
                >+</button>
              </div>
            </div>
          )}
        </div>
        <button className="git-refresh-btn" onClick={refresh} title="Refresh">↻</button>
      </div>

      {error && <div className="git-error">{error}</div>}

      <div className="git-scroll">
        {/* File lists */}
        <FileStatusList
          title="Staged Changes"
          files={status?.staged || []}
          selectedFile={selectedFile}
          onSelect={(f) => loadDiff(f, true)}
          actionLabel="− Unstage"
          onAction={handleUnstage}
          onFileAction={handleUnstage}
        />
        <FileStatusList
          title="Unstaged Changes"
          files={status?.unstaged || []}
          selectedFile={selectedFile}
          onSelect={handleSelect}
          actionLabel="+ Stage"
          onAction={handleStage}
          onFileAction={handleStage}
          discardable
        />
        <FileStatusList
          title="Untracked"
          files={status?.untracked || []}
          selectedFile={selectedFile}
          onSelect={handleSelect}
          actionLabel="+ Stage"
          onAction={handleStage}
          onFileAction={handleStage}
        />

        {/* Empty state */}
        {!hasStaged && !status?.unstaged?.length && !status?.untracked?.length && (
          <div className="git-clean">Working tree clean</div>
        )}

        {/* Commit box */}
        <div className="git-commit-box">
          <input
            className="git-commit-input"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="Commit message…"
            onKeyDown={(e) => { if (e.key === 'Enter' && hasStaged) handleCommit(); }}
            spellCheck={false}
          />
          <button
            className="git-commit-btn"
            onClick={handleCommit}
            disabled={!hasStaged || !commitMsg.trim()}
            title={hasStaged ? 'Commit staged changes' : 'Stage changes first'}
          >
            Commit ✓
          </button>
        </div>

        {/* History */}
        {log.length > 0 && (
          <div className="git-history-section">
            <div className="git-history-header">History</div>
            {log.map((entry) => (
              <div key={entry.hash} className="git-history-row" onClick={() => handleLogClick(entry.hash)}>
                <span className="git-history-hash">{entry.hash.slice(0, 7)}</span>
                <span className="git-history-msg">{entry.message}</span>
                <span className="git-history-date">{formatRelative(entry.date)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Diff viewer */}
        <DiffView
          diffText={diffText}
          fileName={selectedFile}
          diffMode={diffMode}
          onToggleDiffMode={() => {
            if (!selectedFile || selectedFile.startsWith('commit:')) return;
            const next = diffMode === 'head' ? 'auto' : 'head';
            loadDiff(selectedFile, selectedStaged, next);
          }}
        />
      </div>
    </div>
  );
}

function formatRelative(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
    return d.toLocaleDateString();
  } catch { return dateStr; }
}
