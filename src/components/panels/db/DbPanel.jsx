import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResize } from '../../../hooks/useResize.js';
import { DB_PROVIDERS, DB_CONNSTR_PLACEHOLDER } from '../../../config/db-providers.js';

function DbStatusDot({ status }) {
  return <span className={`db-status-dot db-status-${status || 'none'}`} />;
}

function DbSchemaTree({ schema }) {
  const [expanded, setExpanded] = useState({});
  if (!schema) return null;
  const toggle = (name) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  return (
    <div className="db-schema-tree">
      {schema.tables.map((table) => (
        <div key={`${table.schema}.${table.name}`} className="db-table-node">
          <div className="db-table-header" onClick={() => toggle(`${table.schema}.${table.name}`)}>
            <span className="db-table-arrow">{expanded[`${table.schema}.${table.name}`] ? '▾' : '▸'}</span>
            <span className="db-table-name">{table.schema ? `${table.schema}.${table.name}` : table.name}</span>
            <span className="db-col-count">{table.columns.length}</span>
          </div>
          {expanded[`${table.schema}.${table.name}`] && (
            <div className="db-columns-list">
              {table.columns.map((col) => (
                <div key={col.name} className={`db-column-node${col.isPrimaryKey ? ' db-col-pk' : ''}`}>
                  <span className="db-col-name">{col.name}</span>
                  <span className="db-col-type">{col.csharpType}</span>
                  {col.isPrimaryKey && <span className="db-pk-badge">PK</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DbConnectionForm({ connection, onSave, onCancel }) {
  const [name, setName] = useState(connection?.name ?? '');
  const [provider, setProvider] = useState(connection?.provider ?? 'sqlite');
  const [connStr, setConnStr] = useState(connection?.connectionString ?? '');

  const providerMeta = DB_PROVIDERS.find((p) => p.key === provider);

  const handleSave = () => {
    const n  = name.trim();
    const cs = connStr.trim();
    if (!n) return;
    // Connection string is optional for in-memory providers; required for all others
    if (!providerMeta?.optionalConnStr && !cs) return;
    const id = connection?.id ?? uuidv4();
    onSave({ id, name: n, provider, connectionString: cs });
  };

  return (
    <div className="db-connection-form">
      <input
        className="nuget-input"
        placeholder="Connection name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        spellCheck={false}
      />
      <select
        className="nuget-input db-provider-select"
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
      >
        {DB_PROVIDERS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>
      <input
        className="nuget-input db-connstr-input"
        placeholder={DB_CONNSTR_PLACEHOLDER[provider] ?? 'Connection string'}
        value={connStr}
        onChange={(e) => setConnStr(e.target.value)}
        spellCheck={false}
      />
      <div className="db-form-actions">
        <button className="nuget-remove-btn db-form-btn" onClick={onCancel}>Cancel</button>
        <button className="nuget-add-btn db-form-btn" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}

export function DbPanel({
  isOpen, onToggle,
  connections, attachedDbs, notebookId,
  onAttach, onDetach, onRefresh, onRetry,
  onAdd, onUpdate, onRemove,
}) {
  const [height, onResizeMouseDown] = useResize(280, 'top');
  const [leftWidth, onColResizeMouseDown] = useResize(260, 'right');
  const [editingConn, setEditingConn] = useState(null); // null | 'new' | connection object

  if (!isOpen) return null;

  const handleSaveConn = (conn) => {
    if (editingConn === 'new') onAdd(conn);
    else onUpdate(conn.id, conn);
    setEditingConn(null);
  };

  return (
    <div className="db-panel" style={{ height }}>
      <div className="resize-handle resize-v" onMouseDown={onResizeMouseDown} />
      <div className="db-panel-header">
        <span className="db-panel-title">Databases</span>
        <button className="nuget-add-btn db-add-btn" onClick={() => setEditingConn('new')} title="Add connection">+ Add</button>
        <button className="nuget-close-btn" onClick={onToggle} title="Close">×</button>
      </div>
      <div className="db-panel-body">
        {/* Left: global connection list */}
        <div className="db-connections-col" style={{ width: leftWidth, minWidth: leftWidth }}>
          {connections.length === 0 && (
            <span className="config-empty" style={{ padding: '10px 12px', display: 'block' }}>
              No connections — click + Add
            </span>
          )}
          {connections.map((conn) => {
            const attached = attachedDbs.find((d) => d.connectionId === conn.id);
            const prov = DB_PROVIDERS.find((p) => p.key === conn.provider);
            return (
              <div
                key={conn.id}
                className={`db-connection-item${attached ? ' db-connection-attached' : ''}`}
              >
                <div className="db-conn-top">
                  <DbStatusDot status={attached?.status ?? 'none'} />
                  <span className="db-conn-name">{conn.name}</span>
                  <span className="db-provider-badge">{prov?.label ?? conn.provider}</span>
                </div>
                <div className="db-conn-actions">
                  {!attached ? (
                    <button className="db-action-btn db-attach-btn" onClick={() => onAttach(conn.id)} title="Attach to notebook">
                      Attach
                    </button>
                  ) : (
                    <button className="db-action-btn db-detach-btn" onClick={() => onDetach(conn.id)} title="Detach">
                      Detach
                    </button>
                  )}
                  <button className="db-icon-btn db-edit-btn" onClick={() => setEditingConn(conn)} title="Edit">✎</button>
                  <button className="db-icon-btn" onClick={() => { if (window.confirm(`Remove connection "${conn.name}"?`)) onRemove(conn.id); }} title="Remove">×</button>
                </div>
              </div>
            );
          })}
          {editingConn && (
            <DbConnectionForm
              connection={editingConn === 'new' ? null : editingConn}
              onSave={handleSaveConn}
              onCancel={() => setEditingConn(null)}
            />
          )}
        </div>

        {/* Draggable column divider */}
        <div className="db-col-divider" onMouseDown={onColResizeMouseDown} />

        {/* Right: schema tree for attached DBs */}
        <div className="db-schema-col">
          {attachedDbs.length === 0 && (
            <span className="config-empty" style={{ padding: '10px 12px', display: 'block' }}>
              No databases attached — click Attach
            </span>
          )}
          {attachedDbs.map((db) => {
            const conn = connections.find((c) => c.id === db.connectionId);
            return (
              <div key={db.connectionId} className="db-schema-section">
                <div className="db-schema-header">
                  <DbStatusDot status={db.status} />
                  <span className="db-conn-name">{conn?.name ?? db.connectionId}</span>
                  {db.varName && <span className="db-var-badge">{db.varName}</span>}
                  <button
                    className="db-icon-btn"
                    onClick={() => onRefresh(db.connectionId)}
                    title="Refresh schema"
                    disabled={db.status === 'connecting'}
                  >↻</button>
                </div>
                {db.status === 'error' && (
                  <div className="db-error-msg">
                    <span>{db.error}</span>
                    <button className="db-retry-btn" onClick={() => onRetry(db.connectionId)}>↺ Retry</button>
                  </div>
                )}
                {db.schema && <DbSchemaTree schema={db.schema} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
