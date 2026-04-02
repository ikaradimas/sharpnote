import React, { useState, useRef, useCallback } from 'react';
import { useResize } from '../../../hooks/useResize.js';
import { useClipboard } from '../../../hooks/useClipboard.js';
import { DB_PROVIDERS } from '../../../config/db-providers.js';

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

function VarBadge({ varName }) {
  const [copied, copy] = useClipboard();
  return (
    <span className="db-var-badge">
      {varName}
      <button className="db-var-copy" onClick={() => copy(varName)} title="Copy variable name">
        {copied ? '✓' : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
      </button>
    </span>
  );
}

export function DbPanel({
  isOpen, onToggle,
  connections, attachedDbs, notebookId,
  onAttach, onDetach, onRefresh, onRetry,
  onEditConnection, onRemove,
}) {
  const [height, onResizeMouseDown] = useResize(280, 'top');
  const [leftWidth, onColResizeMouseDown] = useResize(260, 'right');
  const [collapsedDbs, setCollapsedDbs] = useState(new Set());
  const schemaRefsMap = useRef({});

  const toggleDbCollapse = useCallback((connId) => {
    setCollapsedDbs((prev) => {
      const next = new Set(prev);
      if (next.has(connId)) next.delete(connId); else next.add(connId);
      return next;
    });
  }, []);

  const scrollToDb = useCallback((connId) => {
    const el = schemaRefsMap.current[connId];
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="db-panel" style={{ height }}>
      <div className="resize-handle resize-v" onMouseDown={onResizeMouseDown} />
      <div className="db-panel-header">
        <span className="db-panel-title">Databases</span>
        <button className="nuget-add-btn db-add-btn" onClick={() => onEditConnection(null)} title="Add connection">+ Add</button>
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
                onClick={attached ? () => scrollToDb(conn.id) : undefined}
                style={attached ? { cursor: 'pointer' } : undefined}
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
                  <button className="db-icon-btn db-edit-btn" onClick={() => onEditConnection(conn)} title="Edit">✎</button>
                  <button className="db-icon-btn" onClick={() => { if (window.confirm(`Remove connection "${conn.name}"?`)) onRemove(conn.id); }} title="Remove">×</button>
                </div>
              </div>
            );
          })}
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
            const isCollapsed = collapsedDbs.has(db.connectionId);
            return (
              <div
                key={db.connectionId}
                className="db-schema-section"
                ref={(el) => { schemaRefsMap.current[db.connectionId] = el; }}
              >
                <div
                  className="db-schema-header"
                  onClick={() => toggleDbCollapse(db.connectionId)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="db-table-arrow">{isCollapsed ? '▸' : '▾'}</span>
                  <DbStatusDot status={db.status} />
                  <span className="db-conn-name">{conn?.name ?? db.connectionId}</span>
                  {db.varName && <VarBadge varName={db.varName} />}
                  <button
                    className="db-icon-btn"
                    onClick={(e) => { e.stopPropagation(); onRefresh(db.connectionId); }}
                    title="Refresh schema"
                    disabled={db.status === 'connecting'}
                  >↻</button>
                </div>
                {!isCollapsed && db.status === 'error' && (
                  <div className="db-error-msg">
                    <span>{db.error}</span>
                    <button className="db-retry-btn" onClick={() => onRetry(db.connectionId)}>↺ Retry</button>
                  </div>
                )}
                {!isCollapsed && db.schema && <DbSchemaTree schema={db.schema} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
