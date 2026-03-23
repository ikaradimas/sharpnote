import React, { useState, useRef } from 'react';
import { useResize } from '../../../hooks/useResize.js';

const NUGET_STATUS_ICONS = {
  pending: { icon: '○', cls: 'nuget-dot-pending', title: 'Will load on kernel start' },
  loading: { icon: '⟳', cls: 'nuget-dot-loading', title: 'Loading…' },
  loaded:  { icon: '✓', cls: 'nuget-dot-loaded',  title: 'Loaded' },
  error:   { icon: '✕', cls: 'nuget-dot-error',   title: 'Error' },
};

function NugetStatusDot({ status, error }) {
  const s = NUGET_STATUS_ICONS[status] || NUGET_STATUS_ICONS.pending;
  return <span className={`nuget-dot ${s.cls}`} title={status === 'error' && error ? error : s.title}>{s.icon}</span>;
}

function formatDownloads(n) {
  if (!n) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

const _serviceIndexCache = {};
async function resolveSearchEndpoint(sourceUrl) {
  if (_serviceIndexCache[sourceUrl] !== undefined) return _serviceIndexCache[sourceUrl];
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(6000) });
    const index = await res.json();
    const resource = (index.resources || []).find((r) =>
      typeof r['@type'] === 'string' && r['@type'].startsWith('SearchQueryService')
    );
    _serviceIndexCache[sourceUrl] = resource?.['@id'] ?? null;
  } catch {
    _serviceIndexCache[sourceUrl] = null;
  }
  return _serviceIndexCache[sourceUrl];
}

async function searchNuget(sources, query) {
  const enabled = sources.filter((s) => s.enabled);
  const results = [];
  const seen = new Set();
  await Promise.all(enabled.map(async (source) => {
    const searchUrl = await resolveSearchEndpoint(source.url);
    if (!searchUrl) return;
    try {
      const res = await fetch(
        `${searchUrl}?q=${encodeURIComponent(query)}&take=25&prerelease=false`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      for (const pkg of (data.data || [])) {
        const key = pkg.id.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ id: pkg.id, version: pkg.version, description: pkg.description,
                         totalDownloads: pkg.totalDownloads, source: source.name });
        }
      }
    } catch { /* source unavailable */ }
  }));
  return results;
}

