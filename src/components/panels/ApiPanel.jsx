import React, { useState } from 'react';
import yaml from 'js-yaml';

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_COLORS = {
  get:     '#61afef',
  post:    '#98c379',
  put:     '#e5c07b',
  delete:  '#e06c75',
  patch:   '#c678dd',
  head:    '#56b6c2',
  options: '#56b6c2',
  trace:   '#888',
};

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];

function getBaseUrl(spec) {
  if (spec.servers?.length) {
    const s = spec.servers[0];
    return s.url || '';
  }
  if (spec.host) {
    const scheme = (spec.schemes || ['https'])[0];
    return `${scheme}://${spec.host}${spec.basePath || ''}`;
  }
  return '';
}

function groupOperations(spec) {
  const groups = {};  // tagName → [{ method, path, op }]

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      const tags = op.tags?.length ? op.tags : ['Default'];
      const key = tags[0];
      if (!groups[key]) groups[key] = [];
      groups[key].push({ method, path, op });
    }
  }

  return groups;
}

function resolveRef(spec, ref) {
  if (!ref?.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let node = spec;
  for (const p of parts) { node = node?.[p]; }
  return node ?? null;
}

function getSchemaType(spec, schema) {
  if (!schema) return '';
  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref);
    return resolved ? getSchemaType(spec, resolved) : schema.$ref.split('/').pop();
  }
  if (schema.type === 'array') {
    const items = schema.items;
    return `${getSchemaType(spec, items)}[]`;
  }
  return schema.type || (schema.properties ? 'object' : '');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MethodBadge({ method }) {
  return (
    <span className="api-method-badge" style={{ background: METHOD_COLORS[method] ?? '#888' }}>
      {method.toUpperCase()}
    </span>
  );
}

function ParamsTable({ spec, parameters }) {
  if (!parameters?.length) return null;
  const resolved = parameters.map((p) => p.$ref ? resolveRef(spec, p.$ref) ?? p : p);
  return (
    <table className="api-params-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>In</th>
          <th>Type</th>
          <th>Req</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {resolved.map((p, i) => (
          <tr key={i}>
            <td className="api-param-name">{p.name}</td>
            <td className="api-param-in">{p.in}</td>
            <td className="api-param-type">{getSchemaType(spec, p.schema || { type: p.type })}</td>
            <td>{p.required ? '✓' : ''}</td>
            <td className="api-param-desc">{p.description || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResponsesTable({ responses }) {
  if (!responses) return null;
  return (
    <div className="api-responses">
      {Object.entries(responses).map(([code, resp]) => (
        <div key={code} className="api-response-row">
          <span className={`api-status-badge api-status-${code[0]}xx`}>{code}</span>
          <span className="api-response-desc">{resp.description || ''}</span>
        </div>
      ))}
    </div>
  );
}

function Operation({ spec, method, path, op, expanded, onToggle }) {
  return (
    <div className={`api-op${expanded ? ' api-op-expanded' : ''}`}>
      <button className="api-op-header" onClick={onToggle}>
        <MethodBadge method={method} />
        <span className="api-op-path">{path}</span>
        {op.summary && <span className="api-op-summary">{op.summary}</span>}
        {op.deprecated && <span className="api-deprecated">deprecated</span>}
        <span className="api-op-chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="api-op-detail">
          {op.description && <p className="api-op-desc">{op.description}</p>}
          {op.parameters?.length > 0 && (
            <>
              <div className="api-section-label">Parameters</div>
              <ParamsTable spec={spec} parameters={op.parameters} />
            </>
          )}
          {op.requestBody && (
            <>
              <div className="api-section-label">Request Body</div>
              <div className="api-request-body">
                {Object.keys(op.requestBody.content || {}).join(', ') || 'body'}
                {op.requestBody.required ? ' (required)' : ' (optional)'}
              </div>
            </>
          )}
          {op.responses && (
            <>
              <div className="api-section-label">Responses</div>
              <ResponsesTable responses={op.responses} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TagGroup({ spec, tag, operations, expanded, onToggleTag, expandedOps, onToggleOp }) {
  return (
    <div className="api-tag">
      <button className="api-tag-header" onClick={() => onToggleTag(tag)}>
        <span className="api-tag-chevron">{expanded ? '▾' : '▸'}</span>
        <span className="api-tag-name">{tag}</span>
        <span className="api-tag-count">{operations.length}</span>
      </button>
      {expanded && operations.map(({ method, path, op }, i) => {
        const opKey = `${method}:${path}`;
        return (
          <Operation
            key={i}
            spec={spec}
            method={method}
            path={path}
            op={op}
            expanded={expandedOps.has(opKey)}
            onToggle={() => onToggleOp(opKey)}
          />
        );
      })}
    </div>
  );
}

// ── ApiPanel ──────────────────────────────────────────────────────────────────

export function ApiPanel({ onToggle }) {
  const [url, setUrl] = useState('');
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedTags, setExpandedTags] = useState(new Set());
  const [expandedOps, setExpandedOps] = useState(new Set());

  async function loadSpec() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setSpec(null);
    try {
      const text = await window.electronAPI.fetchUrl(trimmed);
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { parsed = yaml.load(text); }
      if (!parsed || typeof parsed !== 'object') throw new Error('Response is not a valid JSON/YAML object');
      if (!parsed.paths && !parsed.openapi && !parsed.swagger) throw new Error('No OpenAPI/Swagger spec detected (missing openapi, swagger, or paths field)');
      setSpec(parsed);
      setExpandedTags(new Set(Object.keys(groupOperations(parsed))));
      setExpandedOps(new Set());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleTag(tag) {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  function toggleOp(key) {
    setExpandedOps((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const groups = spec ? groupOperations(spec) : {};
  const baseUrl = spec ? getBaseUrl(spec) : '';
  const totalOps = Object.values(groups).reduce((n, ops) => n + ops.length, 0);

  return (
    <div className="api-panel">
      <div className="api-panel-header">
        <span className="api-panel-title">API Browser</span>
        <button className="panel-close-btn" onClick={onToggle}>✕</button>
      </div>

      <div className="api-url-row">
        <input
          className="api-url-input"
          type="text"
          placeholder="https://example.com/openapi.json"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') loadSpec(); }}
          spellCheck={false}
        />
        <button className="api-fetch-btn" onClick={loadSpec} disabled={loading || !url.trim()}>
          {loading ? '…' : 'Load'}
        </button>
      </div>

      {error && <div className="api-error">{error}</div>}

      {spec && (
        <>
          <div className="api-info">
            <div className="api-info-name">{spec.info?.title || 'Untitled API'}</div>
            <div className="api-info-meta">
              {spec.info?.version && <span className="api-info-version">v{spec.info.version}</span>}
              {(spec.openapi || spec.swagger) && (
                <span className="api-info-spec">{spec.openapi ? `OAS ${spec.openapi}` : `Swagger ${spec.swagger}`}</span>
              )}
              {totalOps > 0 && <span className="api-info-ops">{totalOps} operations</span>}
            </div>
            {spec.info?.description && (
              <div className="api-info-desc">{spec.info.description}</div>
            )}
            {baseUrl && <div className="api-base-url">{baseUrl}</div>}
          </div>

          <div className="api-ops-list">
            {Object.entries(groups).map(([tag, ops]) => (
              <TagGroup
                key={tag}
                spec={spec}
                tag={tag}
                operations={ops}
                expanded={expandedTags.has(tag)}
                onToggleTag={toggleTag}
                expandedOps={expandedOps}
                onToggleOp={toggleOp}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
