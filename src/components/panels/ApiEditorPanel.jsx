import React, { useState, useEffect, useCallback } from 'react';
import { ModelEditor } from './api-editor/ModelEditor.jsx';
import { ControllerSection } from './api-editor/ControllerSection.jsx';

function shortId() { return Math.random().toString(36).slice(2, 10); }

function emptyApiDef() {
  return {
    id: shortId(),
    type: 'editor',
    title: '',
    description: '',
    version: '1.0.0',
    baseUrl: 'http://localhost:3000',
    controllers: [],
    models: [],
  };
}

export function ApiEditorPanel({ onToggle }) {
  const [apiDef, setApiDef] = useState(emptyApiDef);
  const [savedApis, setSavedApis] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [mockStatus, setMockStatus] = useState(null); // { running, port }
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Load saved APIs on mount
  useEffect(() => {
    window.electronAPI?.loadApiSaved?.().then(list => setSavedApis(list ?? [])).catch(() => {});
  }, []);

  const editorApis = savedApis.filter(a => a.type === 'editor');
  const modelNames = apiDef.models.map(m => m.name).filter(Boolean);

  const set = useCallback((key, value) => {
    setApiDef(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────

  const saveApi = useCallback(() => {
    const entry = { ...apiDef, id: selectedId || apiDef.id };
    const updated = selectedId
      ? savedApis.map(a => a.id === selectedId ? entry : a)
      : [...savedApis, entry];
    setSavedApis(updated);
    setSelectedId(entry.id);
    window.electronAPI?.saveApiSaved?.(updated);
  }, [apiDef, selectedId, savedApis]);

  const loadApi = useCallback((id) => {
    setSelectedId(id);
    if (!id) { setApiDef(emptyApiDef()); return; }
    const saved = savedApis.find(a => a.id === id);
    if (saved) setApiDef(saved);
  }, [savedApis]);

  const deleteApi = useCallback(() => {
    if (!selectedId) return;
    const updated = savedApis.filter(a => a.id !== selectedId);
    setSavedApis(updated);
    setSelectedId(null);
    setApiDef(emptyApiDef());
    window.electronAPI?.saveApiSaved?.(updated);
  }, [selectedId, savedApis]);

  const newApi = useCallback(() => {
    setSelectedId(null);
    setApiDef(emptyApiDef());
  }, []);

  // ── Models ────────────────────────────────────────────────────────────

  const addModel = () => set('models', [...apiDef.models, { id: shortId(), name: '', description: '', fields: [] }]);
  const updateModel = (idx, model) => set('models', apiDef.models.map((m, i) => i === idx ? model : m));
  const removeModel = (idx) => set('models', apiDef.models.filter((_, i) => i !== idx));

  // ── Controllers ───────────────────────────────────────────────────────

  const addController = () => set('controllers', [...apiDef.controllers, {
    id: shortId(), name: '', description: '', basePath: '/api', endpoints: [],
  }]);
  const updateController = (idx, ctrl) => set('controllers', apiDef.controllers.map((c, i) => i === idx ? ctrl : c));
  const removeController = (idx) => set('controllers', apiDef.controllers.filter((_, i) => i !== idx));

  // ── Export ────────────────────────────────────────────────────────────

  const exportSpec = async (format) => {
    setExportMenuOpen(false);
    window.electronAPI?.exportOpenApi?.({ apiDef, format });
  };

  // ── Mock Server ───────────────────────────────────────────────────────

  const toggleMock = async () => {
    if (mockStatus?.running) {
      await window.electronAPI?.stopMockServer?.();
      setMockStatus(null);
    } else {
      const port = parseInt(new URL(apiDef.baseUrl || 'http://localhost:3000').port) || 3000;
      const result = await window.electronAPI?.startMockServer?.({ apiDef, port });
      if (result?.success) setMockStatus({ running: true, port: result.port });
    }
  };

  return (
    <div className="api-ed-panel">
      {/* Header bar with save/load */}
      <div className="api-ed-toolbar">
        <button className="api-ed-toolbar-btn" onClick={newApi} title="New API">New</button>
        <select
          className="api-ed-saved-select"
          value={selectedId || ''}
          onChange={(e) => loadApi(e.target.value || null)}
        >
          <option value="">— select saved —</option>
          {editorApis.map(a => <option key={a.id} value={a.id}>{a.title || 'Untitled'}</option>)}
        </select>
        <button className="api-ed-toolbar-btn" onClick={saveApi} title="Save">Save</button>
        <button className="api-ed-toolbar-btn api-ed-del-btn" onClick={deleteApi} disabled={!selectedId} title="Delete">✕</button>
      </div>

      <div className="api-ed-scroll">
        {/* API metadata */}
        <div className="api-ed-meta">
          <div className="api-ed-meta-row">
            <input className="api-ed-title" value={apiDef.title} onChange={(e) => set('title', e.target.value)} placeholder="API Title" spellCheck={false} />
            <input className="api-ed-version" value={apiDef.version} onChange={(e) => set('version', e.target.value)} placeholder="1.0.0" spellCheck={false} />
          </div>
          <input className="api-ed-base-url" value={apiDef.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} placeholder="http://localhost:3000" spellCheck={false} />
          <input className="api-ed-desc-input" value={apiDef.description} onChange={(e) => set('description', e.target.value)} placeholder="API description" />
        </div>

        {/* Models section */}
        <div className="api-ed-section">
          <div className="api-ed-section-header">
            <span>Models</span>
            <button className="api-ed-add-btn-inline" onClick={addModel}>+ Model</button>
          </div>
          {apiDef.models.map((model, i) => (
            <ModelEditor
              key={model.id}
              model={model}
              modelNames={modelNames}
              onUpdate={(m) => updateModel(i, m)}
              onDelete={() => removeModel(i)}
            />
          ))}
          {apiDef.models.length === 0 && <div className="api-ed-empty">No models defined</div>}
        </div>

        {/* Controllers section */}
        <div className="api-ed-section">
          <div className="api-ed-section-header">
            <span>Controllers</span>
            <button className="api-ed-add-btn-inline" onClick={addController}>+ Controller</button>
          </div>
          {apiDef.controllers.map((ctrl, i) => (
            <ControllerSection
              key={ctrl.id}
              controller={ctrl}
              modelNames={modelNames}
              onUpdate={(c) => updateController(i, c)}
              onDelete={() => removeController(i)}
            />
          ))}
          {apiDef.controllers.length === 0 && <div className="api-ed-empty">No controllers — click + Controller to add one</div>}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="api-ed-actions">
        <div className="api-ed-export-wrap">
          <button className="api-ed-action-btn" onClick={() => setExportMenuOpen(v => !v)}>Export OpenAPI ▾</button>
          {exportMenuOpen && (
            <div className="api-ed-export-menu">
              <button onClick={() => exportSpec('json')}>JSON</button>
              <button onClick={() => exportSpec('yaml')}>YAML</button>
            </div>
          )}
        </div>
        <button
          className={`api-ed-action-btn${mockStatus?.running ? ' api-ed-mock-active' : ''}`}
          onClick={toggleMock}
        >
          {mockStatus?.running ? `Mock ■ :${mockStatus.port}` : 'Mock Server ▶'}
        </button>
      </div>
    </div>
  );
}
