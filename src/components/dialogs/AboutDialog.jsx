import React, { useEffect, useState } from 'react';

const STACK = [
  { label: 'Electron',      href: null },
  { label: 'React 18',      href: null },
  { label: '.NET 10',       href: null },
  { label: 'Roslyn',        href: null },
  { label: 'CodeMirror 6',  href: null },
  { label: 'Chart.js',      href: null },
  { label: 'Mermaid',       href: null },
  { label: 'KaTeX',         href: null },
];

export function AboutDialog({ onClose }) {
  const [version, setVersion] = useState('…');

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then((v) => setVersion(v));
  }, []);

  return (
    <div className="quit-overlay" onClick={onClose}>
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>

        <div className="about-header">
          <img className="about-logo" src="assets/icon.png" alt="SharpNote" />
          <div className="about-title-group">
            <span className="about-name">SharpNote</span>
            <span className="about-version">v{version}</span>
          </div>
        </div>

        <div className="about-body">
          <p className="about-desc">
            Interactive C# notebook with multi-tab MDI, NuGet integration,
            database connections, and Chart.js visualisations — powered by
            Roslyn scripting.
          </p>

          <div className="about-section-label">Built with</div>
          <div className="about-stack">
            {STACK.map(({ label }) => (
              <span key={label} className="about-pill">{label}</span>
            ))}
          </div>
        </div>

        <div className="quit-dialog-actions">
          <button className="quit-btn quit-btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
