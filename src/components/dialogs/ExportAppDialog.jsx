import React, { useState, useEffect } from 'react';

export function ExportAppDialog({ notebookTitle, onExport, onClose }) {
  const [appName, setAppName] = useState(notebookTitle || 'My Notebook');
  const [info, setInfo] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    window.electronAPI?.getExportAppInfo?.().then(setInfo);
  }, []);

  const platformLabel = info
    ? `${info.platform === 'darwin' ? 'macOS' : info.platform === 'win32' ? 'Windows' : info.platform} ${info.arch}`
    : 'detecting...';

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await onExport(appName);
      if (res?.success) {
        setResult(res.filePath);
      } else {
        setError(res?.error || 'Export failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-app-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="export-app-dialog">
        <div className="export-app-header">
          <span className="export-app-title">Export as App</span>
          <span className="export-app-beta">BETA</span>
          <button className="settings-close-btn" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="export-app-body">
          {!result ? (
            <>
              <div className="export-app-field">
                <label className="export-app-label">App Name</label>
                <input
                  className="export-app-input"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  spellCheck={false}
                  disabled={exporting}
                />
              </div>
              <div className="export-app-info">
                <div className="export-app-info-row">
                  <span className="export-app-info-label">Platform</span>
                  <span className="export-app-info-value">{platformLabel}</span>
                </div>
                <div className="export-app-info-row">
                  <span className="export-app-info-label">Estimated size</span>
                  <span className="export-app-info-value">~350 MB</span>
                </div>
              </div>
              {!info?.isPackaged && (
                <div className="export-app-warning">
                  Export as App is only available in the packaged version of SharpNote.
                </div>
              )}
              {error && <div className="export-app-error">{error}</div>}
              <div className="export-app-actions">
                <button className="kafka-btn" onClick={onClose} disabled={exporting}>Cancel</button>
                <button
                  className="kafka-btn kafka-btn-primary"
                  onClick={handleExport}
                  disabled={exporting || !appName.trim() || !info?.isPackaged}
                >
                  {exporting ? 'Exporting...' : 'Export'}
                </button>
              </div>
            </>
          ) : (
            <div className="export-app-success">
              <div className="export-app-success-icon">&#x2713;</div>
              <div className="export-app-success-text">App exported successfully</div>
              <div className="export-app-success-path">{result}</div>
              <div className="export-app-actions">
                <button className="kafka-btn" onClick={() => window.electronAPI?.fsOpenPath?.(result)}>
                  Show in Finder
                </button>
                <button className="kafka-btn kafka-btn-primary" onClick={onClose}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
