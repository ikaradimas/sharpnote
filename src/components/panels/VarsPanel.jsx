import React, { useState } from 'react';

export function VarsPanel({ vars }) {
  const [search, setSearch] = useState('');
  const filtered = search
    ? vars.filter(v => v.name.toLowerCase().includes(search.toLowerCase()) ||
                       v.typeName.toLowerCase().includes(search.toLowerCase()))
    : vars;
  return (
    <div className="vars-panel">
      <div className="vars-panel-header">
        <span className="vars-panel-title">Variables</span>
        <input className="vars-search" placeholder="filter…" value={search}
               onChange={e => setSearch(e.target.value)} spellCheck={false} />
      </div>
      {filtered.length === 0 ? (
        <div className="vars-empty">{vars.length === 0 ? 'No variables in scope yet' : 'No matches'}</div>
      ) : (
        <div className="vars-table-wrap">
          <table className="vars-table">
            <thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.name} className="vars-row">
                  <td className="vars-name">{v.name}</td>
                  <td><span className="vars-type-badge">{v.typeName}</span></td>
                  <td className="vars-value" title={v.value}>
                    {v.isNull ? <span className="vars-null">null</span> : v.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
