import React, { useState, useEffect } from 'react';
import { useClipboard } from '../../hooks/useClipboard.js';
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

export function getBaseUrl(spec) {
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

export function groupOperations(spec) {
  const groups = {};
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

export function resolveRef(spec, ref) {
  if (!ref?.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let node = spec;
  for (const p of parts) { node = node?.[p]; }
  return node ?? null;
}

// Generates a skeleton JSON value from a schema for prefilling the request body editor.
export function schemaSkeleton(spec, schema, depth = 0) {
  if (!schema || depth > 4) return null;
  const s = schema.$ref ? resolveRef(spec, schema.$ref) ?? schema : schema;
  if (s.$ref) return null; // unresolvable circular ref
  if (s.type === 'object' || s.properties) {
    const obj = {};
    for (const [key, prop] of Object.entries(s.properties ?? {})) {
      const val = schemaSkeleton(spec, prop, depth + 1);
      obj[key] = val !== null ? val : null;
    }
    return obj;
  }
  if (s.type === 'array') {
    const item = schemaSkeleton(spec, s.items, depth + 1);
    return [item !== null ? item : {}];
  }
  if (s.type === 'string') return '';
  if (s.type === 'integer' || s.type === 'number') return 0;
  if (s.type === 'boolean') return false;
  return null;
}

// ── C# class generator ────────────────────────────────────────────────────────

function csScalarType(s) {
  if (s.type === 'integer') return s.format === 'int64' ? 'long' : 'int';
  if (s.type === 'number')  return s.format === 'float'  ? 'float' : 'double';
  if (s.type === 'boolean') return 'bool';
  if (s.type === 'string') {
    if (s.format === 'date-time' || s.format === 'date') return 'DateTime';
    if (s.format === 'uuid') return 'Guid';
    return 'string';
  }
  return 'object';
}

function toPascalCase(str) {
  return str
    .replace(/(^|[_\-\s])(\w)/g, (_, __, c) => c.toUpperCase())
    .replace(/^(.)/, c => c.toUpperCase());
}

// Returns true when the schema (or its array items) resolves to an object with properties.
export function schemaHasClass(spec, schema) {
  if (!schema) return false;
  const s = schema.$ref ? resolveRef(spec, schema.$ref) ?? schema : schema;
  if (s.type === 'object' || s.properties) return true;
  if (s.type === 'array') return schemaHasClass(spec, s.items);
  return false;
}

// Generates C# class declaration(s) from a schema, supporting Newtonsoft and STJ attributes.
// style: 'stj' | 'newtonsoft'
export function schemaToCSharpClass(spec, rootSchema, rootName, style) {
  const classes = []; // [{name, props}] — ordered for output
  const seen    = new Set();

  const attrLine = style === 'newtonsoft'
    ? (n) => `    [JsonProperty("${n}")]`
    : (n) => `    [JsonPropertyName("${n}")]`;

  function refClassName(ref) {
    return ref?.split('/').pop() ?? 'Model';
  }

  function collectType(schema, fallbackName) {
    if (!schema) return 'object';
    if (schema.$ref) {
      const name     = refClassName(schema.$ref);
      const resolved = resolveRef(spec, schema.$ref);
      if (resolved) collectClass(resolved, name);
      return name;
    }
    if (schema.type === 'array') {
      const itemType = collectType(schema.items, fallbackName + 'Item');
      return `List<${itemType}>`;
    }
    if (schema.type === 'object' || schema.properties) {
      collectClass(schema, fallbackName);
      return fallbackName;
    }
    return csScalarType(schema);
  }

  function collectClass(schema, name) {
    if (seen.has(name)) return;
    seen.add(name);
    const props = [];
    for (const [jsonName, propSchema] of Object.entries(schema.properties ?? {})) {
      const csName        = toPascalCase(jsonName);
      const nestedFallback = name + csName;
      props.push({ jsonName, csName, type: collectType(propSchema, nestedFallback) });
    }
    classes.push({ name, props });
  }

  const resolved   = rootSchema.$ref ? resolveRef(spec, rootSchema.$ref) : rootSchema;
  const actualName = rootSchema.$ref ? refClassName(rootSchema.$ref) : rootName;
  if (resolved) collectClass(resolved, actualName);

  return classes.map(({ name, props }) => {
    const lines = [`public class ${name}`, '{'];
    for (const { jsonName, csName, type } of props) {
      lines.push(attrLine(jsonName));
      lines.push(`    public ${type} ${csName} { get; set; }`);
      lines.push('');
    }
    lines.push('}');
    return lines.join('\n');
  }).join('\n\n');
}

// ── C# literal generators ────────────────────────────────────────────────────

function csDefaultLiteral(schema) {
  const t = csScalarType(schema);
  if (t === 'string' || t === 'DateTime' || t === 'Guid') return '""';
  if (t === 'bool') return 'false';
  if (t === 'double' || t === 'float') return '0.0';
  return '0';
}

// Generates a C# anonymous type literal from a JSON schema.
export function schemaToAnonymousLiteral(spec, schema, indent, depth = 0) {
  if (!schema || depth > 4) return 'null';
  const s = schema.$ref ? resolveRef(spec, schema.$ref) ?? schema : schema;
  if (s.$ref) return 'null';
  const pad = indent + '    ';

  if (s.type === 'object' || s.properties) {
    const entries = Object.entries(s.properties ?? {});
    if (entries.length === 0) return 'new { }';
    const props = entries.map(([key, prop]) => {
      const val = schemaToAnonymousLiteral(spec, prop, pad, depth + 1);
      return `${pad}${key} = ${val},`;
    });
    return `new\n${indent}{\n${props.join('\n')}\n${indent}}`;
  }
  if (s.type === 'array') {
    const item = schemaToAnonymousLiteral(spec, s.items, pad, depth + 1);
    return `new[] { ${item} }`;
  }
  return csDefaultLiteral(s);
}

// Generates a C# typed object initializer from a JSON schema (new ClassName { ... }).
export function schemaToInitializerLiteral(spec, schema, className, indent, depth = 0) {
  if (!schema || depth > 4) return 'null';
  const s = schema.$ref ? resolveRef(spec, schema.$ref) ?? schema : schema;
  if (s.$ref) return 'null';
  const pad = indent + '    ';

  if (s.type === 'object' || s.properties) {
    const entries = Object.entries(s.properties ?? {});
    if (entries.length === 0) return `new ${className}()`;
    const props = entries.map(([key, prop]) => {
      const resolved = prop.$ref ? resolveRef(spec, prop.$ref) ?? prop : prop;
      let val;
      if (resolved.type === 'object' || resolved.properties) {
        const nestedName = prop.$ref ? prop.$ref.split('/').pop() : toPascalCase(key);
        val = schemaToInitializerLiteral(spec, resolved, nestedName, pad, depth + 1);
      } else if (resolved.type === 'array') {
        const item = schemaToAnonymousLiteral(spec, resolved.items, pad + '    ', depth + 1);
        val = `new[] { ${item} }`;
      } else {
        val = csDefaultLiteral(resolved);
      }
      return `${pad}${toPascalCase(key)} = ${val},`;
    });
    return `new ${className}\n${indent}{\n${props.join('\n')}\n${indent}}`;
  }
  return csDefaultLiteral(s);
}

export function getSchemaType(spec, schema) {
  if (!schema) return '';
  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref);
    return resolved ? getSchemaType(spec, resolved) : schema.$ref.split('/').pop();
  }
  if (schema.type === 'array') {
    return `${getSchemaType(spec, schema.items)}[]`;
  }
  return schema.type || (schema.properties ? 'object' : '');
}

// Returns body info for Swagger 2 operations (which use in:"body" parameters).
export function getSwagger2BodyInfo(spec, op) {
  const bodyParam = op.parameters?.find(p => p.in === 'body');
  if (!bodyParam) return null;
  return {
    schema: bodyParam.schema ?? null,
    required: !!bodyParam.required,
    consumes: op.consumes || spec.consumes || [],
  };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export function applyAuth(headers, queryParams, auth) {
  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth.type === 'apikey' && auth.keyName && auth.keyValue) {
    if (auth.keyIn === 'header') {
      headers[auth.keyName] = auth.keyValue;
    } else {
      queryParams[auth.keyName] = auth.keyValue;
    }
  } else if (auth.type === 'basic' && (auth.username || auth.password)) {
    headers['Authorization'] = `Basic ${btoa(`${auth.username || ''}:${auth.password || ''}`)}`;
  }
}

export function buildRequestUrl(baseUrl, pathTemplate, pathParams, queryParams) {
  let url = baseUrl + pathTemplate;
  for (const [k, v] of Object.entries(pathParams)) {
    if (v !== '') url = url.replace(`{${k}}`, encodeURIComponent(v));
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== '') qs.append(k, v);
  }
  const qStr = qs.toString();
  return qStr ? `${url}?${qStr}` : url;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── HTML description rendering ────────────────────────────────────────────────

function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,form').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (attr.name.startsWith('on') || attr.value.includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    });
    // Strip background and color from inline styles so the theme can take over
    if (el.style) {
      el.style.removeProperty('background');
      el.style.removeProperty('background-color');
      el.style.removeProperty('color');
    }
  });
  return doc.body.innerHTML;
}

