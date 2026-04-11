import React, { useState, useEffect, useRef } from 'react';
import { THEMES } from '../../config/themes.js';

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_DEFAULT = 12.6;

const PANEL_FONT_SIZE_MIN = 8;
const PANEL_FONT_SIZE_MAX = 18;
const PANEL_FONT_SIZE_DEFAULT = 11.5;

// ── Appearance section ────────────────────────────────────────────────────────

function AppearanceSection({ theme, fontSize, onThemeChange, onFontSizeChange, panelFontSize, onPanelFontSizeChange, lineAltEnabled, onLineAltChange, lintEnabled, onLintEnabledChange, strongCuesEnabled, onStrongCuesChange, formatOnSave, onFormatOnSaveChange, showFish, onShowFishChange, showMinigame, onShowMinigameChange, showGhost, onShowGhostChange, showSkyline, onShowSkylineChange, tablePageSize = 10, onTablePageSizeChange }) {
  return (
    <div className="settings-section">
      <div className="settings-group">
        <div className="settings-group-label">Editor Font Size</div>
        <div className="settings-font-row">
          <input
            type="range"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step="0.2"
            value={fontSize}
            onChange={(e) => onFontSizeChange(parseFloat(e.target.value))}
            className="settings-font-slider"
          />
          <span className="settings-font-value">{Number(fontSize).toFixed(1)} px</span>
          <button
            className="settings-reset-btn"
            onClick={() => onFontSizeChange(FONT_SIZE_DEFAULT)}
            title="Reset to default"
          >
            Reset
          </button>
        </div>
        <div className="settings-font-preview" style={{ fontSize: `${fontSize}px` }}>
          The quick brown fox
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Panel Font Size</div>
        <div className="settings-font-row">
          <input
            type="range"
            min={PANEL_FONT_SIZE_MIN}
            max={PANEL_FONT_SIZE_MAX}
            step="0.5"
            value={panelFontSize}
            onChange={(e) => onPanelFontSizeChange(parseFloat(e.target.value))}
            className="settings-font-slider"
          />
          <span className="settings-font-value">{Number(panelFontSize).toFixed(1)} px</span>
          <button
            className="settings-reset-btn"
            onClick={() => onPanelFontSizeChange(PANEL_FONT_SIZE_DEFAULT)}
            title="Reset to default"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Code Editor</div>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!!lineAltEnabled}
            onChange={(e) => onLineAltChange(e.target.checked)}
          />
          <span>Alternating row colors</span>
        </label>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!!lintEnabled}
            onChange={(e) => onLintEnabledChange(e.target.checked)}
          />
          <span>Code diagnostics (shows errors and warnings while typing)</span>
        </label>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!!strongCuesEnabled}
            onChange={(e) => onStrongCuesChange(e.target.checked)}
          />
          <span>Stronger visual cues (higher contrast borders, accents, and status indicators)</span>
        </label>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!!formatOnSave}
            onChange={(e) => onFormatOnSaveChange(e.target.checked)}
          />
          <span>Format and check code on save (reformats C# cells and reports errors)</span>
        </label>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Fun</div>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!!showFish}
            onChange={(e) => onShowFishChange(e.target.checked)}
          />
          <span>Status bar fish (animated fish in the bottom bar)</span>
        </label>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!!showMinigame}
            onChange={(e) => onShowMinigameChange(e.target.checked)}
          />
          <span>Empty notebook minigame (breakout game when no cells exist)</span>
        </label>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!!showGhost}
            onChange={(e) => onShowGhostChange(e.target.checked)}
          />
          <span>Ghost companion (friendly ghost that appears near your cursor)</span>
        </label>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!!showSkyline}
            onChange={(e) => onShowSkylineChange(e.target.checked)}
          />
          <span>Idle skyline (futuristic city builds when you're away)</span>
        </label>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Tables</div>
        <div className="settings-font-row">
          <span className="settings-path-label">Default page size</span>
          <select
            className="api-auth-type"
            value={tablePageSize}
            onChange={(e) => onTablePageSizeChange?.(Number(e.target.value))}
          >
            <option value={10}>10 rows</option>
            <option value={20}>20 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Theme</div>
        <div className="settings-theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`settings-theme-tile${theme === t.id ? ' active' : ''}`}
              onClick={() => onThemeChange(t.id)}
              title={t.name}
            >
              <div className="settings-theme-swatches">
                {t.swatches.map((color, i) => (
                  <div key={i} className="settings-theme-swatch" style={{ background: color }} />
                ))}
              </div>
              <span className="settings-theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Paths section ─────────────────────────────────────────────────────────────

function PathRow({ label, description, value }) {
  const handleOpen = () => value && window.electronAPI?.fsOpenPath(value);
  return (
    <div className="settings-path-row">
      <div className="settings-path-meta">
        <span className="settings-path-label">{label}</span>
        {description && <span className="settings-path-desc">{description}</span>}
      </div>
      <div className="settings-path-value-row">
        <span className="settings-path-text">{value || '—'}</span>
        {value && (
          <button className="settings-path-open-btn" onClick={handleOpen} title="Open in Finder / Explorer">
            ↗
          </button>
        )}
      </div>
    </div>
  );
}

function PathsSection({ paths }) {
  return (
    <div className="settings-section">
      <div className="settings-group">
        <div className="settings-group-label">Directories</div>
        <PathRow
          label="Code Library"
          description="Shared .cs / .csx snippets, accessible from the Library panel"
          value={paths?.library}
        />
        <PathRow
          label="User Data"
          description="Settings, saved connections, and API configurations"
          value={paths?.userData}
        />
        <PathRow
          label="Logs"
          description="Daily log files written by the app and kernels"
          value={paths?.logs}
        />
        <PathRow
          label="Documents"
          description="Base documents directory used for the Library folder"
          value={paths?.documents}
        />
      </div>
    </div>
  );
}

// ── Startup section ───────────────────────────────────────────────────────────

function StartupSection({ pinnedPaths, onUnpin }) {
  const paths = [...(pinnedPaths || [])];

  return (
    <div className="settings-section">
      <div className="settings-group">
        <div className="settings-group-label">Pinned Notebooks</div>
        <p className="settings-group-desc">
          Pinned notebooks reopen automatically when SharpNote starts. Pin or unpin a notebook by right-clicking its tab.
        </p>
        {paths.length === 0 ? (
          <div className="settings-empty-state">No notebooks pinned yet.</div>
        ) : (
          <div className="settings-pinned-list">
            {paths.map((p) => {
              const name = p.split(/[\\/]/).pop().replace(/\.cnb$/, '');
              return (
                <div key={p} className="settings-pinned-item">
                  <div className="settings-pinned-item-info">
                    <span className="settings-pinned-name">{name}</span>
                    <span className="settings-pinned-path">{p}</span>
                  </div>
                  <button
                    className="settings-pinned-unpin"
                    onClick={() => onUnpin(p)}
                    title="Unpin this notebook"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Keyboard shortcuts section ────────────────────────────────────────────────

const SHORTCUTS = [
  { group: 'Notebook', items: [
    { id: 'nb-new',     keys: 'Ctrl+N',           desc: 'New notebook' },
    { id: 'nb-open',    keys: 'Ctrl+O',           desc: 'Open notebook' },
    { id: 'nb-save',    keys: 'Ctrl+S',           desc: 'Save' },
    { id: 'nb-save-as', keys: 'Ctrl+Shift+S',     desc: 'Save as…' },
    { id: 'nb-run-all', keys: 'Ctrl+Shift+Return', desc: 'Run all cells' },
  ]},
  { group: 'Cell', items: [
    { keys: 'Ctrl+Enter', desc: 'Run cell' },
    { keys: 'Ctrl+=',     desc: 'Increase font size' },
    { keys: 'Ctrl+-',     desc: 'Decrease font size' },
    { keys: 'Ctrl+0',     desc: 'Reset font size' },
  ]},
  { group: 'Panels', items: [
    { id: 'panel-config',   keys: 'Ctrl+Shift+,', desc: 'Config panel' },
    { id: 'panel-packages', keys: 'Ctrl+Shift+P', desc: 'Packages panel' },
    { id: 'panel-logs',     keys: 'Ctrl+Shift+G', desc: 'Logs panel' },
    { id: 'panel-db',       keys: 'Ctrl+Shift+D', desc: 'Database panel' },
    { id: 'panel-vars',     keys: 'Ctrl+Shift+V', desc: 'Variables panel' },
    { id: 'panel-toc',      keys: 'Ctrl+Shift+T', desc: 'Table of Contents' },
    { id: 'panel-library',  keys: 'Ctrl+Shift+L', desc: 'Library panel' },
    { id: 'panel-files',    keys: 'Ctrl+Shift+E', desc: 'File Explorer' },
    { id: 'panel-api',      keys: 'Ctrl+Shift+A', desc: 'API Browser' },
    { id: 'panel-graph',    keys: 'Ctrl+Shift+R', desc: 'Graph panel' },
    { id: 'panel-todo',     keys: 'Ctrl+Shift+O', desc: 'To Do panel' },
  ]},
  { group: 'App', items: [
    { id: 'app-palette',  keys: 'Ctrl+K', desc: 'Command palette' },
    { id: 'app-settings', keys: 'Ctrl+,', desc: 'Settings' },
    { id: 'app-docs',     keys: 'F1',     desc: 'Documentation' },
  ]},
];

function formatKeyEvent(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey)   parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) parts.push(key);
  return parts.join('+');
}

function KeysDisplay({ keys }) {
  const parts = keys.split('+');
  return (
    <span className="shortcut-keys">
      {parts.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="shortcut-plus">+</span>}
          <kbd className="shortcut-kbd">{k}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

function ShortcutsSection({ customShortcuts = {}, onShortcutsChange }) {
  const [query, setQuery] = useState('');
  const [capturing, setCapturing] = useState(null); // shortcut id being captured

  const allItems = SHORTCUTS.flatMap(({ group, items }) => items.map((item) => ({ ...item, group })));
  const filtered = query.trim()
    ? allItems.filter((item) => item.desc.toLowerCase().includes(query.toLowerCase()))
    : null;

  const handleCaptureKeyDown = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { setCapturing(null); return; }
    const combo = formatKeyEvent(e);
    if (!combo || combo === 'Ctrl' || combo === 'Shift' || combo === 'Alt') return;
    onShortcutsChange?.(id, combo);
    setCapturing(null);
  };

  const renderItem = ({ id, keys, desc }) => {
    const displayKeys = id ? (customShortcuts[id] ?? keys) : keys;
    const isCustom = id && customShortcuts[id];
    const isCap = capturing === id;
    return (
      <div key={id ?? desc} className="shortcut-row">
        {isCap ? (
          <span
            className="shortcut-capture"
            tabIndex={0}
            autoFocus
            onKeyDown={(e) => handleCaptureKeyDown(e, id)}
            onBlur={() => setCapturing(null)}
          >
            Press a key combination…
          </span>
        ) : (
          <KeysDisplay keys={displayKeys} />
        )}
        <span className="shortcut-desc">{desc}</span>
        {id && !isCap && (
          <div className="shortcut-actions">
            <button
              className="shortcut-edit-btn"
              title="Reassign shortcut"
              onClick={() => setCapturing(id)}
            >
              ✎
            </button>
            {isCustom && (
              <button
                className="shortcut-reset-btn"
                title="Reset to default"
                onClick={() => onShortcutsChange?.(id, null)}
              >
                ↺
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="settings-section">
      <div className="settings-group">
        <input
          className="shortcuts-search"
          placeholder="Search shortcuts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      </div>
      {filtered ? (
        filtered.length === 0 ? (
          <div className="shortcuts-empty">No shortcuts found</div>
        ) : (
          <div className="settings-group">
            <div className="shortcuts-table">{filtered.map(renderItem)}</div>
          </div>
        )
      ) : (
        SHORTCUTS.map(({ group, items }) => (
          <div key={group} className="settings-group">
            <div className="settings-group-label">{group}</div>
            <div className="shortcuts-table">{items.map(renderItem)}</div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Settings dialog ───────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'shortcuts',  label: 'Shortcuts' },
  { id: 'paths',      label: 'Paths' },
  { id: 'startup',    label: 'Startup' },
];

export function SettingsDialog({
  theme,
  fontSize,
  onThemeChange,
  onFontSizeChange,
  panelFontSize,
  onPanelFontSizeChange,
  lineAltEnabled,
  onLineAltChange,
  lintEnabled,
  onLintEnabledChange,
  strongCuesEnabled,
  onStrongCuesChange,
  formatOnSave,
  onFormatOnSaveChange,
  showFish,
  onShowFishChange,
  showMinigame,
  onShowMinigameChange,
  showGhost,
  onShowGhostChange,
  showSkyline,
  onShowSkylineChange,
  tablePageSize = 10,
  onTablePageSizeChange,
  customShortcuts,
  onShortcutsChange,
  pinnedPaths,
  onUnpin,
  onExport,
  onImport,
  onExportDb,
  onImportDb,
  onClose,
}) {
  const [activeSection, setActiveSection] = useState('appearance');
  const [paths, setPaths] = useState(null);
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message }
  const statusTimerRef = useRef(null);

  useEffect(() => {
    window.electronAPI?.getAppPaths().then(setPaths).catch(() => {});
  }, []);

  const showStatus = (type, message) => {
    clearTimeout(statusTimerRef.current);
    setStatus({ type, message });
    statusTimerRef.current = setTimeout(() => setStatus(null), 3000);
  };

  const handleExport = async () => {
    const result = await onExport?.();
    if (result?.success) showStatus('success', 'Settings exported.');
    else if (result?.error) showStatus('error', result.error);
  };

  const handleImport = async () => {
    const result = await onImport?.();
    if (result?.success) showStatus('success', 'Settings imported.');
    else if (result?.error) showStatus('error', result.error);
  };

  const handleExportDb = async () => {
    const result = await onExportDb?.();
    if (result?.success) showStatus('success', 'DB connections exported (unencrypted).');
    else if (result?.error) showStatus('error', result.error);
  };

  const handleImportDb = async () => {
    const result = await onImportDb?.();
    if (result?.success) showStatus('success', 'DB connections imported.');
    else if (result?.error) showStatus('error', result.error);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const sectionLabel = SECTIONS.find((s) => s.id === activeSection)?.label ?? '';

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="settings-dialog">
        <div className="settings-dialog-sidebar">
          <div className="settings-dialog-sidebar-title">Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`settings-section-btn${activeSection === s.id ? ' active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
          <div className="settings-sidebar-footer">
            {status && (
              <div className={`settings-status settings-status-${status.type}`}>
                {status.message}
              </div>
            )}
            <button className="settings-io-btn" onClick={handleExport} title="Export all settings to a JSON file">
              Export Settings…
            </button>
            <button className="settings-io-btn" onClick={handleImport} title="Import settings from a JSON file">
              Import Settings…
            </button>
            <button className="settings-io-btn" onClick={handleExportDb} title="Export database connections as unencrypted JSON">
              Export DB Connections…
            </button>
            <button className="settings-io-btn" onClick={handleImportDb} title="Import database connections from a JSON file">
              Import DB Connections…
            </button>
          </div>
        </div>
        <div className="settings-dialog-main">
          <div className="settings-dialog-header">
            <span className="settings-dialog-section-title">{sectionLabel}</span>
            <button className="settings-close-btn" onClick={onClose} title="Close">✕</button>
          </div>
          <div className="settings-dialog-body">
            {activeSection === 'appearance' && (
              <AppearanceSection
                theme={theme}
                fontSize={fontSize}
                onThemeChange={onThemeChange}
                onFontSizeChange={onFontSizeChange}
                panelFontSize={panelFontSize}
                onPanelFontSizeChange={onPanelFontSizeChange}
                lineAltEnabled={lineAltEnabled}
                onLineAltChange={onLineAltChange}
                lintEnabled={lintEnabled}
                onLintEnabledChange={onLintEnabledChange}
                strongCuesEnabled={strongCuesEnabled}
                onStrongCuesChange={onStrongCuesChange}
                formatOnSave={formatOnSave}
                onFormatOnSaveChange={onFormatOnSaveChange}
                showFish={showFish}
                onShowFishChange={onShowFishChange}
                showMinigame={showMinigame}
                onShowMinigameChange={onShowMinigameChange}
                showGhost={showGhost}
                onShowGhostChange={onShowGhostChange}
                showSkyline={showSkyline}
                onShowSkylineChange={onShowSkylineChange}
                tablePageSize={tablePageSize}
                onTablePageSizeChange={onTablePageSizeChange}
              />
            )}
            {activeSection === 'shortcuts' && (
              <ShortcutsSection customShortcuts={customShortcuts} onShortcutsChange={onShortcutsChange} />
            )}
            {activeSection === 'paths' && (
              <PathsSection paths={paths} />
            )}
            {activeSection === 'startup' && (
              <StartupSection pinnedPaths={pinnedPaths} onUnpin={onUnpin} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
