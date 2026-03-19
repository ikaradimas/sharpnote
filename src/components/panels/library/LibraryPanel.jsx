import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useResize } from '../../../hooks/useResize.js';
import { CodeEditor } from '../../editor/CodeEditor.jsx';

export function LibraryPanel({ onInsert, onClose, onOpenFile }) {
  const [width, onResizeMouseDown] = useResize(300, 'left');
  const [previewHeight, onPreviewResizeMouseDown] = useResize(220, 'top');
  const [currentPath, setCurrentPath] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null); // { name, fullPath }
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const newFileInputRef = useRef(null);

  const subfolder = currentPath.join('/');

  const refresh = useCallback(async (keepSelected) => {
    if (!window.electronAPI) return;
    setLoading(true);
    const result = await window.electronAPI.getLibraryFiles(subfolder);
    setFolders(result.folders || []);
    setFiles(result.files || []);
    setLoading(false);
    if (!keepSelected || !(result.files || []).find((f) => f.name === keepSelected?.name)) {
      setSelected(null);
      setPreview('');
    }
  }, [subfolder]);

  useEffect(() => {
    setSelected(null);
    setPreview('');
    refresh(null);
  }, [currentPath]);

  const handleSelectFile = useCallback(async (file) => {
    setSelected(file);
    const content = await window.electronAPI.readLibraryFile(file.fullPath);
    setPreview(content);
  }, []);

  const handleDelete = useCallback(async (file, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${file.name}" from library?`)) return;
    await window.electronAPI.deleteLibraryFile(file.fullPath);
    if (selected?.name === file.name) { setSelected(null); setPreview(''); }
    refresh(null);
  }, [selected, refresh]);

  const navigateTo = (idx) => {
    if (idx < 0) setCurrentPath([]);
    else setCurrentPath(currentPath.slice(0, idx + 1));
  };

  const handleStartNew = () => {
    setCreatingNew(true);
    setNewFileName('');
    setTimeout(() => newFileInputRef.current?.focus(), 0);
  };

  const handleCreateNew = async () => {
    let name = newFileName.trim();
    if (!name) { setCreatingNew(false); return; }
    if (!name.endsWith('.cs') && !name.endsWith('.csx')) name += '.cs';
    const relativePath = subfolder ? `${subfolder}/${name}` : name;
    const result = await window.electronAPI.saveLibraryFile(relativePath, '');
    setCreatingNew(false);
    setNewFileName('');
    if (result?.success) {
      await refresh(null);
      onOpenFile({ name, fullPath: result.fullPath });
    }
  };

  return (
    <div className="library-panel" style={{ width }}>
      <div className="resize-handle resize-h" onMouseDown={onResizeMouseDown} />
      <div className="library-header">
        <span className="library-title">Code Library</span>
        <button onClick={handleStartNew} title="New file">+</button>
        <button onClick={() => window.electronAPI?.openLibraryFolder()} title="Open in Finder/Explorer">&#8862;</button>
        <button onClick={() => refresh(selected)} title="Refresh">&#8635;</button>
        <button onClick={onClose} title="Close">&#215;</button>
      </div>

      {creatingNew && (
        <div className="library-new-row">
          <input
            ref={newFileInputRef}
            className="library-new-input"
            placeholder="filename.cs"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateNew();
              if (e.key === 'Escape') { setCreatingNew(false); setNewFileName(''); }
            }}
          />
          <button className="library-new-confirm" onClick={handleCreateNew}>Create</button>
          <button className="library-new-cancel" onClick={() => { setCreatingNew(false); setNewFileName(''); }}>&#215;</button>
        </div>
      )}

      <div className="library-breadcrumb">
        <span className="library-bc-seg" onClick={() => navigateTo(-1)}>Library</span>
        {currentPath.map((seg, i) => (
          <React.Fragment key={i}>
            <span className="library-bc-sep">/</span>
            <span className="library-bc-seg" onClick={() => navigateTo(i)}>{seg}</span>
          </React.Fragment>
        ))}
      </div>

      <div className="library-files">
        {loading && <div className="library-empty">Loading&hellip;</div>}
        {!loading && folders.length === 0 && files.length === 0 && (
          <div className="library-empty">
            {currentPath.length === 0 ? (
              <>
                <p>No snippets yet.</p>
                <p>Add <code>.cs</code> or <code>.csx</code> files, or subfolders, to your library.</p>
                <button className="library-folder-btn" onClick={() => window.electronAPI?.openLibraryFolder()}>
                  Open Library Folder
                </button>
              </>
            ) : (
              <p>Empty folder.</p>
            )}
          </div>
        )}
        {folders.map((name) => (
          <div key={name} className="library-folder" onClick={() => setCurrentPath([...currentPath, name])}>
            <span className="library-folder-icon">&#9656;</span>
            <span className="library-folder-name">{name}</span>
          </div>
        ))}
        {files.map((f) => (
          <div
            key={f.name}
            className={`library-file${selected?.name === f.name ? ' library-file-selected' : ''}`}
            onClick={() => handleSelectFile(f)}
            onDoubleClick={() => onOpenFile(f)}
          >
            <span className="library-file-name">{f.name}</span>
            <span className="library-file-size">{f.size}</span>
            <button className="library-file-delete" onClick={(e) => handleDelete(f, e)} title="Delete">&#215;</button>
          </div>
        ))}
      </div>

      {selected && (
        <>
        <div className="library-split-handle" onMouseDown={onPreviewResizeMouseDown} />
        <div className="library-preview" style={{ height: previewHeight }}>
          <div className="library-preview-header">
            <span className="library-preview-name">{selected.name}</span>
          </div>
          <div className="library-preview-editor">
            <CodeEditor value={preview} onChange={() => {}} language="csharp" readOnly={true} />
          </div>
          <div className="library-insert-row">
            <button className="library-insert-btn" onClick={() => onInsert(preview)}>
              Insert as Cell
            </button>
            <button
              className="library-insert-btn library-load-btn"
              onClick={() => onInsert(`#load "${selected.fullPath}"`)}
              title="#load directive — Roslyn loads the file from disk"
            >
              #load
            </button>
            <button
              className="library-insert-btn library-edit-btn"
              onClick={() => onOpenFile(selected)}
              title="Open file in editor tab"
            >
              Edit
            </button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