const HTML_TAG_RE = /<[a-z][\s\S]*?>/i;

function HtmlDesc({ text, className, tag: Tag = 'span' }) {
  if (!text) return null;
  if (!HTML_TAG_RE.test(text)) return <Tag className={className}>{text}</Tag>;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }} />;
}

const DEFAULT_AUTH = { type: 'none', token: '', keyName: 'X-API-Key', keyValue: '', keyIn: 'header', username: '', password: '' };

// ── C# snippet generator ──────────────────────────────────────────────────────

export function buildHttpClientSnippet(method, pathTemplate, op, baseUrl, auth, spec = {}) {
  const m = method.toLowerCase();
  const lines = [];

  lines.push('var client = new HttpClient();');

  // Auth header setup
  if (auth.type === 'bearer') {
    const tok = auth.token || '<bearer-token>';
    lines.push(`client.DefaultRequestHeaders.Authorization =`);
    lines.push(`    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "${tok}");`);
  } else if (auth.type === 'apikey' && auth.keyIn === 'header') {
    const name = auth.keyName || 'X-API-Key';
    const val  = auth.keyValue || '<api-key>';
    lines.push(`client.DefaultRequestHeaders.Add("${name}", "${val}");`);
  } else if (auth.type === 'basic') {
    const u = auth.username || '<username>';
    const p = auth.password || '<password>';
    lines.push(`var credentials = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("${u}:${p}"));`);
    lines.push(`client.DefaultRequestHeaders.Authorization =`);
    lines.push(`    new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", credentials);`);
  }

  // Build URL expression — replace {param} placeholders with C# string interpolation vars
  const pathParams  = (op.parameters ?? []).filter(p => p.in === 'path');
  const paramTokens = pathTemplate.match(/\{(\w+)\}/g) ?? [];
  let urlExpr;
  if (paramTokens.length > 0) {
    pathParams.forEach(p => lines.push(`var ${p.name} = "<${p.name}>"; // path param`));
    const interpolated = (baseUrl + pathTemplate).replace(/\{(\w+)\}/g, '${$1}');
    urlExpr = `$"${interpolated}"`;
  } else {
    urlExpr = `"${baseUrl + pathTemplate}"`;
  }
  // Append api-key query param if needed
  if (auth.type === 'apikey' && auth.keyIn === 'query' && auth.keyName) {
    const sep = urlExpr.includes('?') ? '&' : '?';
    const val = auth.keyValue || '<api-key>';
    urlExpr = urlExpr.endsWith('"')
      ? urlExpr.slice(0, -1) + `${sep}${auth.keyName}=${val}"`
      : urlExpr;
  }

  // Request body for POST / PUT / PATCH
  const sw2Body = !op.requestBody && (op.parameters ?? []).some(p => p.in === 'body');
  const hasBody = !!op.requestBody || sw2Body;
  const needsContent = hasBody && ['post', 'put', 'patch'].includes(m);
  if (needsContent) {
    const bodySchema = op.requestBody
      ? (op.requestBody.content?.['application/json']?.schema ?? null)
      : (op.parameters?.find(p => p.in === 'body')?.schema ?? null);

    if (bodySchema && schemaHasClass(spec, bodySchema)) {
      // Model path: prepend class declarations, use typed initializer
      const resolved = bodySchema.$ref ? resolveRef(spec, bodySchema.$ref) : bodySchema;
      const className = bodySchema.$ref
        ? bodySchema.$ref.split('/').pop()
        : (op.operationId ? toPascalCase(op.operationId) + 'Request' : 'RequestBody');
      const classCode = schemaToCSharpClass(spec, bodySchema, className, 'stj');
      lines.unshift('');
      lines.unshift(...classCode.split('\n'));
      lines.push('');
      lines.push(`var payload = ${schemaToInitializerLiteral(spec, resolved ?? bodySchema, className, '')};`);
    } else if (bodySchema) {
      lines.push('');
      lines.push(`var payload = ${schemaToAnonymousLiteral(spec, bodySchema, '')};`);
    } else {
      lines.push('');
      lines.push('var payload = new { /* TODO: fill in request body */ };');
    }
    lines.push('var content = new StringContent(');
    lines.push('    JsonSerializer.Serialize(payload),');
    lines.push('    Encoding.UTF8, "application/json");');
  }

  // HTTP call
  lines.push('');
  const csMethod = { get: 'Get', post: 'Post', put: 'Put', patch: 'Patch', delete: 'Delete' }[m];
  if (csMethod) {
    const args = needsContent ? `${urlExpr}, content` : urlExpr;
    lines.push(`var response = await client.${csMethod}Async(${args});`);
  } else {
    // HEAD, OPTIONS, TRACE etc. — use SendAsync
    const httpMethod = method.toUpperCase();
    lines.push(`var request = new HttpRequestMessage(new HttpMethod("${httpMethod}"), ${urlExpr});`);
    lines.push('var response = await client.SendAsync(request);');
  }
  lines.push('response.EnsureSuccessStatusCode();');
  lines.push('var body = await response.Content.ReadAsStringAsync();');
  lines.push('body.Display();');

  return lines.join('\n');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SavedApiBar({ savedApis, selectedId, onSelect, onSave, onDelete }) {
  return (
    <div className="api-saved-bar">
      <select
        className="api-saved-select"
        value={selectedId || ''}
        onChange={(e) => onSelect(e.target.value || null)}
      >
        <option value="">— saved APIs —</option>
        {savedApis.map(a => (
          <option key={a.id} value={a.id}>{a.title || a.url}</option>
        ))}
      </select>
      <button className="api-saved-btn" onClick={onSave} title="Save current URL and auth config">
        Save
      </button>
      <button
        className="api-saved-btn api-saved-btn-del"
        onClick={onDelete}
        disabled={!selectedId}
        title="Delete saved API"
      >
        Delete
      </button>
    </div>
  );
}

function AuthConfig({ auth, onChange }) {
  function set(field, value) { onChange({ ...auth, [field]: value }); }
  return (
    <div className="api-auth-row">
      <span className="api-auth-label">Auth</span>
      <select className="api-auth-type" value={auth.type} onChange={(e) => set('type', e.target.value)}>
        <option value="none">None</option>
        <option value="bearer">Bearer</option>
        <option value="apikey">API Key</option>
        <option value="basic">Basic</option>
      </select>
      {auth.type === 'bearer' && (
        <input
          className="api-auth-input api-auth-secret"
          type="password"
          placeholder="Token"
          value={auth.token}
          onChange={(e) => set('token', e.target.value)}
          spellCheck={false}
        />
      )}
      {auth.type === 'apikey' && (
        <>
          <input
            className="api-auth-input"
            type="text"
            placeholder="Header / param name"
            value={auth.keyName}
            onChange={(e) => set('keyName', e.target.value)}
            spellCheck={false}
          />
          <input
            className="api-auth-input api-auth-secret"
            type="password"
            placeholder="Value"
            value={auth.keyValue}
            onChange={(e) => set('keyValue', e.target.value)}
            spellCheck={false}
          />
          <select className="api-auth-in" value={auth.keyIn} onChange={(e) => set('keyIn', e.target.value)}>
            <option value="header">header</option>
            <option value="query">query</option>
          </select>
        </>
      )}
      {auth.type === 'basic' && (
        <>
          <input
            className="api-auth-input"
            type="text"
            placeholder="Username"
            value={auth.username}
            onChange={(e) => set('username', e.target.value)}
            spellCheck={false}
          />
          <input
            className="api-auth-input api-auth-secret"
            type="password"
            placeholder="Password"
            value={auth.password}
            onChange={(e) => set('password', e.target.value)}
            spellCheck={false}
          />
        </>
      )}
      {auth.type !== 'none' && (
        <button className="api-auth-clear" onClick={() => onChange(DEFAULT_AUTH)} title="Clear auth">×</button>
      )}
    </div>
  );
}

function TryItForm({ spec, method, pathTemplate, op, auth, baseUrl }) {
  const pathParamDefs  = (op.parameters ?? []).filter(p => p.in === 'path');
  const queryParamDefs = (op.parameters ?? []).filter(p => p.in === 'query');
  const hasBody = !!op.requestBody || (spec.swagger && op.parameters?.some(p => p.in === 'body'));

  const [pathParams,  setPathParams]  = useState(() => Object.fromEntries(pathParamDefs.map(p  => [p.name, ''])));
  const [queryParams, setQueryParams] = useState(() => Object.fromEntries(queryParamDefs.map(p => [p.name, ''])));
  const [body,        setBody]        = useState(() => {
    if (!hasBody) return '';
    const bodySchema = op.requestBody
      ? (op.requestBody.content?.['application/json']?.schema ?? null)
      : (op.parameters?.find(p => p.in === 'body')?.schema ?? null);
    if (!bodySchema) return '';
    const skel = schemaSkeleton(spec, bodySchema);
    return skel !== null ? JSON.stringify(skel, null, 2) : '';
  });
  const [response,    setResponse]    = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);

  async function execute() {
    setLoading(true);
    setResponse(null);
    try {
      const headers = { 'Accept': 'application/json, */*' };
      if (hasBody) headers['Content-Type'] = 'application/json';
      const qp = { ...queryParams };
      applyAuth(headers, qp, auth);
      const url = buildRequestUrl(baseUrl, pathTemplate, pathParams, qp);
      const opts = { method, url, headers };
      if (hasBody && body.trim()) opts.body = body;
      const result = await window.electronAPI.apiRequest(opts);
      setResponse(result);
    } catch (e) {
      setResponse({ error: e.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  function prettyBody(text) {
    try { return JSON.stringify(JSON.parse(text), null, 2); }
    catch { return text; }
  }

  return (
    <div className="api-tryit">
      {pathParamDefs.length > 0 && (
        <div className="api-tryit-section">
          <div className="api-section-label">Path parameters</div>
          {pathParamDefs.map(p => (
            <div key={p.name} className="api-tryit-param-row">
              <span className="api-tryit-param-name">{p.name}</span>
              <input
                className="api-tryit-input"
                type="text"
                placeholder={p.description || p.name}
                value={pathParams[p.name] ?? ''}
                onChange={(e) => setPathParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      )}
      {queryParamDefs.length > 0 && (
        <div className="api-tryit-section">
          <div className="api-section-label">Query parameters</div>
          {queryParamDefs.map(p => (
            <div key={p.name} className="api-tryit-param-row">
              <span className="api-tryit-param-name">{p.name}</span>
              <input
                className="api-tryit-input"
                type="text"
                placeholder={p.description || p.name}
                value={queryParams[p.name] ?? ''}
                onChange={(e) => setQueryParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      )}
      {hasBody && (
        <div className="api-tryit-section">
          <div className="api-section-label">Request body</div>
          <textarea
            className="api-tryit-body"
            placeholder={'{\n  "key": "value"\n}'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}
      <div className="api-tryit-actions">
        <button
          className="api-tryit-execute"
          onClick={execute}
          disabled={loading}
          title={!baseUrl ? 'No base URL in spec — request may fail' : undefined}
        >
          {loading ? '…' : 'Execute'}
        </button>
      </div>
      {response && (
        <div className="api-tryit-response">
          {response.error ? (
            <div className="api-error">{response.error}</div>
          ) : (
            <>
              <div className="api-tryit-response-meta">
                <span className={`api-status-badge api-status-${String(response.status)[0]}xx`}>
                  {response.status}
                </span>
                <span className="api-tryit-status-text">{response.statusText}</span>
                <span className="api-tryit-duration">{response.duration}ms</span>
                <button
                  className="api-tryit-headers-toggle"
                  onClick={() => setShowHeaders(h => !h)}
                >
                  {showHeaders ? 'Hide headers' : 'Headers'}
                </button>
              </div>
              {showHeaders && response.headers && (
                <div className="api-tryit-headers">
                  {Object.entries(response.headers).map(([k, v]) => (
                    <div key={k} className="api-tryit-header-row">
                      <span className="api-tryit-header-name">{k}</span>
                      <span className="api-tryit-header-value">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {response.body && (
                <pre className="api-tryit-body-out">{prettyBody(response.body)}</pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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
          <th>Name</th><th>In</th><th>Type</th><th>Req</th><th>Description</th>
        </tr>
      </thead>
      <tbody>
        {resolved.map((p, i) => (
          <tr key={i}>
            <td className="api-param-name">{p.name}</td>
            <td className="api-param-in">{p.in}</td>
            <td className="api-param-type">{getSchemaType(spec, p.schema || { type: p.type })}</td>
            <td>{p.required ? '✓' : ''}</td>
            <td className="api-param-desc"><HtmlDesc text={p.description} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResponsesTable({ spec, responses }) {
  if (!responses) return null;
  return (
    <div className="api-responses">
      {Object.entries(responses).map(([code, resp]) => {
        const contentTypes = resp.content ? Object.keys(resp.content).join(', ') : null;
        const schemaType   = resp.schema  ? getSchemaType(spec, resp.schema)  : null;
        const typeLabel    = contentTypes || schemaType;
        const respSchema   = resp.content?.['application/json']?.schema
          ?? (resp.content && Object.values(resp.content)[0]?.schema)
          ?? resp.schema
          ?? null;
        const respName     = respSchema?.$ref
          ? respSchema.$ref.split('/').pop()
          : `Response${code.replace(/\*/g, 'x')}`;
        return (
          <div key={code} className="api-response-row">
            <span className={`api-status-badge api-status-${code[0]}xx`}>{code}</span>
            <HtmlDesc text={resp.description} className="api-response-desc" />
            {typeLabel && <span className="api-response-type">{typeLabel}</span>}
            {respSchema && <CopyClassButton spec={spec} schema={respSchema} name={respName} />}
          </div>
        );
      })}
    </div>
  );
}

function CopyClassButton({ spec, schema, name }) {
  const [open,   setOpen] = useState(false);
  const [copied, copyText] = useClipboard();

  if (!schemaHasClass(spec, schema)) return null;

  function copy(style) {
    setOpen(false);
    copyText(schemaToCSharpClass(spec, schema, name, style));
  }

  return (
    <span
      className="api-copy-class-wrap"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    >
      <button
        className={`api-inject-btn${copied ? ' api-inject-btn-ok' : ''}`}
        onClick={() => { if (!copied) setOpen(o => !o); }}
        title="Copy C# class declaration to clipboard"
      >
        {copied ? '✓ Copied!' : '{ } C# class ▾'}
      </button>
      {open && (
        <div className="api-copy-class-menu">
          <button onClick={() => copy('stj')}>System.Text.Json</button>
          <button onClick={() => copy('newtonsoft')}>Newtonsoft.Json</button>
        </div>
      )}
    </span>
  );
}

function Operation({ spec, method, path, op, expanded, onToggle, tryItOpen, onToggleTryIt, auth, baseUrl }) {
  const sw2Body      = !op.requestBody && spec.swagger ? getSwagger2BodyInfo(spec, op) : null;
  const displayParams = sw2Body
    ? (op.parameters ?? []).filter(p => p.in !== 'body')
    : op.parameters ?? [];
  const [copied, copyText] = useClipboard();

  function copyAsCs() {
    copyText(buildHttpClientSnippet(method, path, op, baseUrl, auth, spec));
  }

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
          {op.description && <HtmlDesc text={op.description} className="api-op-desc" tag="p" />}
          {displayParams.length > 0 && (
            <>
              <div className="api-section-label">Parameters</div>
              <ParamsTable spec={spec} parameters={displayParams} />
            </>
          )}
          {op.requestBody && (() => {
            const rbSchema = op.requestBody.content?.['application/json']?.schema ?? null;
            const rbName   = rbSchema?.$ref
              ? rbSchema.$ref.split('/').pop()
              : (op.operationId ? toPascalCase(op.operationId) + 'Body' : 'RequestBody');
            return (
              <>
                <div className="api-section-label">Request Body</div>
                <div className="api-request-body-row">
                  <div className="api-request-body">
                    {Object.keys(op.requestBody.content || {}).join(', ') || 'body'}
                    {op.requestBody.required ? ' (required)' : ' (optional)'}
                  </div>
                  {rbSchema && <CopyClassButton spec={spec} schema={rbSchema} name={rbName} />}
                </div>
              </>
            );
          })()}
          {sw2Body && (() => {
            const sw2Schema = sw2Body.schema ?? null;
            const sw2Name   = sw2Schema?.$ref ? sw2Schema.$ref.split('/').pop() : 'RequestBody';
            return (
              <>
                <div className="api-section-label">Request Body</div>
                <div className="api-request-body-row">
                  <div className="api-request-body">
                    {sw2Body.consumes.length ? sw2Body.consumes.join(', ') : 'body'}
                    {sw2Body.required ? ' (required)' : ' (optional)'}
                    {sw2Schema && <> — {getSchemaType(spec, sw2Schema)}</>}
                  </div>
                  {sw2Schema && <CopyClassButton spec={spec} schema={sw2Schema} name={sw2Name} />}
                </div>
              </>
            );
          })()}
          {op.responses && (
            <>
              <div className="api-section-label">Responses</div>
              <ResponsesTable spec={spec} responses={op.responses} />
            </>
          )}
          <div className="api-op-actions">
            <button
              className={`api-tryit-toggle${tryItOpen ? ' api-tryit-toggle-open' : ''}`}
              onClick={onToggleTryIt}
            >
              {tryItOpen ? '▾ Try it' : '▸ Try it'}
            </button>
            <button
              className="api-inject-btn"
              onClick={copyAsCs}
              title="Copy C# HttpClient snippet to clipboard"
            >
              {copied ? '✓ Copied!' : '{ } Copy as C#'}
            </button>
          </div>
          {tryItOpen && (
            <TryItForm
              spec={spec}
              method={method}
              pathTemplate={path}
              op={op}
              auth={auth}
              baseUrl={baseUrl}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TagGroup({ spec, tag, operations, expanded, onToggleTag, expandedOps, onToggleOp, expandedTryIt, onToggleTryIt, auth, baseUrl }) {
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
            tryItOpen={expandedTryIt.has(opKey)}
            onToggleTryIt={() => onToggleTryIt(opKey)}
            auth={auth}
            baseUrl={baseUrl}
          />
        );
      })}
    </div>
  );
}

// ── ApiPanel ──────────────────────────────────────────────────────────────────

export function ApiPanel({ onToggle }) {
  const [url,          setUrl]          = useState('');
  const [spec,         setSpec]         = useState(null);
  const [error,        setError]        = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [expandedTags, setExpandedTags] = useState(new Set());
  const [expandedOps,  setExpandedOps]  = useState(new Set());
  const [expandedTryIt,setExpandedTryIt]= useState(new Set());
  const [auth,         setAuth]         = useState(DEFAULT_AUTH);
  const [savedApis,    setSavedApis]    = useState([]);
  const [selectedSavedId, setSelectedSavedId] = useState(null);

  useEffect(() => {
    window.electronAPI.loadApiSaved?.().then(list => setSavedApis(list ?? [])).catch(() => {});
  }, []);

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
      setExpandedTryIt(new Set());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function selectSavedApi(id) {
    setSelectedSavedId(id);
    if (!id) return;
    const saved = savedApis.find(a => a.id === id);
    if (!saved) return;
    setUrl(saved.url);
    setAuth(saved.auth ?? DEFAULT_AUTH);
    setSpec(null);
    setError(null);
  }

  function saveCurrentApi() {
    const title = spec?.info?.title || url;
    const entry = { id: selectedSavedId || generateId(), url, title, auth };
    const updated = selectedSavedId
      ? savedApis.map(a => a.id === selectedSavedId ? entry : a)
      : [...savedApis, entry];
    setSavedApis(updated);
    setSelectedSavedId(entry.id);
    window.electronAPI.saveApiSaved?.(updated);
  }

  function deleteCurrentApi() {
    if (!selectedSavedId) return;
    const updated = savedApis.filter(a => a.id !== selectedSavedId);
    setSavedApis(updated);
    setSelectedSavedId(null);
    window.electronAPI.saveApiSaved?.(updated);
  }

  function toggleTag(tag) {
    setExpandedTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  function toggleOp(key) {
    setExpandedOps(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleTryIt(key) {
    setExpandedTryIt(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const groups  = spec ? groupOperations(spec) : {};
  const specBaseUrl = spec ? getBaseUrl(spec) : '';
  let baseUrl = specBaseUrl;
  if (!baseUrl && url.trim()) {
    try { baseUrl = new URL(url.trim()).origin; } catch { /* keep empty */ }
  }
  const totalOps = Object.values(groups).reduce((n, ops) => n + ops.length, 0);

  return (
    <div className="api-panel">
      <div className="api-panel-header">
        <span className="api-panel-title">API Browser</span>
      </div>

      <SavedApiBar
        savedApis={savedApis}
        selectedId={selectedSavedId}
        onSelect={selectSavedApi}
        onSave={saveCurrentApi}
        onDelete={deleteCurrentApi}
      />

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

      <AuthConfig auth={auth} onChange={setAuth} />

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
              <HtmlDesc text={spec.info.description} className="api-info-desc" tag="div" />
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
                expandedTryIt={expandedTryIt}
                onToggleTryIt={toggleTryIt}
                auth={auth}
                baseUrl={baseUrl}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
