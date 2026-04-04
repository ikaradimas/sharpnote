import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { formatFileSize } from '../../utils.js';
import { IconFolderSvg, IconFileSvg } from '../toolbar/Icons.jsx';

function formatFileMtime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const diffDays = (now - d) / 86400000;
  if (diffDays < 1) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 365) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function folderLabel(path) {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  return normalized.split('/').filter(Boolean).pop() || path;
}

export function FilesPanel({ currentDir, onNavigate, onOpenNotebook, notebookDir,
                             favoriteFolders = [], onToggleFavorite }) {
  const [entries, setEntries]           = useState([]);
  const [parentDir, setParentDir]       = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [selected, setSelected]         = useState(null);
  const [renaming, setRenaming]         = useState(null);
  const [renameDraft, setRenameDraft]   = useState('');
  const [creating, setCreating]         = useState(false);
  const [createDraft, setCreateDraft]   = useState('');
  const [favsCollapsed, setFavsCollapsed] = useState(false);
  const renameRef    = useRef(null);
  const createRef    = useRef(null);

  const loadDir = useCallback(async (dir) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setRenaming(null);
    setCreating(false);
    const result = await window.electronAPI.fsReaddir(dir);
    setLoading(false);
    if (result.success) {
      setEntries(result.entries);
      setParentDir(result.parentDir);
      onNavigate(result.dirPath);
    } else {
      setError(result.error);
    }
  }, [onNavigate]);

  // Initial load
  useEffect(() => {
    if (currentDir) {
      loadDir(currentDir);
    } else {
      window.electronAPI.fsGetHome().then((home) => loadDir(home));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus rename input when it appears
  useEffect(() => {
    if (renaming && renameRef.current) renameRef.current.focus();
  }, [renaming]);

  useEffect(() => {
    if (creating && createRef.current) createRef.current.focus();
  }, [creating]);

  const refresh = () => currentDir && loadDir(currentDir);

  const handleOpen = (entry) => {
    if (!currentDir) return;
    const full = currentDir.replace(/\/?$/, '/') + entry.name;
    if (entry.isDirectory) {
      loadDir(full);
    } else if (entry.name.endsWith('.cnb')) {
      onOpenNotebook(full);
    } else {
      window.electronAPI.fsOpenPath(full);
    }
  };

  const startRename = (entry) => {
    setRenaming(entry.name);
    setRenameDraft(entry.name);
  };

  const commitRename = async () => {
    if (!renaming || !currentDir) { setRenaming(null); return; }
    const draft = renameDraft.trim();
    if (draft && draft !== renaming) {
      const oldPath = currentDir.replace(/\/?$/, '/') + renaming;
      const newPath = currentDir.replace(/\/?$/, '/') + draft;
      await window.electronAPI.fsRename(oldPath, newPath);
      refresh();
    }
    setRenaming(null);
  };

  const handleDelete = async (entry) => {
    if (!currentDir) return;
    const full = currentDir.replace(/\/?$/, '/') + entry.name;
    await window.electronAPI.fsDelete(full);
    refresh();
  };

  const commitCreate = async () => {
    const name = createDraft.trim();
    if (name && currentDir) {
      const full = currentDir.replace(/\/?$/, '/') + name;
      await window.electronAPI.fsMkdir(full);
      refresh();
    }
    setCreating(false);
    setCreateDraft('');
  };

  const isFavorite = currentDir && favoriteFolders.includes(currentDir);

  const crumbs = useMemo(() => {
    if (!currentDir) return [];
    const normalized = currentDir.replace(/\\/g, '/');
    const isAbsolute = normalized.startsWith('/');
    const parts = normalized.split('/').filter(Boolean);
    const result = isAbsolute ? [{ label: '/', path: '/' }] : [];
    parts.forEach((seg, i) => {
      result.push({
        label: seg,
        path: (isAbsolute ? '/' : '') + parts.slice(0, i + 1).join('/'),
      });
    });
    return result;
  }, [currentDir]);

  return (
    <div className="files-panel"
      onKeyDown={(e) => {
        if (e.key === 'F2' && selected && !renaming) {
          const entry = entries.find((en) => en.name === selected);
          if (entry) startRename(entry);
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !renaming && !creating) {
          e.preventDefault();
          const entry = entries.find((en) => en.name === selected);
          if (entry) handleDelete(entry);
        }
        if (e.key === 'Enter' && selected && !renaming && !creating) {
          const entry = entries.find((en) => en.name === selected);
          if (entry) handleOpen(entry);
        }
      }}
      tabIndex={-1}
    >
      {/* Header: breadcrumb + actions */}
      <div className="files-header">
        <button className="files-up-btn" onClick={() => parentDir && loadDir(parentDir)}
                disabled={!parentDir} title="Go up">↑</button>
        <div className="files-breadcrumb">
          {crumbs.map((c, i) => (
            <span key={c.path}>
              {i > 0 && <span className="files-crumb-sep">/</span>}
              <span className="files-crumb" onClick={() => loadDir(c.path)} title={c.path}>{c.label}</span>
            </span>
          ))}
        </div>
        {notebookDir && (
          <button className="files-up-btn" onClick={() => loadDir(notebookDir)}
                  title="Go to current notebook's folder">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="6" cy="6" r="3.5"/>
              <line x1="6" y1="1" x2="6" y2="2.5"/>
              <line x1="6" y1="9.5" x2="6" y2="11"/>
              <line x1="1" y1="6" x2="2.5" y2="6"/>
              <line x1="9.5" y1="6" x2="11" y2="6"/>
            </svg>
          </button>
        )}
        {onToggleFavorite && currentDir && (
          <button
            className={`files-fav-btn${isFavorite ? ' active' : ''}`}
            onClick={() => onToggleFavorite(currentDir)}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >★</button>
        )}
        <button className="files-new-folder-btn" onClick={() => { setCreating(true); setCreateDraft(''); }}
                title="New folder">+</button>
        <button className="files-refresh-btn" onClick={refresh} title="Refresh">↺</button>
      </div>

      {/* Favorites sub-panel */}
      {favoriteFolders.length > 0 && (
        <div className="files-favorites">
          <div className="files-favorites-header" onClick={() => setFavsCollapsed((v) => !v)}>
            <span className="files-favorites-arrow">{favsCollapsed ? '▸' : '▾'}</span>
            <span className="files-favorites-title">Favorites</span>
          </div>
          {!favsCollapsed && (
            <div className="files-favorites-list">
              {favoriteFolders.map((path) => (
                <div
                  key={path}
                  className={`files-fav-entry${currentDir === path ? ' files-fav-active' : ''}`}
                  onClick={() => loadDir(path)}
                  title={path}
                >
                  <span className="files-icon"><IconFolderSvg /></span>
                  <span className="files-fav-label">{folderLabel(path)}</span>
                  <button
                    className="files-fav-remove"
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(path); }}
                    title="Remove from favorites"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File list */}
      <div className="files-list">
        {loading && <div className="files-empty">Loading…</div>}
        {error   && <div className="files-error">{error}</div>}

        {/* New folder input row */}
        {creating && (
          <div className="files-entry files-entry-creating">
            <span className="files-icon"><IconFolderSvg /></span>
            <input
              ref={createRef}
              className="files-rename-input"
              value={createDraft}
              onChange={(e) => setCreateDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate();
                if (e.key === 'Escape') { setCreating(false); setCreateDraft(''); }
                e.stopPropagation();
              }}
              onBlur={commitCreate}
              placeholder="folder name"
            />
          </div>
        )}

        {!loading && !error && entries.map((entry) => (
          <div
            key={entry.name}
            className={`files-entry${selected === entry.name ? ' files-selected' : ''}${entry.unreadable ? ' files-unreadable' : ''}`}
            onClick={() => setSelected(entry.name)}
            onDoubleClick={() => handleOpen(entry)}
          >
            <span className="files-icon">
              {entry.isDirectory ? <IconFolderSvg /> : <IconFileSvg isNotebook={entry.name.endsWith('.cnb')} />}
            </span>

            {renaming === entry.name ? (
              <input
                ref={renameRef}
                className="files-rename-input"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(null);
                  e.stopPropagation();
                }}
                onBlur={commitRename}
              />
            ) : (
              <span className={`files-name${entry.name.endsWith('.cnb') ? ' files-name-nb' : ''}`}
                    title={entry.name}>
                {entry.name}
              </span>
            )}

            {renaming !== entry.name && (
              <span className="files-meta">
                {!entry.isDirectory && <span className="files-size">{formatFileSize(entry.size)}</span>}
                <span className="files-mtime">{formatFileMtime(entry.mtime)}</span>
              </span>
            )}

            {renaming !== entry.name && (
              <span className="files-actions">
                <button className="files-action-btn" title="Rename"
                        onClick={(e) => { e.stopPropagation(); startRename(entry); }}>✎</button>
                <button className="files-action-btn files-action-delete" title="Move to Trash"
                        onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}>✕</button>
              </span>
            )}
          </div>
        ))}

        {!loading && !error && entries.length === 0 && !creating && (
          <div className="files-empty">Empty folder</div>
        )}
      </div>
    </div>
  );
}
