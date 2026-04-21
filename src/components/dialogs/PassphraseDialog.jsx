import React, { useState } from 'react';

export function PassphraseDialog({ onSubmit }) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!passphrase) return;
    setLoading(true); setError(null);
    const result = await onSubmit(passphrase);
    setLoading(false);
    if (!result?.success) setError(result?.error || 'Invalid passphrase');
  };

  return (
    <div className="export-app-overlay">
      <div className="export-app-dialog">
        <div className="export-app-header">
          <span className="export-app-title">Enter Passphrase</span>
        </div>
        <div className="export-app-body">
          <p className="export-app-hint">This notebook is passphrase-protected. Enter the passphrase to unlock.</p>
          <div className="export-app-field">
            <input className="export-app-input" type="password" placeholder="Passphrase"
              value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              disabled={loading} autoFocus />
          </div>
          {error && <div className="export-app-error">{error}</div>}
          <div className="export-app-actions">
            <button className="kafka-btn kafka-btn-primary" onClick={handleSubmit}
              disabled={loading || !passphrase}>
              {loading ? 'Unlocking\u2026' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
