import React, { useEffect, useState } from 'react';

export function AboutDialog({ onClose }) {
  const [version, setVersion] = useState('…');

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then((v) => setVersion(v));
  }, []);

  return (
    <div className="quit-overlay" onClick={onClose}>
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="about-dialog-header">
          <span className="about-dialog-name">SharpNote</span>
          <span className="about-dialog-version">v{version}</span>
        </div>
        <div className="about-dialog-body">
          <p className="about-dialog-desc">
            Interactive C# notebook with multi-tab MDI, NuGet integration,
            database connections, and Chart.js visualisations — powered by
            Roslyn scripting.
          </p>
          <div className="about-dialog-stack">
            <span className="about-dialog-pill">Electron</span>
            <span className="about-dialog-pill">React 18</span>
            <span className="about-dialog-pill">.NET 8 · Roslyn</span>
            <span className="about-dialog-pill">CodeMirror 6</span>
            <span className="about-dialog-pill">Chart.js</span>
          </div>
        </div>
        <div className="quit-dialog-actions">
          <button className="quit-btn quit-btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
