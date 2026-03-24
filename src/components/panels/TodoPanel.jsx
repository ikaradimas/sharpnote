import React, { useMemo } from 'react';

const TODO_RE = /\/\/\s*(TODO|FIXME|BUG)\b:?\s*(.+)/gi;

function extractTodos(cells) {
  const items = [];
  (cells || []).forEach((cell, index) => {
    if (cell.type !== 'code') return;
    const matches = [...(cell.content || '').matchAll(TODO_RE)];
    matches.forEach((m) => {
      items.push({
        cellId: cell.id,
        cellIndex: index,
        tag: m[1].toUpperCase(),
        text: m[2].trim(),
      });
    });
  });
  return items;
}

export function TodoPanel({ cells, onNavigateToCell }) {
  const items = useMemo(() => extractTodos(cells), [cells]);

  return (
    <div className="todo-panel">
      <div className="todo-panel-header">
        <span className="todo-panel-title">To Do</span>
        <span className="todo-panel-count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="todo-panel-empty">
          No TODOs, FIXMEs, or BUGs found in code cells
        </div>
      ) : (
        <div className="todo-list">
          {items.map((item, i) => (
            <button
              key={i}
              className="todo-item"
              onClick={() => onNavigateToCell?.(item.cellId)}
              title={`Jump to cell ${item.cellIndex + 1}`}
            >
              <span className={`todo-tag todo-tag-${item.tag.toLowerCase()}`}>
                {item.tag}
              </span>
              <span className="todo-cell-num">[{item.cellIndex + 1}]</span>
              <span className="todo-text">{item.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
