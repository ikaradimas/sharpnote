import React, { useState, useMemo } from 'react';
import { marked } from 'marked';
import { CodeEditor } from './CodeEditor.jsx';

function CellControls({ onMoveUp, onMoveDown, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  React.useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (confirming) {
    return (
      <>
        <span className="delete-confirm-label">Delete?</span>
        <button className="cell-ctrl-btn cell-ctrl-danger" title="Confirm delete" onClick={onDelete}>✓</button>
        <button className="cell-ctrl-btn" title="Cancel" onClick={() => setConfirming(false)}>✕</button>
      </>
    );
  }

  return (
    <>
      <button className="cell-ctrl-btn" title="Move Up" onClick={onMoveUp}>↑</button>
      <button className="cell-ctrl-btn" title="Move Down" onClick={onMoveDown}>↓</button>
      <button className="cell-ctrl-btn" title="Delete" onClick={() => setConfirming(true)}>✕</button>
    </>
  );
}

export function MarkdownCell({
  cell, cellIndex, onUpdate, onDelete, onMoveUp, onMoveDown,
  isSectionHeader, onToggleCollapse, collapsedCount,
}) {
  const [editing, setEditing] = useState(!cell.content);
  const [draft, setDraft] = useState(cell.content);

  const enterEdit = () => {
    setDraft(cell.content);
    setEditing(true);
  };

  const handleOk = () => {
    onUpdate(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(cell.content);
    setEditing(false);
  };

  const renderedHtml = useMemo(
    () => cell.content ? marked.parse(cell.content) : '',
    [cell.content]
  );

  const collapsed = cell.collapsed || false;

  return (
    <div className={`cell markdown-cell${collapsed ? ' cell-section-collapsed' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      {isSectionHeader && (
        <button
          className="cell-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand section' : 'Collapse section'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
      )}
      <div className="cell-controls">
        <CellControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
      </div>
      {editing ? (
        <div onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}>
          <CodeEditor
            value={draft}
            onChange={setDraft}
            language="markdown"
            onCtrlEnter={handleOk}
            cellIndex={cellIndex}
          />
          <div className="md-edit-actions">
            <button className="md-action-btn md-ok-btn" onClick={handleOk} title="Commit (Ctrl+Enter)">OK</button>
            <button className="md-action-btn md-cancel-btn" onClick={handleCancel} title="Discard (Escape)">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="markdown-render-wrap" onDoubleClick={enterEdit}>
          <div
            className="markdown-render"
            dangerouslySetInnerHTML={{ __html: renderedHtml || '<span class="markdown-placeholder">Double-click to write markdown…</span>' }}
          />
          {collapsed && collapsedCount > 0 && (
            <button className="cell-section-collapsed-indicator" onClick={onToggleCollapse}>
              {collapsedCount} cell{collapsedCount !== 1 ? 's' : ''} hidden — click to expand
            </button>
          )}
        </div>
      )}
    </div>
  );
}
