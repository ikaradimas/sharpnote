import React, { useState, useEffect } from 'react';

export function ExportAppDialog({ notebookTitle, onExport, onClose }) {
  const [appName, setAppName] = useState(notebookTitle || 'My Notebook');
  const [outputDir, setOutputDir] = useState('');
  const [info, setInfo] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [stripSecrets, setStripSecrets] = useState(false);

  useEffect(() => {
    window.electronAPI?.getExportAppInfo?.().then((data) => {
      setInfo(data);
      if (data?.defaultOutputDir) setOutputDir(data.defaultOutputDir);
    });
  }, []);

  const platformLabel = info
    ? `${info.platform === 'darwin' ? 'macOS' : info.platform === 'win32' ? 'Windows' : info.platform} ${info.arch}`
    : 'detecting...';

  const ext = info?.platform === 'darwin' ? '.app' : '';
  const targetPath = outputDir && appName.trim()
    ? `${outputDir}/${appName.trim().replace(/[^a-zA-Z0-9 _-]/g, '')}${ext}`
    : '';

  const handleBrowse = async () => {
    const picked = await window.electronAPI?.pickOutputDir?.();
    if (picked) setOutputDir(picked);
  };

  const handleExport = async () => {
    if (usePassphrase && passphrase !== passphraseConfirm) { setError('Passphrases don\'t match'); return; }
    if (usePassphrase && passphrase.length < 4) { setError('Passphrase must be at least 4 characters'); return; }
    setExporting(true);
    setError(null);
    try {
      const res = await onExport(appName, outputDir, usePassphrase ? passphrase : null, stripSecrets);
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
              <div className="export-app-field">
                <label className="export-app-label">Output Folder</label>
                <div className="export-app-path-row">
                  <input
                    className="export-app-input export-app-path-input"
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    spellCheck={false}
                    disabled={exporting}
                    placeholder="Select a folder..."
                  />
                  <button className="kafka-btn" onClick={handleBrowse} disabled={exporting}>Browse</button>
                </div>
              </div>
              <div className="export-app-field">
                <label className="export-app-checkbox">
                  <input type="checkbox" checked={usePassphrase} onChange={(e) => setUsePassphrase(e.target.checked)} disabled={exporting} />
                  <span>Protect with passphrase</span>
                </label>
                {usePassphrase && (
                  <div className="export-app-passphrase-fields">
                    <input className="export-app-input" type="password" placeholder="Passphrase" value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)} disabled={exporting} />
                    <input className="export-app-input" type="password" placeholder="Confirm passphrase" value={passphraseConfirm}
                      onChange={(e) => setPassphraseConfirm(e.target.value)} disabled={exporting} />
                    {passphrase && passphraseConfirm && passphrase !== passphraseConfirm && (
                      <div className="export-app-error">Passphrases don't match</div>
                    )}
                  </div>
                )}
              </div>
              <div className="export-app-field">
                <label className="export-app-checkbox">
                  <input type="checkbox" checked={stripSecrets} onChange={(e) => setStripSecrets(e.target.checked)} disabled={exporting} />
                  <span>Strip credentials</span>
                </label>
                <div className="export-app-hint">DB connections, config secrets, and API keys will be removed. The viewer will prompt for them on launch.</div>
              </div>
              {targetPath && (
                <div className="export-app-target">
                  <span className="export-app-info-label">Target</span>
                  <span className="export-app-target-path">{targetPath}</span>
                </div>
              )}
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
                  disabled={exporting || !appName.trim() || !outputDir || !info?.isPackaged || (usePassphrase && (passphrase.length < 4 || passphrase !== passphraseConfirm))}
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
