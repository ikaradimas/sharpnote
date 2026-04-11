import React, { useState } from 'react';
import { File, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmbedPanel({ files = [], onAdd, onDelete, onUpdateVars, onToggle }) {
  const [openFile, setOpenFile] = useState(null);

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
    </div>
  );
}
