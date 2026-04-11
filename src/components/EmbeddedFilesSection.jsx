import React, { useState } from 'react';
import { File, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmbeddedFilesSection({ files = [], onAdd, onDelete, onUpdateVars }) {
  const [expanded, setExpanded] = useState(false);
  const [openFile, setOpenFile] = useState(null);

  if (!files.length && !expanded) {
    return (
      <div className="embedded-files-bar">
        <button className="embedded-files-toggle" onClick={() => { setExpanded(true); }}>
          <File size={11} /> Files (0)
        </button>
        {onAdd && <button className="embedded-files-add" onClick={onAdd} title="Embed a file"><Plus size={11} /></button>}
      </div>
    );
  }

  return (
    <div className="embedded-files-section">
      <div className="embedded-files-bar">
        <button className="embedded-files-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <File size={11} /> Files ({files.length})
        </button>
        {onAdd && <button className="embedded-files-add" onClick={onAdd} title="Embed a file"><Plus size={11} /></button>}
      </div>
      {expanded && (
        <div className="embedded-files-list">
          {files.map((f) => {
            const size = f.encoding === 'base64'
              ? Math.floor((f.content?.length || 0) * 0.75)
              : (f.content?.length || 0);
            const isOpen = openFile === f.name;
            return (
              <div key={f.name} className="embedded-file-item">
                <div className="embedded-file-row" onClick={() => setOpenFile(isOpen ? null : f.name)}>
                  <span className="embedded-file-name">{f.name}</span>
                  <span className="embedded-file-info">{f.filename} · {formatSize(size)}</span>
                  <button className="embedded-file-del" onClick={(e) => { e.stopPropagation(); onDelete?.(f.name); }} title="Remove"><Trash2 size={10} /></button>
                </div>
                {isOpen && (
                  <div className="embedded-file-vars">
                    <div className="embedded-file-mime">{f.mimeType}</div>
                    {Object.entries(f.variables || {}).map(([k, v]) => (
                      <div key={k} className="embedded-var-row">
                        <span className="embedded-var-key">{k}</span>
                        <input
                          className="embedded-var-val"
                          value={v}
                          onChange={(e) => onUpdateVars?.(f.name, k, e.target.value)}
                          spellCheck={false}
                        />
                      </div>
                    ))}
                    <div className="embedded-file-access">
                      <code>Files["{f.name}"].ContentAsText</code>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {files.length === 0 && <div className="embedded-files-empty">No embedded files</div>}
        </div>
      )}
    </div>
  );
}
