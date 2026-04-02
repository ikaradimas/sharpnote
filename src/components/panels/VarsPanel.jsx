import React, { useState } from 'react';

function Sparkline({ values }) {
  if (!values || values.length < 2) return null;
  const w = 64, h = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} className="var-sparkline" aria-hidden="true">
      <polyline points={pts} />
    </svg>
  );
}

export function VarsPanel({ vars, varHistory, onInspect }) {
  const [search, setSearch] = useState('');
  const filtered = search
    ? vars.filter((v) =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.typeName.toLowerCase().includes(search.toLowerCase()))
    : vars;

  return (
    <div className="vars-panel">
      <div className="vars-panel-header">
        <span className="vars-panel-title">Variables</span>
        <input
          className="vars-search"
          placeholder="filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          spellCheck={false}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="vars-empty">
          {vars.length === 0 ? 'No variables in scope yet' : 'No matches'}
        </div>
      ) : (
        <div className="vars-table-wrap">
          <table className="vars-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
                <th className="vars-sparkline-col"></th>
                <th className="vars-inspect-col"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const hist = varHistory?.[v.name];
                return (
                  <tr key={v.name} className="vars-row">
                    <td className="vars-name">{v.name}</td>
                    <td><span className="vars-type-badge">{v.typeName}</span></td>
                    <td className="vars-value" title={v.value}>
                      {v.isNull ? <span className="vars-null">null</span> : v.value}
                    </td>
                    <td className="vars-sparkline-cell">
                      {hist && hist.length >= 2 && <Sparkline values={hist.map((p) => typeof p === 'number' ? p : p.v)} />}
                    </td>
                    <td className="vars-inspect-cell">
                      {onInspect && (
                        <button
                          className="vars-inspect-btn"
                          title={`Inspect ${v.name}`}
                          onClick={() => onInspect(v.name)}
                        >
                          ⊕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
