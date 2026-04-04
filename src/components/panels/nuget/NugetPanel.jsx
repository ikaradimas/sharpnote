import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

// ── NuGet API helpers ─────────────────────────────────────────────────────────

const _serviceIndexCache = {};

async function resolveEndpoints(sourceUrl) {
  if (_serviceIndexCache[sourceUrl] !== undefined) return _serviceIndexCache[sourceUrl];
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(6000) });
    const index = await res.json();
    const find = (prefix) => (index.resources || [])
      .find((r) => typeof r['@type'] === 'string' && r['@type'].startsWith(prefix))?.['@id'] ?? null;
    _serviceIndexCache[sourceUrl] = {
      search: find('SearchQueryService'),
      base:   find('PackageBaseAddress'),
    };
  } catch {
    _serviceIndexCache[sourceUrl] = { search: null, base: null };
  }
  return _serviceIndexCache[sourceUrl];
}

async function searchNuget(sources, query) {
  const enabled = sources.filter((s) => s.enabled);
  const results = [];
  const seen = new Set();
  await Promise.all(enabled.map(async (source) => {
    const { search: searchUrl } = await resolveEndpoints(source.url);
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

async function fetchPackageVersions(sources, packageId) {
  for (const source of sources.filter((s) => s.enabled)) {
    const { base } = await resolveEndpoints(source.url);
    if (!base) continue;
    try {
      const url = `${base.endsWith('/') ? base : base + '/'}${packageId.toLowerCase()}/index.json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (data.versions?.length) return [...data.versions].reverse(); // newest first
    } catch { /* try next source */ }
  }
  return [];
}

// ── Version picker ────────────────────────────────────────────────────────────

function VersionPicker({ packageId, sources, value, onChange }) {
  const [open, setOpen]       = useState(false);
  const [versions, setVersions] = useState(null); // null = not yet fetched
  const [loading, setLoading] = useState(false);
  const [pos, setPos]         = useState({ top: 0, left: 0, width: 130 });
  const btnRef  = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!dropRef.current?.contains(e.target) && !btnRef.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = async () => {
    if (open) { setOpen(false); return; }

    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 130) });
    }
    setOpen(true);

    if (versions === null) {
      setLoading(true);
      try {
        setVersions(await fetchPackageVersions(sources, packageId));
      } catch {
        setVersions([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const select = (v) => { onChange(v); setOpen(false); };

  return (
    <div className="nuget-ver-picker" ref={btnRef}>
      <button className="nuget-ver-picker-btn" onClick={toggle} title={`Version: ${value || 'latest'}`}>
        <span className="nuget-ver-picker-label">{value || 'latest'}</span>
        <span className="nuget-ver-picker-chevron">▾</span>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="nuget-ver-picker-dropdown"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
          {loading
            ? <div className="nuget-ver-picker-loading">Loading versions…</div>
            : <>
                <button className={`nuget-ver-picker-option${!value ? ' nuget-ver-picker-selected' : ''}`}
                  onClick={() => select(null)}>latest</button>
                {(versions || []).map((v) => (
                  <button key={v}
                    className={`nuget-ver-picker-option${v === value ? ' nuget-ver-picker-selected' : ''}`}
                    onClick={() => select(v)}>{v}</button>
                ))}
              </>
          }
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Installed tab ─────────────────────────────────────────────────────────────

function InstalledTab({ packages, kernelStatus, sources, onAdd, onRemove, onRetry, onChangeVersion }) {
  const [newId, setNewId]         = useState('');
  const [newVersion, setNewVersion] = useState('');
  const idRef = useRef(null);
  const isReady = kernelStatus === 'ready';

  const handleAdd = () => {
    const id = newId.trim();
    if (!id) return;
    onAdd(id, newVersion.trim() || null);
    setNewId(''); setNewVersion('');
    idRef.current?.focus();
  };

  return (
    <div className="nuget-tab-content">
      <div className="nuget-list">
        {packages.length === 0 && (
          <div className="panel-empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.3 }}>
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <span className="panel-empty-title">No packages</span>
            <span className="panel-empty-hint">Add one below or browse the NuGet gallery</span>
          </div>
        )}
        {packages.map((pkg) => (
          <div key={pkg.id} className="nuget-item">
            <NugetStatusDot status={pkg.status} error={pkg.error} />
            <span className="nuget-id">{pkg.id}</span>
            <VersionPicker
              packageId={pkg.id}
              sources={sources}
              value={pkg.version}
              onChange={(v) => onChangeVersion(pkg.id, v)}
            />
            {pkg.status === 'error' && (
              <button className="nuget-action-btn" title={`Retry: ${pkg.error || ''}`}
                onClick={() => onRetry(pkg.id, pkg.version)}>↺</button>
            )}
            {pkg.status === 'pending' && isReady && (
              <button className="nuget-action-btn" title="Install now"
                onClick={() => onRetry(pkg.id, pkg.version)}>▶</button>
            )}
            <button className="nuget-remove-btn" title="Remove" onClick={() => onRemove(pkg.id)}>×</button>
          </div>
        ))}
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

// ── Browse tab ────────────────────────────────────────────────────────────────

function BrowseTab({ sources, onAdd, installedPackages }) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  // per-result chosen version (null key = use pkg.version from search)
  const [versionChoices, setVersionChoices] = useState({});

  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true); setSearchError(null); setVersionChoices({});
    try {
      setResults(await searchNuget(sources, q));
    } catch (e) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const isInstalled = (id) => installedPackages.some((p) => p.id.toLowerCase() === id.toLowerCase());

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
          // versionChoices[id] === undefined → use latest from search; null → "latest" (no pin)
          const chosenVersion = Object.hasOwn(versionChoices, pkg.id)
            ? versionChoices[pkg.id]
            : pkg.version;
          return (
            <div key={pkg.id} className="nuget-result-item">
              <div className="nuget-result-main">
                <span className="nuget-result-id">{pkg.id}</span>
                <VersionPicker
                  packageId={pkg.id}
                  sources={sources}
                  value={chosenVersion}
                  onChange={(v) => setVersionChoices((prev) => ({ ...prev, [pkg.id]: v }))}
                />
                {pkg.totalDownloads > 0 && (
                  <span className="nuget-result-dl" title={`${pkg.totalDownloads.toLocaleString()} downloads`}>
                    ↓{formatDownloads(pkg.totalDownloads)}
                  </span>
                )}
                <button
                  className={`nuget-result-add${installed ? ' nuget-result-added' : ''}`}
                  onClick={() => !installed && onAdd(pkg.id, chosenVersion)}
                  title={installed ? 'Already added' : `Add ${pkg.id} ${chosenVersion || 'latest'}`}
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

// ── Sources tab ───────────────────────────────────────────────────────────────

function SourcesTab({ sources, onAdd, onRemove, onToggle }) {
  const [name, setName] = useState('');
  const [url, setUrl]   = useState('');

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

// ── Panel root ────────────────────────────────────────────────────────────────

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
          <InstalledTab packages={packages} kernelStatus={kernelStatus} sources={sources}
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
