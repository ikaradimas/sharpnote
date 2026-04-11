import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import mermaid from 'mermaid';
import { applyMath } from '../../utils.js';
import { CodeEditor } from './CodeEditor.jsx';
import { CellControls } from './CellControls.jsx';

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });

export function MarkdownCell({
  cell, cellIndex, onUpdate, onDelete, onCopy, onMoveUp, onMoveDown,
  isSectionHeader, onToggleCollapse, collapsedCount,
}) {
  const [editing, setEditing] = useState(!cell.content);
  const [draft, setDraft] = useState(cell.content);
  const renderRef = useRef(null);

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
    () => cell.content ? marked.parse(applyMath(cell.content)) : '',
    [cell.content]
  );

  // Render mermaid diagrams after HTML is injected into the DOM.
  // Depends on `editing` so it re-fires whenever the user exits edit mode,
  // even if the cell content (and therefore renderedHtml) didn't change.
  useEffect(() => {
    if (editing) return;
    const container = renderRef.current;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll('pre > code.language-mermaid'));
    if (nodes.length === 0) return;

    const ts = Date.now();
    nodes.forEach(async (node, idx) => {
      const pre = node.parentElement;
      const graphDef = node.textContent;
      const id = `mermaid-${cell.id}-${ts}-${idx}`;
      try {
        const { svg } = await mermaid.render(id, graphDef);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-render';
        wrapper.innerHTML = svg;
        pre.replaceWith(wrapper);
      } catch (e) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-render mermaid-error';
        wrapper.textContent = String(e.message || e);
        pre.replaceWith(wrapper);
      }
    });
  }, [renderedHtml, cell.id, editing]);

  const collapsed = cell.collapsed || false;

  return (
    <div className={`cell markdown-cell${collapsed ? ' cell-section-collapsed' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="cell-controls">
        {isSectionHeader && (
          <button
            className="cell-ctrl-btn cell-collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand section' : 'Collapse section'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}
        <CellControls onCopy={onCopy} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
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
          <span className="md-edit-hint" title="Double-click to edit">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M7 2l3 3-7 7H0V9z" /><path d="M6 3l3 3" />
            </svg>
          </span>
          <div
            ref={renderRef}
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
