import React, { useState } from 'react';
import { EndpointEditor } from './EndpointEditor.jsx';

function shortId() { return Math.random().toString(36).slice(2, 10); }

export function ControllerSection({ controller, modelNames, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(true);

  const set = (key, value) => onUpdate({ ...controller, [key]: value });

  const updateEndpoint = (idx, ep) => {
    set('endpoints', controller.endpoints.map((e, i) => i === idx ? ep : e));
  };

  const addEndpoint = () => {
    set('endpoints', [...controller.endpoints, {
      id: shortId(), method: 'get', path: '/', summary: '', description: '',
      headers: [], parameters: [], requestBody: null,
      responses: [{ status: '200', description: 'Successful response', schema: '' }],
      mockResponse: null,
    }]);
  };

  const removeEndpoint = (idx) => {
    set('endpoints', controller.endpoints.filter((_, i) => i !== idx));
  };

  return (
    <div className="api-ed-controller">
      <div className="api-ed-controller-header" onClick={() => setExpanded(v => !v)}>
        <span className="api-ed-expand">{expanded ? '▾' : '▸'}</span>
        <input
          className="api-ed-controller-name"
          value={controller.name}
          onChange={(e) => set('name', e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="ControllerName"
          spellCheck={false}
        />
        <input
          className="api-ed-controller-path"
          value={controller.basePath}
          onChange={(e) => set('basePath', e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="/api/path"
          spellCheck={false}
        />
        <span className="api-ed-ep-count">{controller.endpoints.length} endpoints</span>
        <button className="api-ed-add-btn-inline" onClick={(e) => { e.stopPropagation(); addEndpoint(); }} title="Add endpoint">+ Endpoint</button>
        <button className="api-ed-remove-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete controller">✕</button>
      </div>
      {expanded && (
        <div className="api-ed-controller-body">
          <input
            className="api-ed-desc-input"
            value={controller.description || ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Controller description"
          />
          {controller.endpoints.map((ep, i) => (
            <EndpointEditor
              key={ep.id}
              endpoint={ep}
              modelNames={modelNames}
              onUpdate={(updated) => updateEndpoint(i, updated)}
              onDelete={() => removeEndpoint(i)}
            />
          ))}
          {controller.endpoints.length === 0 && (
            <div className="api-ed-empty">No endpoints — click + Endpoint to add one</div>
          )}
        </div>
      )}
    </div>
  );
}
