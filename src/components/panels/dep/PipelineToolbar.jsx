import React, { useState } from 'react';
import { CELL_COLORS } from '../../../notebook-factory.js';

export function PipelineToolbar({
  pipelines,
  selectedPipelineId,
  onSelectPipeline,
  onCreatePipeline,
  onRenamePipeline,
  onDeletePipeline,
  onRunPipeline,
  selectionMode,
  onToggleSelectionMode,
  selectedCellIds,
}) {
  const [newName, setNewName] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  const handleCreate = () => {
    const name = newName.trim() || `Pipeline ${(pipelines || []).length + 1}`;
    onCreatePipeline(name, [...selectedCellIds]);
    setNewName('');
  };

  const commitRename = (id) => {
    const trimmed = editDraft.trim();
    if (trimmed) onRenamePipeline(id, trimmed);
    setEditingId(null);
  };

  return (
    <div className="dep-pipeline-section">
      <button className="dep-pipeline-header" onClick={() => setCollapsed((v) => !v)}>
        <span>{collapsed ? '▸' : '▾'} Pipelines</span>
        <span className="dep-pipeline-count">{(pipelines || []).length}</span>
      </button>
      {!collapsed && (
        <div className="dep-pipeline-body">
          {(pipelines || []).map((p) => {
            const isSelected = selectedPipelineId === p.id;
            const colorVal = CELL_COLORS.find((c) => c.id === p.color)?.value;
            return (
              <div
                key={p.id}
                className={`dep-pipeline-row${isSelected ? ' active' : ''}`}
                onClick={() => onSelectPipeline(isSelected ? null : p.id)}
              >
                {colorVal && <span className="dep-pipeline-dot" style={{ background: colorVal }} />}
                {editingId === p.id ? (
                  <input
                    className="dep-pipeline-name-input"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(p.id); if (e.key === 'Escape') setEditingId(null); }}
                    onBlur={() => commitRename(p.id)}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="dep-pipeline-name">{p.name}</span>
                )}
                <span className="dep-pipeline-cell-count">{p.cellIds.length}</span>
                <div className="dep-pipeline-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="dep-pipeline-action-btn" onClick={() => onRunPipeline(p.id)} title="Run pipeline">▶</button>
                  <button className="dep-pipeline-action-btn" onClick={() => { setEditingId(p.id); setEditDraft(p.name); }} title="Rename">✎</button>
                  <button className="dep-pipeline-action-btn dep-pipeline-del" onClick={() => onDeletePipeline(p.id)} title="Delete">✕</button>
                </div>
              </div>
            );
          })}
          <div className="dep-pipeline-create-row">
            <button
              className={`dep-pipeline-select-btn${selectionMode ? ' active' : ''}`}
              onClick={onToggleSelectionMode}
              title={selectionMode ? 'Exit selection mode' : 'Select cells for new pipeline'}
            >
              {selectionMode ? '✓ Done' : '+ Select'}
            </button>
            {selectionMode && (
              <>
                <input
                  className="dep-pipeline-name-input"
                  placeholder="Pipeline name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                />
                <button
                  className="dep-pipeline-action-btn"
                  onClick={handleCreate}
                  disabled={selectedCellIds.size === 0}
                  title="Create pipeline"
                >
                  ✓
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
