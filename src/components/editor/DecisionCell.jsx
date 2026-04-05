import React, { useState, useMemo } from 'react';
import { CellControls } from './CellControls.jsx';
import { CellNameColor } from './CellNameColor.jsx';

export function DecisionCell({
  cell,
  cellIndex,
  decisionResult,
  notebookId,
  isRunning,
  anyRunning,
  kernelReady = true,
  allCells,
  onUpdate,
  onLabelChange,
  onNameChange,
  onColorChange,
  onTruePathChange,
  onFalsePathChange,
  onRun,
  onDelete,
  onMoveUp,
  onMoveDown,
}) {
  const result = decisionResult?.result;
  const message = decisionResult?.message;
  const hasResult = decisionResult != null;

  const statusClass = !hasResult ? '' : result ? ' decision-cell-true' : ' decision-cell-false';

  // Build cell options for path dropdowns (exclude self)
  const cellOptions = useMemo(() =>
    (allCells || [])
      .filter((c) => c.id !== cell.id && c.type !== 'markdown')
      .map((c) => ({ id: c.id, label: c.name || c.label || c.content?.split('\n')[0]?.slice(0, 30) || c.id })),
    [allCells, cell.id]
  );

  const truePath = cell.truePath || [];
  const falsePath = cell.falsePath || [];

  const togglePath = (cellId, path, setter) => {
    if (path.includes(cellId)) setter(path.filter((id) => id !== cellId));
    else setter([...path, cellId]);
  };

  return (
    <div className={`cell decision-cell${isRunning ? ' running' : ''}${statusClass}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="decision-cell-body">
        <div className="decision-cell-indicator">
          {isRunning ? (
            <span className="check-spinner" />
          ) : hasResult ? (
            <span className={`decision-diamond ${result ? 'decision-diamond-true' : 'decision-diamond-false'}`}>◆</span>
          ) : (
            <span className="decision-diamond decision-diamond-pending">◇</span>
          )}
        </div>
        <div className="decision-cell-content">
          <div className="decision-cell-header-row">
            <CellNameColor name={cell.name} color={cell.color} onNameChange={onNameChange} onColorChange={onColorChange} />
            <input
              className="check-label-input"
              placeholder="Decision label (optional)"
              value={cell.label || ''}
              onChange={(e) => onLabelChange(e.target.value)}
              spellCheck={false}
            />
          </div>
          <input
            className="check-expr-input"
            placeholder="C# boolean expression, e.g. environment == &quot;prod&quot;"
            value={cell.content}
            onChange={(e) => onUpdate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && kernelReady && !anyRunning) { e.preventDefault(); onRun(); } }}
            spellCheck={false}
          />
          {hasResult && !isRunning && message && (
            <span className="check-message">{message}</span>
          )}
          <div className="decision-paths">
            <PathSelector
              label="True →"
              className="decision-path-true"
              selected={truePath}
              options={cellOptions}
              onToggle={(id) => togglePath(id, truePath, (v) => onTruePathChange(v))}
            />
            <PathSelector
              label="False →"
              className="decision-path-false"
              selected={falsePath}
              options={cellOptions}
              onToggle={(id) => togglePath(id, falsePath, (v) => onFalsePathChange(v))}
            />
          </div>
        </div>
        <div className="decision-cell-actions">
          <button
            className="run-btn decision-run-btn"
            onClick={onRun}
            disabled={anyRunning || !kernelReady || !cell.content.trim()}
            title="Evaluate (Enter)"
          >
            ▶
          </button>
          <CellControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

function PathSelector({ label, className, selected, options, onToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`decision-path-selector ${className}`}>
      <span className="decision-path-label">{label}</span>
      <button className="decision-path-toggle" onClick={() => setOpen((v) => !v)}>
        {selected.length === 0 ? 'none' : `${selected.length} cell${selected.length !== 1 ? 's' : ''}`} ▾
      </button>
      {open && (
        <div className="decision-path-dropdown">
          {options.length === 0 && <span className="decision-path-empty">No cells available</span>}
          {options.map((opt) => (
            <label key={opt.id} className="decision-path-option">
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={() => onToggle(opt.id)}
              />
              <span className="decision-path-option-label">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
