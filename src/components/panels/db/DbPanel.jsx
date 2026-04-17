import React, { useState, useRef, useCallback } from 'react';
import { useResize } from '../../../hooks/useResize.js';
import { useClipboard } from '../../../hooks/useClipboard.js';
import { DB_PROVIDERS } from '../../../config/db-providers.js';
import { QueryBuilder } from './QueryBuilder.jsx';

function DbStatusDot({ status }) {
  return (
    <span className={`db-status-dot db-status-${status || 'none'}`}>
      {status === 'ready' && <span className="db-health-dot" />}
      {status === 'error' && <span className="db-health-dot db-health-dot-error" />}
      {status === 'connecting' && <span className="db-health-dot db-health-dot-connecting" />}
    </span>
  );
}

const NS_COLORS = ['#4fc3f7', '#ce93d8', '#81c784', '#ffb74d', '#ef9a9a', '#90caf9', '#a5d6a7'];

function CopyBtn({ text }) {
  const [copied, copy] = useClipboard();
  return (
    <button className="db-key-copy" onClick={(e) => { e.stopPropagation(); copy(text); }}
            title={copied ? 'Copied!' : 'Copy key'}>
      {copied ? '✓' : '⎘'}
    </button>
  );
}

function DbSchemaTree({ schema, isRedis, onLoadMore }) {
  const [expanded, setExpanded] = useState({});
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState('');
  if (!schema) return null;
  const toggle = (name) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));

  const applyFilter = () => setFilter(searchInput.trim().toLowerCase());
  const clearFilter = () => { setFilter(''); setSearchInput(''); };

  // For relational DBs: live filter as you type (no Search button needed)
  const activeFilter = isRedis ? filter : searchInput.trim().toLowerCase();

  const tables = activeFilter
    ? isRedis
      // Redis: filter by full key path
      ? schema.tables.map((t) => {
          const fullPrefix = t.name === '(keys)' ? '' : t.name + ':';
          const matchingCols = t.columns.filter((c) => {
            const fullKey = fullPrefix + c.name;
            return fullKey.toLowerCase().includes(activeFilter);
          });
          return matchingCols.length > 0 ? { ...t, columns: matchingCols } : null;
        }).filter(Boolean)
      // Relational: match table name or any column name
      : schema.tables.filter((t) => {
          const tableName = (t.schema ? `${t.schema}.${t.name}` : t.name).toLowerCase();
          if (tableName.includes(activeFilter)) return true;
          return t.columns.some((c) => c.name.toLowerCase().includes(activeFilter));
        })
    : schema.tables;

  return (
    <div className="db-schema-tree">
      <div className="db-key-search">
        <input
          className="db-key-search-input"
          type="text"
          placeholder={isRedis ? 'Search keys…' : 'Filter tables / columns…'}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && isRedis) applyFilter(); if (e.key === 'Escape') clearFilter(); }}
          spellCheck={false}
        />
        {isRedis && <button className="db-key-search-btn" onClick={applyFilter} title="Search">Search</button>}
        {(isRedis ? filter : searchInput) && <button className="db-key-search-btn" onClick={clearFilter} title="Clear">✕</button>}
      </div>
      {tables.map((table) => {
        const tableKey = `${table.schema}.${table.name}`;
        const depth = isRedis ? table.name.split(':').length - 1 : 0;
        const isOpen = expanded[tableKey] || !!activeFilter;
        return (
          <div key={tableKey} className="db-table-node">
            <div className="db-table-header" onClick={() => toggle(tableKey)}>
              <span className="db-table-arrow">{isOpen ? '▾' : '▸'}</span>
              <span className="db-table-name" style={isRedis && depth > 0 ? { color: NS_COLORS[depth % NS_COLORS.length] } : undefined}>
                {table.schema ? `${table.schema}.${table.name}` : table.name}
              </span>
              <span className="db-col-count">{table.columns.length}</span>
            </div>
            {isOpen && (
              <div className="db-columns-list">
                {table.columns.map((col) => (
                  <div key={col.name} className={`db-column-node${col.isPrimaryKey ? ' db-col-pk' : ''}${isRedis ? ' db-redis-key' : ''}`}>
                    <span className="db-col-name">{col.name}</span>
                    {isRedis && <CopyBtn text={table.name === '(keys)' ? col.name : `${table.name}:${col.name}`} />}
                    <span className="db-col-type">{isRedis ? col.dbType : col.csharpType}</span>
                    {col.isPrimaryKey && <span className="db-pk-badge">PK</span>}
                    {isRedis && col.sampleValue && (
                      <span className="db-redis-value" title={col.sampleValue}>{col.sampleValue}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {isRedis && !filter && schema.redisCursor !== 0 && onLoadMore && (
        <button className="db-load-more-btn" onClick={onLoadMore}>Load more keys…</button>
      )}
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
  onEditConnection, onRemove, onLoadMoreRedis,
}) {
  const [height, onResizeMouseDown] = useResize(280, 'top');
  const [leftWidth, onColResizeMouseDown] = useResize(260, 'right');
  const [collapsedDbs, setCollapsedDbs] = useState(new Set());
  const [qbOpen, setQbOpen] = useState(false);
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
                {!isCollapsed && db.schema && (
                  <DbSchemaTree
                    schema={db.schema}
                    isRedis={conn?.provider === 'redis'}
                    onLoadMore={conn?.provider === 'redis' && db.schema.redisCursor !== 0
                      ? () => onLoadMoreRedis(db.connectionId, db.schema.redisCursor)
                      : undefined}
                  />
                )}
              </div>
            );
          })}

          {/* Query Builder */}
          <div className="db-schema-section">
            <div className="db-schema-header" onClick={() => setQbOpen((v) => !v)} style={{ cursor: 'pointer' }}>
              <span className="db-table-arrow">{qbOpen ? '▾' : '▸'}</span>
              <span className="db-conn-name">Query Builder</span>
            </div>
            {qbOpen && (
              <QueryBuilder
                schema={attachedDbs.length > 0 && attachedDbs[0].schema ? attachedDbs[0].schema : null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
