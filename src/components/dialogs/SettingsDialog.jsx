import React, { useState, useEffect } from 'react';
import { THEMES } from '../../config/themes.js';

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_DEFAULT = 12.6;

// ── Appearance section ────────────────────────────────────────────────────────

function AppearanceSection({ theme, fontSize, onThemeChange, onFontSizeChange }) {
  return (
    <div className="settings-section">
      <div className="settings-group">
        <div className="settings-group-label">Font Size</div>
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

// ── Settings dialog ───────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'paths',      label: 'Paths' },
  { id: 'startup',    label: 'Startup' },
];

export function SettingsDialog({
  theme,
  fontSize,
  onThemeChange,
  onFontSizeChange,
  pinnedPaths,
  onUnpin,
  onClose,
}) {
  const [activeSection, setActiveSection] = useState('appearance');
  const [paths, setPaths] = useState(null);

  useEffect(() => {
    window.electronAPI?.getAppPaths().then(setPaths).catch(() => {});
  }, []);

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
              />
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
