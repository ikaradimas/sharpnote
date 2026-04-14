import React, { useState, useMemo } from 'react';
import { CellControls } from './CellControls.jsx';
import { CellNameColor } from './CellNameColor.jsx';
import { CellRunGroup } from './CellRunGroup.jsx';

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
  onModeChange,
  onTruePathChange,
  onFalsePathChange,
  onSwitchPathsChange,
  onRun,
  onRunFrom, onRunTo,
  onDelete, onCopy,
  onMoveUp,
  onMoveDown,
  columns = 0, onColumnsChange,
}) {
  const result = decisionResult?.result;
  const message = decisionResult?.message;
  const hasResult = decisionResult != null;
  const mode = cell.mode || 'bool';

  const statusClass = !hasResult ? '' :
    mode === 'switch' ? ' decision-cell-matched' :
    result ? ' decision-cell-true' : ' decision-cell-false';

  const cellOptions = useMemo(() =>
    (allCells || [])
      .filter((c) => c.id !== cell.id && c.type !== 'markdown')
      .map((c) => ({ id: c.id, label: c.name || c.label || c.content?.split('\n')[0]?.slice(0, 30) || c.id })),
    [allCells, cell.id]
  );

  const truePath = cell.truePath || [];
  const falsePath = cell.falsePath || [];
  const switchPaths = cell.switchPaths || {};

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
            mode === 'switch'
              ? <span className="decision-diamond decision-diamond-switch">◆</span>
              : <span className={`decision-diamond ${result ? 'decision-diamond-true' : 'decision-diamond-false'}`}>◆</span>
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
            <select
              className="decision-mode-select"
              value={mode}
              onChange={(e) => onModeChange(e.target.value)}
              title="Decision mode"
            >
              <option value="bool">bool</option>
              <option value="switch">switch</option>
            </select>
          </div>
          <input
            className="check-expr-input"
            placeholder={mode === 'switch'
              ? 'C# expression returning a value, e.g. environment'
              : 'C# boolean expression, e.g. environment == "prod"'}
            value={cell.content}
            onChange={(e) => onUpdate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && kernelReady && !anyRunning) { e.preventDefault(); onRun(); } }}
            spellCheck={false}
          />
          {hasResult && !isRunning && message && (
            <span className="check-message">
              {mode === 'switch' ? `→ "${message}"` : message}
            </span>
          )}
          {mode === 'bool' ? (
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
          ) : (
            <SwitchPathEditor
              switchPaths={switchPaths}
              cellOptions={cellOptions}
              onChange={onSwitchPathsChange}
              matchedKey={hasResult ? String(result) : null}
            />
          )}
        </div>
        <div className="decision-cell-actions">
          <CellRunGroup onRun={onRun} onRunFrom={onRunFrom} onRunTo={onRunTo} isRunning={isRunning} disabled={anyRunning || !kernelReady || !cell.content.trim()} />
          <CellControls onCopy={onCopy} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} columns={columns} onColumnsChange={onColumnsChange} />
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

function SwitchPathEditor({ switchPaths, cellOptions, onChange, matchedKey }) {
  const [newCase, setNewCase] = useState('');
  const [openCase, setOpenCase] = useState(null);

  const cases = Object.keys(switchPaths);

  const addCase = () => {
    const key = newCase.trim();
    if (!key || switchPaths[key]) return;
    onChange({ ...switchPaths, [key]: [] });
    setNewCase('');
  };

  const removeCase = (key) => {
    const next = { ...switchPaths };
    delete next[key];
    onChange(next);
  };

  const toggleCell = (caseKey, cellId) => {
    const current = switchPaths[caseKey] || [];
    const next = current.includes(cellId)
      ? current.filter((id) => id !== cellId)
      : [...current, cellId];
    onChange({ ...switchPaths, [caseKey]: next });
  };

  return (
    <div className="decision-switch-paths">
      {cases.map((caseKey) => {
        const cells = switchPaths[caseKey] || [];
        const isMatched = matchedKey === caseKey;
        const isOpen = openCase === caseKey;
        return (
          <div key={caseKey} className={`decision-switch-case${isMatched ? ' matched' : ''}`}>
            <div className="decision-switch-case-header">
              <span className={`decision-switch-key${isMatched ? ' matched' : ''}`}>
                {caseKey === 'default' ? 'default' : `"${caseKey}"`} →
              </span>
              <button className="decision-path-toggle" onClick={() => setOpenCase(isOpen ? null : caseKey)}>
                {cells.length === 0 ? 'none' : `${cells.length} cell${cells.length !== 1 ? 's' : ''}`} ▾
              </button>
              <button className="decision-switch-remove" onClick={() => removeCase(caseKey)} title="Remove case">✕</button>
            </div>
            {isOpen && (
              <div className="decision-path-dropdown decision-switch-dropdown">
                {cellOptions.length === 0 && <span className="decision-path-empty">No cells available</span>}
                {cellOptions.map((opt) => (
                  <label key={opt.id} className="decision-path-option">
                    <input
                      type="checkbox"
                      checked={cells.includes(opt.id)}
                      onChange={() => toggleCell(caseKey, opt.id)}
                    />
                    <span className="decision-path-option-label">{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="decision-switch-add">
        <input
          className="decision-switch-add-input"
          placeholder="Case value…"
          value={newCase}
          onChange={(e) => setNewCase(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addCase(); }}
        />
        <button className="decision-switch-add-btn" onClick={addCase} disabled={!newCase.trim()}>+ Case</button>
        {!switchPaths.default && (
          <button className="decision-switch-add-btn" onClick={() => onChange({ ...switchPaths, default: [] })}>+ Default</button>
        )}
      </div>
    </div>
  );
}