function InstalledTab({ packages, kernelStatus, onAdd, onRemove, onRetry, onChangeVersion }) {
  const [newId, setNewId] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editVersion, setEditVersion] = useState('');
  const idRef = useRef(null);
  const editRef = useRef(null);
  const isReady = kernelStatus === 'ready';

  const handleAdd = () => {
    const id = newId.trim();
    if (!id) return;
    onAdd(id, newVersion.trim() || null);
    setNewId(''); setNewVersion('');
    idRef.current?.focus();
  };

  const startEdit = (pkg) => {
    setEditingId(pkg.id);
    setEditVersion(pkg.version || '');
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const confirmEdit = (pkg) => {
    const v = editVersion.trim() || null;
    if (v !== pkg.version) onChangeVersion(pkg.id, v);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  return (
    <div className="nuget-tab-content">
      <div className="nuget-list">
        {packages.length === 0 && <span className="nuget-empty">No startup packages — add one below or browse</span>}
        {packages.map((pkg) => {
          const isEditing = editingId === pkg.id;
          return (
            <div key={pkg.id} className="nuget-item">
              <NugetStatusDot status={pkg.status} error={pkg.error} />
              <span className="nuget-id">{pkg.id}</span>
              {isEditing ? (
                <>
                  <input
                    ref={editRef}
                    className="nuget-input nuget-ver-edit-input"
                    placeholder="Version (blank = latest)"
                    value={editVersion}
                    onChange={(e) => setEditVersion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmEdit(pkg);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    spellCheck={false}
                  />
                  <button className="nuget-action-btn" title="Confirm" onClick={() => confirmEdit(pkg)}>✓</button>
                  <button className="nuget-action-btn" title="Cancel" onClick={cancelEdit}>✕</button>
                </>
              ) : (
                <>
                  <span className="nuget-version">{pkg.version || 'latest'}</span>
                  <button
                    className="nuget-action-btn nuget-ver-btn"
                    title="Change version"
                    onClick={() => startEdit(pkg)}
                  >✎</button>
                  {pkg.status === 'error' && (
                    <button className="nuget-action-btn" title={`Retry: ${pkg.error || ''}`}
                      onClick={() => onRetry(pkg.id, pkg.version)}>↺</button>
                  )}
                  {pkg.status === 'pending' && isReady && (
                    <button className="nuget-action-btn" title="Install now"
                      onClick={() => onRetry(pkg.id, pkg.version)}>▶</button>
                  )}
                </>
              )}
              <button className="nuget-remove-btn" title="Remove" onClick={() => onRemove(pkg.id)}>×</button>
            </div>
          );
        })}
      </div>
      <div className="nuget-add-row">
        <input ref={idRef} className="nuget-input nuget-id-input" placeholder="Package ID"
          value={newId} onChange={(e) => setNewId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
        <input className="nuget-input nuget-ver-input" placeholder="Version"
          value={newVersion} onChange={(e) => setNewVersion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
        <button className="nuget-add-btn" onClick={handleAdd}>{isReady ? '▶ Install' : '+ Add'}</button>
      </div>
    </div>
  );
}

function BrowseTab({ sources, onAdd, installedPackages }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [versionOverrides, setVersionOverrides] = useState({});

  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true); setSearchError(null); setVersionOverrides({});
    try {
      setResults(await searchNuget(sources, q));
    } catch (e) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const isInstalled = (id) => installedPackages.some((p) => p.id.toLowerCase() === id.toLowerCase());

  const getVersion = (pkg) => versionOverrides[pkg.id] !== undefined ? versionOverrides[pkg.id] : pkg.version;

  return (
    <div className="nuget-tab-content">
      <div className="nuget-search-bar">
        <input className="nuget-input nuget-search-input" placeholder="Search packages…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()} spellCheck={false} />
        <button className="nuget-search-btn" onClick={doSearch} disabled={searching}>
          {searching ? '…' : '⌕'}
        </button>
      </div>
      <div className="nuget-results">
        {searchError && <div className="nuget-search-error">{searchError}</div>}
        {!searchError && results.length === 0 && !searching && (
          <div className="nuget-empty">{query.trim() ? 'No results' : 'Type a package name above and press Enter'}</div>
        )}
        {results.map((pkg) => {
          const installed = isInstalled(pkg.id);
          const ver = getVersion(pkg);
          return (
            <div key={pkg.id} className="nuget-result-item">
              <div className="nuget-result-main">
                <span className="nuget-result-id">{pkg.id}</span>
                <input
                  className="nuget-input nuget-result-ver-input"
                  value={ver}
                  onChange={(e) => setVersionOverrides((prev) => ({ ...prev, [pkg.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && !installed && onAdd(pkg.id, ver || null)}
                  placeholder="version"
                  spellCheck={false}
                  title="Version to install (leave as-is for latest)"
                />
                {pkg.totalDownloads > 0 && (
                  <span className="nuget-result-dl" title={`${pkg.totalDownloads.toLocaleString()} downloads`}>
                    ↓{formatDownloads(pkg.totalDownloads)}
                  </span>
                )}
                <button
                  className={`nuget-result-add${installed ? ' nuget-result-added' : ''}`}
                  onClick={() => !installed && onAdd(pkg.id, ver || null)}
                  title={installed ? 'Already added' : `Add ${pkg.id} ${ver}`}
                >
                  {installed ? '✓' : '+ Add'}
                </button>
              </div>
              {pkg.description && <div className="nuget-result-desc">{pkg.description}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourcesTab({ sources, onAdd, onRemove, onToggle }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) return;
    onAdd(name.trim(), url.trim());
    setName(''); setUrl('');
  };

  return (
    <div className="nuget-tab-content">
      <div className="nuget-sources-list">
        {sources.map((s) => (
          <div key={s.url} className="nuget-source-item">
            <input type="checkbox" className="nuget-source-check" checked={s.enabled}
              onChange={() => onToggle(s.url)} />
            <span className="nuget-source-name">{s.name}</span>
            <span className="nuget-source-url">{s.url}</span>
            <button className="nuget-remove-btn" title="Remove source" onClick={() => onRemove(s.url)}>×</button>
          </div>
        ))}
      </div>
      <div className="nuget-add-row">
        <input className="nuget-input" style={{ width: 90 }} placeholder="Name"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
        <input className="nuget-input" style={{ flex: 1 }} placeholder="Feed URL (v3 index.json)"
          value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
        <button className="nuget-add-btn" onClick={handleAdd}>+ Add</button>
      </div>
    </div>
  );
}

export function NugetPanel({ isOpen, onToggle, packages, kernelStatus, sources,
                      onAdd, onRemove, onRetry, onChangeVersion,
                      onAddSource, onRemoveSource, onToggleSource }) {
  const [height, onResizeMouseDown] = useResize(260, 'top');
  const [tab, setTab] = useState('installed');
  if (!isOpen) return null;

  return (
    <div className="nuget-panel" style={{ height }}>
      <div className="resize-handle resize-v" onMouseDown={onResizeMouseDown} />
      <div className="nuget-panel-header">
        <div className="nuget-tabs">
          {['installed', 'browse'].map((t) => (
            <button key={t} className={`nuget-tab${tab === t ? ' nuget-tab-active' : ''}`}
              onClick={() => setTab(t)}>
              {t === 'installed' ? 'Installed' : 'Browse'}
            </button>
          ))}
        </div>
        <div className="nuget-kernel-badge" style={{ color: kernelStatus === 'ready' ? '#4ec9b0' : '#888' }}>
          kernel {kernelStatus}
        </div>
        <button
          className={`nuget-sources-btn${tab === 'sources' ? ' nuget-sources-btn-active' : ''}`}
          onClick={() => setTab((prev) => prev === 'sources' ? 'installed' : 'sources')}
          title="Configure NuGet sources"
        >⚙</button>
        <button className="nuget-close-btn" onClick={onToggle} title="Close">×</button>
      </div>
      <div className="nuget-body">
        {tab === 'installed' && (
          <InstalledTab packages={packages} kernelStatus={kernelStatus}
            onAdd={onAdd} onRemove={onRemove} onRetry={onRetry} onChangeVersion={onChangeVersion} />
        )}
        {tab === 'browse' && (
          <BrowseTab sources={sources} onAdd={onAdd} installedPackages={packages} />
        )}
        {tab === 'sources' && (
          <SourcesTab sources={sources}
            onAdd={onAddSource} onRemove={onRemoveSource} onToggle={onToggleSource} />
        )}
      </div>
    </div>
  );
}
