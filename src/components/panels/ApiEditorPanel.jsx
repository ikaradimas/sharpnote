import React, { useState, useEffect, useCallback } from 'react';
import { FilePlus, Save, Trash2, Database, FolderTree, Download, Play, Square, Plus, Server, X } from 'lucide-react';
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
  const [runningServers, setRunningServers] = useState([]); // [{ id, port, title }]
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Load saved APIs and running servers on mount
  useEffect(() => {
    window.electronAPI?.loadApiSaved?.().then(list => setSavedApis(list ?? [])).catch(() => {});
    refreshServerList();
  }, []);

  const refreshServerList = useCallback(() => {
    window.electronAPI?.listMockServers?.().then(list => setRunningServers(list ?? [])).catch(() => {});
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

  const currentApiRunning = runningServers.find(s => s.id === apiDef.id);

  const toggleMock = async () => {
    if (currentApiRunning) {
      await window.electronAPI?.stopMockServer?.(apiDef.id);
      refreshServerList();
    } else {
      const result = await window.electronAPI?.startMockServer?.({ apiDef, port: 0 });
      if (result?.success) refreshServerList();
    }
  };

  const stopServer = async (id) => {
    await window.electronAPI?.stopMockServer?.(id);
    refreshServerList();
  };

  return (
    <div className="api-ed-panel">
      {/* Header bar with save/load */}
      <div className="api-ed-toolbar">
        <button className="api-ed-toolbar-btn" onClick={newApi} title="New API"><FilePlus size={14} /></button>
        <select
          className="api-ed-saved-select"
          value={selectedId || ''}
          onChange={(e) => loadApi(e.target.value || null)}
        >
          <option value="">— select saved —</option>
          {editorApis.map(a => <option key={a.id} value={a.id}>{a.title || 'Untitled'}</option>)}
        </select>
        <button className="api-ed-toolbar-btn api-ed-save-btn" onClick={saveApi} title="Save"><Save size={14} /></button>
        <button className="api-ed-toolbar-btn api-ed-del-btn" onClick={deleteApi} disabled={!selectedId} title="Delete"><Trash2 size={14} /></button>
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
          <div className="api-ed-section-header api-ed-section-models">
            <Database size={14} className="api-ed-section-icon" />
            <span>Models</span>
            <button className="api-ed-add-btn-inline" onClick={addModel}><Plus size={12} /> Model</button>
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
          <div className="api-ed-section-header api-ed-section-controllers">
            <FolderTree size={14} className="api-ed-section-icon" />
            <span>Controllers</span>
            <button className="api-ed-add-btn-inline" onClick={addController}><Plus size={12} /> Controller</button>
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

      {/* Running servers list */}
      {runningServers.length > 0 && (
        <div className="api-ed-servers">
          <div className="api-ed-servers-header">
            <Server size={12} /> Running Mocks ({runningServers.length})
          </div>
          {runningServers.map(s => (
            <div key={s.id} className={`api-ed-server-row${s.id === apiDef.id ? ' api-ed-server-current' : ''}`}>
              <span className="api-ed-server-dot" />
              <span className="api-ed-server-title">{s.title || s.id}</span>
              <span className="api-ed-server-port">:{s.port}</span>
              <button className="api-ed-server-stop" onClick={() => stopServer(s.id)} title="Stop"><X size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="api-ed-actions">
        <div className="api-ed-export-wrap">
          <button className="api-ed-action-btn api-ed-export-btn" onClick={() => setExportMenuOpen(v => !v)}><Download size={14} /> Export ▾</button>
          {exportMenuOpen && (
            <div className="api-ed-export-menu">
              <button onClick={() => exportSpec('json')}>JSON</button>
              <button onClick={() => exportSpec('yaml')}>YAML</button>
            </div>
          )}
        </div>
        <button
          className={`api-ed-action-btn api-ed-mock-btn${currentApiRunning ? ' api-ed-mock-active' : ''}`}
          onClick={toggleMock}
        >
          {currentApiRunning
            ? <><Square size={14} /> Mock :{currentApiRunning.port}</>
            : <><Play size={14} /> Mock Server</>
          }
        </button>
      </div>
    </div>
  );
}
