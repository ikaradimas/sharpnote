import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

const METHOD_COLORS = {
  get: '#61afef', post: '#98c379', put: '#e5c07b',
  delete: '#e06c75', patch: '#c678dd',
};

const METHOD_BG = {
  get: 'rgba(97,175,239,0.12)', post: 'rgba(152,195,121,0.12)', put: 'rgba(229,192,123,0.12)',
  delete: 'rgba(224,108,117,0.12)', patch: 'rgba(198,120,221,0.12)',
};

const HANDLER_PLACEHOLDER = [
  '// req: { params, query, body, headers, method }',
  'const id = req.params.id || 1;',
  'return {',
  '  status: 200,',
  '  body: { id, message: "Hello from handler" }',
  '};',
].join('\n');

export function EndpointEditor({ endpoint, modelNames, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const set = (key, value) => onUpdate({ ...endpoint, [key]: value });

  const updateParam = (idx, key, value) => {
    const params = endpoint.parameters.map((p, i) => i === idx ? { ...p, [key]: value } : p);
    set('parameters', params);
  };
  const addParam = () => set('parameters', [...(endpoint.parameters || []), { name: '', in: 'query', description: '', required: false, schema: 'string' }]);
  const removeParam = (idx) => set('parameters', endpoint.parameters.filter((_, i) => i !== idx));

  const updateHeader = (idx, key, value) => {
    const headers = endpoint.headers.map((h, i) => i === idx ? { ...h, [key]: value } : h);
    set('headers', headers);
  };
  const addHeader = () => set('headers', [...(endpoint.headers || []), { name: '', description: '', required: false, schema: 'string' }]);
  const removeHeader = (idx) => set('headers', endpoint.headers.filter((_, i) => i !== idx));

  const updateResponse = (idx, key, value) => {
    const responses = endpoint.responses.map((r, i) => i === idx ? { ...r, [key]: value } : r);
    set('responses', responses);
  };
  const addResponse = () => set('responses', [...(endpoint.responses || []), { status: '200', description: '', schema: '' }]);
  const removeResponse = (idx) => set('responses', endpoint.responses.filter((_, i) => i !== idx));

  const method = endpoint.method || 'get';
  const color = METHOD_COLORS[method] || '#888';

  return (
    <div className="api-ed-endpoint" style={{ borderLeftColor: color }}>
      <div className="api-ed-endpoint-header" onClick={() => setExpanded(v => !v)}>
        <span className="api-ed-expand">{expanded ? '▾' : '▸'}</span>
        <span className="api-ed-method" style={{ color, background: METHOD_BG[method] }}>{method.toUpperCase()}</span>
        <input
          className="api-ed-endpoint-path"
          value={endpoint.path || ''}
          onChange={(e) => set('path', e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="/path"
          spellCheck={false}
        />
        <input
          className="api-ed-endpoint-summary"
          value={endpoint.summary || ''}
          onChange={(e) => set('summary', e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="Summary"
        />
        <button className="api-ed-remove-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete endpoint"><X size={12} /></button>
      </div>
      {expanded && (
        <div className="api-ed-endpoint-body">
          {/* Method + Description */}
          <div className="api-ed-row">
            <select className="api-ed-method-select" value={method} onChange={(e) => set('method', e.target.value)}>
              {Object.keys(METHOD_COLORS).map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
            <input className="api-ed-desc-input api-ed-flex" value={endpoint.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="Detailed description" />
          </div>

          {/* Parameters */}
          <div className="api-ed-section-label">Parameters <button className="api-ed-add-btn-inline" onClick={addParam}><Plus size={12} /></button></div>
          {(endpoint.parameters || []).map((p, i) => (
            <div key={i} className="api-ed-param-row">
              <input className="api-ed-param-name" value={p.name} onChange={(e) => updateParam(i, 'name', e.target.value)} placeholder="name" spellCheck={false} />
              <select className="api-ed-param-in" value={p.in} onChange={(e) => updateParam(i, 'in', e.target.value)}>
                <option value="query">query</option>
                <option value="path">path</option>
              </select>
              <input className="api-ed-param-schema" value={p.schema || ''} onChange={(e) => updateParam(i, 'schema', e.target.value)} placeholder="type" />
              <input type="checkbox" checked={p.required} onChange={(e) => updateParam(i, 'required', e.target.checked)} title="Required" />
              <input className="api-ed-param-desc" value={p.description || ''} onChange={(e) => updateParam(i, 'description', e.target.value)} placeholder="description" />
              <button className="api-ed-remove-btn" onClick={() => removeParam(i)}><X size={12} /></button>
            </div>
          ))}

          {/* Headers */}
          <div className="api-ed-section-label">Headers <button className="api-ed-add-btn-inline" onClick={addHeader}><Plus size={12} /></button></div>
          {(endpoint.headers || []).map((h, i) => (
            <div key={i} className="api-ed-param-row">
              <input className="api-ed-param-name" value={h.name} onChange={(e) => updateHeader(i, 'name', e.target.value)} placeholder="Header-Name" spellCheck={false} />
              <input type="checkbox" checked={h.required} onChange={(e) => updateHeader(i, 'required', e.target.checked)} title="Required" />
              <input className="api-ed-param-desc api-ed-flex" value={h.description || ''} onChange={(e) => updateHeader(i, 'description', e.target.value)} placeholder="description" />
              <button className="api-ed-remove-btn" onClick={() => removeHeader(i)}><X size={12} /></button>
            </div>
          ))}

          {/* Request Body */}
          <div className="api-ed-section-label">Request Body</div>
          <div className="api-ed-reqbody-row">
            <select className="api-ed-reqbody-model" value={endpoint.requestBody?.schema || ''} onChange={(e) => set('requestBody', { ...(endpoint.requestBody || {}), schema: e.target.value, contentType: endpoint.requestBody?.contentType || 'application/json' })}>
              <option value="">None</option>
              {modelNames.map(n => <option key={n} value={n}>{n}</option>)}
              {modelNames.length > 0 && <option disabled>──────</option>}
              {modelNames.map(n => <option key={`list-${n}`} value={`List<${n}>`}>List&lt;{n}&gt;</option>)}
            </select>
            <input className="api-ed-param-desc api-ed-flex" value={endpoint.requestBody?.description || ''} onChange={(e) => set('requestBody', { ...(endpoint.requestBody || {}), description: e.target.value })} placeholder="Body description" />
          </div>

          {/* Responses */}
          <div className="api-ed-section-label">Responses <button className="api-ed-add-btn-inline" onClick={addResponse}><Plus size={12} /></button></div>
          {(endpoint.responses || []).map((r, i) => (
            <div key={i} className="api-ed-param-row">
              <input className="api-ed-resp-status" value={r.status} onChange={(e) => updateResponse(i, 'status', e.target.value)} placeholder="200" />
              <select className="api-ed-reqbody-model" value={r.schema || ''} onChange={(e) => updateResponse(i, 'schema', e.target.value)}>
                <option value="">No body</option>
                {modelNames.map(n => <option key={n} value={n}>{n}</option>)}
                {modelNames.length > 0 && <option disabled>──────</option>}
                {modelNames.map(n => <option key={`list-${n}`} value={`List<${n}>`}>List&lt;{n}&gt;</option>)}
              </select>
              <input className="api-ed-param-desc api-ed-flex" value={r.description || ''} onChange={(e) => updateResponse(i, 'description', e.target.value)} placeholder="description" />
              <button className="api-ed-remove-btn" onClick={() => removeResponse(i)}><X size={12} /></button>
            </div>
          ))}

          {/* Mock Response */}
          <div className="api-ed-section-label">
            Mock Response
            <div className="api-ed-mock-mode-toggle">
              <button
                className={`api-ed-mock-mode-btn${!endpoint.mockHandler ? ' active' : ''}`}
                onClick={() => set('mockHandler', null)}
              >Static</button>
              <button
                className={`api-ed-mock-mode-btn${endpoint.mockHandler != null ? ' active' : ''}`}
                onClick={() => { if (endpoint.mockHandler == null) set('mockHandler', HANDLER_PLACEHOLDER); }}
              >Handler</button>
            </div>
          </div>
          {endpoint.mockHandler != null ? (
            <textarea
              className="api-ed-mock-handler"
              value={endpoint.mockHandler}
              onChange={(e) => set('mockHandler', e.target.value)}
              placeholder={'// req: { params, query, body, headers, method }\n// Return object or { status, headers, body }\nreturn { status: 200, body: { message: "hello" } };'}
              rows={6}
              spellCheck={false}
            />
          ) : (
            <div className="api-ed-mock-row">
              <input className="api-ed-resp-status" value={endpoint.mockResponse?.status ?? 200} onChange={(e) => set('mockResponse', { ...(endpoint.mockResponse || { headers: {}, body: '{}' }), status: parseInt(e.target.value) || 200 })} placeholder="200" type="number" />
              <textarea
                className="api-ed-mock-body"
                value={endpoint.mockResponse?.body || ''}
                onChange={(e) => set('mockResponse', { ...(endpoint.mockResponse || { status: 200, headers: {} }), body: e.target.value })}
                placeholder='{"id": 1, "name": "Example"}'
                rows={3}
                spellCheck={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
