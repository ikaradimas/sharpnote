import React from 'react';

const TYPES = ['double', 'int', 'string', 'bool', 'choice'];

function currentValue(p) {
  return p.value !== undefined ? p.value : p.default;
}

function isOverridden(p) {
  return p.value !== undefined && p.value !== p.default;
}

function ParamWidget({ param, onChange }) {
  const v = currentValue(param);
  const set = (newVal) => onChange({ ...param, value: newVal });

  switch (param.type) {
    case 'bool':
      return (
        <label className="nb-param-bool">
          <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} />
          <span>{param.label || param.name}</span>
        </label>
      );
    case 'choice':
      return (
        <select className="nb-param-input" value={String(v ?? '')} onChange={(e) => set(e.target.value)}>
          {(param.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    case 'int':
      return (
        <input
          className="nb-param-input"
          type="number"
          step="1"
          value={Number(v ?? 0)}
          onChange={(e) => set(parseInt(e.target.value, 10) || 0)}
        />
      );
    case 'double':
      return (
        <input
          className="nb-param-input"
          type="number"
          step="any"
          value={Number(v ?? 0)}
          onChange={(e) => set(parseFloat(e.target.value) || 0)}
        />
      );
    default:
      return (
        <input
          className="nb-param-input"
          type="text"
          value={String(v ?? '')}
          onChange={(e) => set(e.target.value)}
        />
      );
  }
}

export function NotebookParams({ params, onChange }) {
  if (!params || params.length === 0) return null;

  const updateOne = (idx, next) => {
    const updated = params.map((p, i) => i === idx ? next : p);
    onChange(updated);
  };

  const resetOne = (idx) => {
    const next = { ...params[idx] };
    delete next.value;
    updateOne(idx, next);
  };

  const resetAll = () => onChange(params.map((p) => { const n = { ...p }; delete n.value; return n; }));
  const anyOverridden = params.some(isOverridden);

  return (
    <div className="nb-params-bar">
      <span className="nb-params-label">Params</span>
      {params.map((p, i) => (
        <div key={p.name || i} className="nb-param-field">
          {p.type !== 'bool' && (
            <span className="nb-param-name" title={p.label || p.name}>
              {p.label || p.name}
            </span>
          )}
          <ParamWidget param={p} onChange={(np) => updateOne(i, np)} />
          {isOverridden(p) && (
            <button
              type="button"
              className="nb-param-reset"
              title={`Reset to default (${p.default})`}
              onClick={() => resetOne(i)}
            >
              ↺
            </button>
          )}
        </div>
      ))}
      {anyOverridden && (
        <button type="button" className="nb-params-reset-all" onClick={resetAll}>
          Reset all
        </button>
      )}
    </div>
  );
}

export const PARAM_TYPES = TYPES;
