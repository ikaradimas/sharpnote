import React, { useState, useMemo, useCallback } from 'react';

const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IS NULL', 'IS NOT NULL'];

export function QueryBuilder({ schema }) {
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedColumns, setSelectedColumns] = useState(new Set());
  const [whereClauses, setWhereClauses] = useState([]);

  const tables = useMemo(() => schema?.tables || [], [schema]);
  const currentTable = useMemo(() => tables.find((t) => {
    const fullName = t.schema ? `${t.schema}.${t.name}` : t.name;
    return fullName === selectedTable;
  }), [tables, selectedTable]);
  const columns = currentTable?.columns || [];

  const toggleColumn = useCallback((colName) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) next.delete(colName);
      else next.add(colName);
      return next;
    });
  }, []);

  const addWhere = () => {
    setWhereClauses((prev) => [...prev, { column: columns[0]?.name || '', operator: '=', value: '' }]);
  };

  const updateWhere = (idx, field, val) => {
    setWhereClauses((prev) => prev.map((w, i) => i === idx ? { ...w, [field]: val } : w));
  };

  const removeWhere = (idx) => {
    setWhereClauses((prev) => prev.filter((_, i) => i !== idx));
  };

  const sql = useMemo(() => {
    if (!selectedTable) return '';
    const cols = selectedColumns.size > 0 ? [...selectedColumns].join(', ') : '*';
    let q = `SELECT ${cols}\nFROM ${selectedTable}`;
    const validWhere = whereClauses.filter((w) => w.column);
    if (validWhere.length > 0) {
      const conditions = validWhere.map((w) => {
        if (w.operator === 'IS NULL' || w.operator === 'IS NOT NULL') return `${w.column} ${w.operator}`;
        return `${w.column} ${w.operator} '${w.value.replace(/'/g, "''")}'`;
      });
      q += `\nWHERE ${conditions.join('\n  AND ')}`;
    }
    return q + ';';
  }, [selectedTable, selectedColumns, whereClauses]);

  const handleCopy = () => {
    if (sql) navigator.clipboard.writeText(sql);
  };

  const handleSelectTable = (e) => {
    setSelectedTable(e.target.value);
    setSelectedColumns(new Set());
    setWhereClauses([]);
  };

  if (!schema || tables.length === 0) {
    return <div className="qb-section" style={{ color: 'var(--text-dim)', fontSize: 10 }}>Attach a database to use the query builder.</div>;
  }

  return (
    <div className="qb-section">
      <div className="qb-row">
        <span className="qb-label">Table</span>
        <select className="qb-select" value={selectedTable} onChange={handleSelectTable}>
          <option value="">-- select --</option>
          {tables.map((t) => {
            const fullName = t.schema ? `${t.schema}.${t.name}` : t.name;
            return <option key={fullName} value={fullName}>{fullName}</option>;
          })}
        </select>
      </div>

      {currentTable && (
        <>
          <div className="qb-row">
            <span className="qb-label">Columns</span>
          </div>
          <div className="qb-columns">
            {columns.map((col) => (
              <label key={col.name} className="qb-col-check">
                <input
                  type="checkbox"
                  checked={selectedColumns.has(col.name)}
                  onChange={() => toggleColumn(col.name)}
                />
                {col.name}
              </label>
            ))}
          </div>

          <div className="qb-row">
            <span className="qb-label">WHERE</span>
            <button className="qb-add-where" onClick={addWhere}>+ Add</button>
          </div>
          {whereClauses.map((w, i) => (
            <div key={i} className="qb-where-row">
              <select className="qb-where-input" value={w.column} onChange={(e) => updateWhere(i, 'column', e.target.value)}>
                {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <select className="qb-where-input" value={w.operator} onChange={(e) => updateWhere(i, 'operator', e.target.value)}>
                {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              {w.operator !== 'IS NULL' && w.operator !== 'IS NOT NULL' && (
                <input
                  className="qb-where-input"
                  value={w.value}
                  onChange={(e) => updateWhere(i, 'value', e.target.value)}
                  placeholder="value"
                  style={{ flex: 1 }}
                />
              )}
              <button className="qb-add-where" onClick={() => removeWhere(i)}>x</button>
            </div>
          ))}

          {sql && (
            <>
              <div className="qb-preview">{sql}</div>
              <button className="qb-copy-btn" onClick={handleCopy}>Copy SQL</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
