import React, { useState, useCallback } from 'react';
import { CodeEditor } from './CodeEditor.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';
import { CellControls } from './CellControls.jsx';
import { CellNameColor } from './CellNameColor.jsx';
import { CellRunGroup } from './CellRunGroup.jsx';

export function SqlCell({
  cell,
  cellIndex,
  outputs,
  notebookId,
  attachedDbs,
  isRunning,
  anyRunning,
  kernelReady = true,
  onUpdate,
  onRun,
  onRunFrom, onRunTo,
  onDbChange,
  onDelete, onCopy,
  onMoveUp,
  onMoveDown,
  columns = 0, onColumnsChange,
  onToggleBookmark,
  onNameChange,
  onColorChange,
}) {
  const readyDbs = (attachedDbs || []).filter((d) => d.status === 'ready');
  const selectedDb = cell.db || (readyDbs[0]?.connectionId ?? '');
  const selectedSchema = readyDbs.find((d) => d.connectionId === selectedDb)?.schema ?? null;

  // Schema sidebar state
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [expandedTables, setExpandedTables] = useState({});

  const toggleTable = useCallback((key) => {
    setExpandedTables((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const copyColumnName = useCallback((name) => {
    navigator.clipboard.writeText(name).catch(() => {});
  }, []);

  // Query history state
  const [queryHistory, setQueryHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleRun = useCallback(() => {
    if (cell.content?.trim()) {
      setQueryHistory((prev) => {
        const filtered = prev.filter((q) => q !== cell.content);
        return [cell.content, ...filtered].slice(0, 20);
      });
    }
    onRun?.();
  }, [cell.content, onRun]);

  return (
    <div className={`cell sql-cell${isRunning ? ' running' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="code-cell-header">
        <CellNameColor name={cell.name} color={cell.color} onNameChange={onNameChange} onColorChange={onColorChange} />
        <span className="cell-lang-label sql-label">SQL</span>
        <span className="cell-id-label" title={`Cell ID: ${cell.id}`}>{cell.id}</span>
        <select
          className="sql-db-select"
          value={selectedDb}
          onChange={(e) => onDbChange(e.target.value)}
          title="Database to query"
          disabled={readyDbs.length === 0}
        >
          {readyDbs.length === 0 && <option value="">No database attached</option>}
          {readyDbs.map((d) => (
            <option key={d.connectionId} value={d.connectionId}>{d.varName}</option>
          ))}
        </select>
        {selectedSchema && (
          <button
            className="sql-schema-toggle"
            onClick={() => setSchemaOpen((v) => !v)}
            title={schemaOpen ? 'Hide schema' : 'Show schema'}
          >{schemaOpen ? '▾ Schema' : '▸ Schema'}</button>
        )}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            className="sql-history-btn"
            onClick={() => setHistoryOpen((v) => !v)}
            title="Query history"
          >&#x1f552;</button>
          {historyOpen && (
            <div className="sql-history-dropdown">
              {queryHistory.length === 0
                ? <div className="sql-history-empty">No query history yet</div>
                : queryHistory.map((q, i) => (
                    <button
                      key={i}
                      className="sql-history-item"
                      onClick={() => { onUpdate(q); setHistoryOpen(false); }}
                      title={q}
                    >{q}</button>
                  ))
              }
            </div>
          )}
        </div>
        <CellRunGroup onRun={handleRun} onRunFrom={onRunFrom} onRunTo={onRunTo} isRunning={isRunning} disabled={anyRunning || !kernelReady || readyDbs.length === 0 || !selectedDb} />
        <div className="header-right">
          <CellControls onCopy={onCopy} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} columns={columns} onColumnsChange={onColumnsChange} bookmarked={cell.bookmarked} onToggleBookmark={onToggleBookmark} />
        </div>
      </div>
      {schemaOpen && selectedSchema && (
        <div className="sql-schema-sidebar">
          {(selectedSchema.tables || []).map((table) => {
            const tableKey = table.schema ? `${table.schema}.${table.name}` : table.name;
            const isOpen = expandedTables[tableKey];
            return (
              <div key={tableKey}>
                <div className="sql-schema-table" onClick={() => toggleTable(tableKey)}>
                  <span>{isOpen ? '▾' : '▸'}</span>{' '}
                  <span className="sql-schema-table-name">{tableKey}</span>
                </div>
                {isOpen && table.columns.map((col) => (
                  <div
                    key={col.name}
                    className="sql-schema-col"
                    onClick={() => copyColumnName(col.name)}
                    title={`Click to copy "${col.name}"`}
                  >
                    {col.name}
                    {col.type && <span className="sql-schema-col-type">{col.type}</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <CodeEditor
        value={cell.content}
        onChange={(val) => onUpdate(val)}
        language="sql"
        sqlSchema={selectedSchema}
        onCtrlEnter={kernelReady && !anyRunning ? handleRun : undefined}
        lintEnabled={false}
        cellIndex={cellIndex}
      />
      <CellOutput messages={outputs} notebookId={notebookId} />
    </div>
  );
}
