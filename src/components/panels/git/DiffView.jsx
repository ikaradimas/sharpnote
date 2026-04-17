import React, { useState } from 'react';
import { parseDiff } from '../../../utils/diff-parser.js';
import { MergeConflictView } from './MergeConflictView.jsx';

export function DiffView({ diffText, fileName, diffMode, onToggleDiffMode, blameToggle }) {
  const [viewMode, setViewMode] = useState('unified'); // 'unified' | 'split'
  const [showConflictResolver, setShowConflictResolver] = useState(false);
  const hunks = parseDiff(diffText);

  const hasConflicts = diffText && diffText.includes('<<<<<<<');

  if (!diffText) {
    return <div className="git-diff-empty">Select a file to view its diff</div>;
  }

  if (showConflictResolver && hasConflicts) {
    return (
      <div className="git-diff-view">
        <div className="git-diff-header">
          <span className="git-diff-filename">{fileName}</span>
          <button
            className="git-diff-head-btn active"
            onClick={() => setShowConflictResolver(false)}
          >Back to Diff</button>
        </div>
        <MergeConflictView diffText={diffText} />
      </div>
    );
  }

  if (hunks.length === 0) {
    return <div className="git-diff-empty">No changes (binary file or empty diff)</div>;
  }

  const isCommitDiff = fileName?.startsWith('commit:');

  return (
    <div className="git-diff-view">
      <div className="git-diff-header">
        <span className="git-diff-filename">{fileName}</span>
        {hasConflicts && (
          <button
            className="git-diff-head-btn"
            onClick={() => setShowConflictResolver(true)}
            title="Open merge conflict resolver"
          >Resolve Conflicts</button>
        )}
        {!isCommitDiff && onToggleDiffMode && (
          <button
            className={`git-diff-head-btn${diffMode === 'head' ? ' active' : ''}`}
            onClick={onToggleDiffMode}
            title={diffMode === 'head' ? 'Showing all changes vs HEAD — click for section diff' : 'Click to show all changes vs last commit'}
          >
            vs HEAD
          </button>
        )}
        {blameToggle}
        <div className="git-diff-mode-toggle">
          <button
            className={`git-diff-mode-btn${viewMode === 'unified' ? ' active' : ''}`}
            onClick={() => setViewMode('unified')}
          >Unified</button>
          <button
            className={`git-diff-mode-btn${viewMode === 'split' ? ' active' : ''}`}
            onClick={() => setViewMode('split')}
          >Split</button>
        </div>
      </div>
      <div className="git-diff-content">
        {viewMode === 'unified'
          ? <UnifiedView hunks={hunks} />
          : <SplitView hunks={hunks} />}
      </div>
    </div>
  );
}

function UnifiedView({ hunks }) {
  return (
    <div className="git-diff-unified">
      {hunks.map((hunk, hi) => (
        <div key={hi} className="git-diff-hunk">
          <div className="git-diff-hunk-header">{hunk.header}</div>
          {hunk.lines.map((line, li) => (
            <div key={li} className={`git-diff-line diff-${line.type}`}>
              <span className="git-diff-ln git-diff-ln-old">{line.oldLine ?? ''}</span>
              <span className="git-diff-ln git-diff-ln-new">{line.newLine ?? ''}</span>
              <span className="git-diff-prefix">
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
              </span>
              <span className="git-diff-text">{line.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SplitView({ hunks }) {
  return (
    <div className="git-diff-split">
      {hunks.map((hunk, hi) => {
        const pairs = buildSplitPairs(hunk.lines);
        return (
          <div key={hi} className="git-diff-hunk">
            <div className="git-diff-hunk-header git-diff-hunk-header-split">
              <span>{hunk.header}</span>
            </div>
            {pairs.map((pair, pi) => (
              <div key={pi} className="git-diff-split-row">
                <div className={`git-diff-split-cell${pair.left?.type === 'del' ? ' diff-del' : pair.left?.type === 'ctx' ? ' diff-ctx' : ''}`}>
                  <span className="git-diff-ln">{pair.left?.oldLine ?? ''}</span>
                  <span className="git-diff-text">{pair.left?.content ?? ''}</span>
                </div>
                <div className={`git-diff-split-cell${pair.right?.type === 'add' ? ' diff-add' : pair.right?.type === 'ctx' ? ' diff-ctx' : ''}`}>
                  <span className="git-diff-ln">{pair.right?.newLine ?? ''}</span>
                  <span className="git-diff-text">{pair.right?.content ?? ''}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function buildSplitPairs(lines) {
  const pairs = [];
  const dels = [];
  const adds = [];

  const flushDelAdd = () => {
    const max = Math.max(dels.length, adds.length);
    for (let i = 0; i < max; i++) {
      pairs.push({ left: dels[i] || null, right: adds[i] || null });
    }
    dels.length = 0;
    adds.length = 0;
  };

  for (const line of lines) {
    if (line.type === 'del') {
      dels.push(line);
    } else if (line.type === 'add') {
      adds.push(line);
    } else {
      flushDelAdd();
      pairs.push({ left: line, right: line });
    }
  }
  flushDelAdd();
  return pairs;
}
