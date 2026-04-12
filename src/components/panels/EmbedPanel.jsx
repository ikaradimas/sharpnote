import React, { useState } from 'react';
import { File, Plus, Trash2, ChevronDown, ChevronRight, Pencil, Plus as PlusIcon, X } from 'lucide-react';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EditDialog({ file, onSave, onCancel }) {
  const [name, setName] = useState(file.name);
  const [filename, setFilename] = useState(file.filename);
  const [mimeType, setMimeType] = useState(file.mimeType);
  const isText = file.encoding !== 'base64';
  const [content, setContent] = useState(isText ? (file.content || '') : '');
  const [vars, setVars] = useState(() => Object.entries(file.variables || {}).map(([k, v]) => ({ k, v })));
  const [newVarKey, setNewVarKey] = useState('');

  const handleSave = () => {
    const variables = {};
    for (const { k, v } of vars) {
      if (k.trim()) variables[k.trim()] = v;
    }
    onSave({
      ...file,
      name: name.trim() || file.name,
      filename: filename.trim() || file.filename,
      mimeType: mimeType.trim() || file.mimeType,
      ...(isText ? { content } : {}),
      variables,
    });
  };

  const addVar = () => {
    const key = newVarKey.trim();
    if (!key || vars.some(v => v.k === key)) return;
    setVars([...vars, { k: key, v: '' }]);
    setNewVarKey('');
  };

  const removeVar = (idx) => setVars(vars.filter((_, i) => i !== idx));
  const updateVarVal = (idx, v) => setVars(vars.map((item, i) => i === idx ? { ...item, v } : item));

  return (
    <div className="embed-edit-overlay" onClick={onCancel}>
      <div className="embed-edit-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="embed-edit-header">Edit Embedded File</div>
        <div className="embed-edit-body">
          <label className="embed-edit-field">
            <span className="embed-edit-label">Name (code access key)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
          </label>
          <label className="embed-edit-field">
            <span className="embed-edit-label">Filename</span>
            <input value={filename} onChange={(e) => setFilename(e.target.value)} spellCheck={false} />
          </label>
          <label className="embed-edit-field">
            <span className="embed-edit-label">MIME type</span>
            <input value={mimeType} onChange={(e) => setMimeType(e.target.value)} spellCheck={false} />
          </label>
          {isText && (
            <label className="embed-edit-field">
              <span className="embed-edit-label">Content</span>
              <textarea
                className="embed-edit-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                rows={8}
              />
            </label>
          )}
          {!isText && (
            <div className="embed-edit-binary-note">Binary file — content cannot be edited inline. Re-embed to replace.</div>
          )}
          <div className="embed-edit-vars-section">
            <span className="embed-edit-label">Variables</span>
            {vars.map(({ k, v }, idx) => (
              <div key={idx} className="embed-edit-var-row">
                <span className="embed-edit-var-key">{k}</span>
                <input
                  className="embed-edit-var-input"
                  value={v}
                  onChange={(e) => updateVarVal(idx, e.target.value)}
                  spellCheck={false}
                />
                <button className="embed-edit-var-del" onClick={() => removeVar(idx)} title="Remove variable"><X size={10} /></button>
              </div>
            ))}
            <div className="embed-edit-add-var">
              <input
                placeholder="New variable key"
                value={newVarKey}
                onChange={(e) => setNewVarKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addVar(); }}
                spellCheck={false}
              />
              <button onClick={addVar} disabled={!newVarKey.trim()} title="Add variable"><PlusIcon size={10} /></button>
            </div>
          </div>
        </div>
        <div className="embed-edit-actions">
          <button className="embed-edit-btn embed-edit-cancel" onClick={onCancel}>Cancel</button>
          <button className="embed-edit-btn embed-edit-save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function EmbedPanel({ files = [], onAdd, onDelete, onUpdateVars, onUpdate, onToggle }) {
  const [openFile, setOpenFile] = useState(null);
  const [editingFile, setEditingFile] = useState(null);

  return (
    <div className="embed-panel">
      <div className="embed-panel-header">
        <File size={12} className="embed-panel-icon" />
        <span className="embed-panel-title">Embedded Files</span>
        <span className="embed-panel-count">{files.length}</span>
        {onAdd && <button className="embed-panel-add" onClick={onAdd} title="Embed a file"><Plus size={12} /></button>}
      </div>
      <div className="embed-panel-list">
        {files.map((f) => {
          const size = f.encoding === 'base64'
            ? Math.floor((f.content?.length || 0) * 0.75)
            : (f.content?.length || 0);
          const isOpen = openFile === f.name;
          const varCount = Object.keys(f.variables || {}).length;
          return (
            <div key={f.name} className="embed-file-item">
              <div className="embed-file-row" onClick={() => setOpenFile(isOpen ? null : f.name)}>
                {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <span className="embed-file-name">{f.name}</span>
                <span className="embed-file-meta">{formatSize(size)}</span>
                <button className="embed-file-edit" onClick={(e) => { e.stopPropagation(); setEditingFile(f); }} title="Edit"><Pencil size={10} /></button>
                <button className="embed-file-del" onClick={(e) => { e.stopPropagation(); onDelete?.(f.name); }} title="Remove"><Trash2 size={10} /></button>
              </div>
              {isOpen && (
                <div className="embed-file-details">
                  <div className="embed-file-info-row">
                    <span className="embed-file-label">File</span>
                    <span className="embed-file-value">{f.filename}</span>
                  </div>
                  <div className="embed-file-info-row">
                    <span className="embed-file-label">Type</span>
                    <span className="embed-file-value">{f.mimeType}</span>
                  </div>
                  <div className="embed-file-info-row">
                    <span className="embed-file-label">Encoding</span>
                    <span className="embed-file-value">{f.encoding}</span>
                  </div>
                  {varCount > 0 && (
                    <>
                      <div className="embed-file-section-label">Variables</div>
                      {Object.entries(f.variables).map(([k, v]) => (
                        <div key={k} className="embed-var-row">
                          <span className="embed-var-key">{k}</span>
                          <input
                            className="embed-var-input"
                            value={v}
                            onChange={(e) => onUpdateVars?.(f.name, k, e.target.value)}
                            spellCheck={false}
                          />
                        </div>
                      ))}
                    </>
                  )}
                  <div className="embed-file-code-hint">
                    <code>Files["{f.name}"].ContentAsText</code>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {files.length === 0 && (
          <div className="embed-panel-empty">
            <p>No embedded files.</p>
            <p className="embed-panel-hint">Click + to embed a file, or use<br/><code>Files.Embed("name", bytes, "file.csv", "text/csv")</code><br/>from a code cell.</p>
          </div>
        )}
      </div>
      {editingFile && (
        <EditDialog
          file={editingFile}
          onCancel={() => setEditingFile(null)}
          onSave={(updated) => {
            onUpdate?.(editingFile.name, updated);
            setEditingFile(null);
          }}
        />
      )}
    </div>
  );
}
