import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DB_PROVIDERS, DB_CONNSTR_PLACEHOLDER } from '../../config/db-providers.js';

export function DbConnectionDialog({ connection, existingNames, onSave, onClose, onTestConnection }) {
  const isNew = !connection;
  const [name, setName] = useState(connection?.name ?? '');
  const [provider, setProvider] = useState(connection?.provider ?? 'sqlite');
  const [connStr, setConnStr] = useState(connection?.connectionString ?? '');
  const [error, setError] = useState('');
  const [testState, setTestState] = useState(null); // null | 'testing' | 'success' | 'error'
  const [testMsg, setTestMsg] = useState('');

  const providerMeta = DB_PROVIDERS.find((p) => p.key === provider);

  const handleSave = () => {
    const n  = name.trim();
    const cs = connStr.trim();
    if (!n) return;
    if (!providerMeta?.optionalConnStr && !cs) return;
    const isDuplicate = existingNames.some(
      (existing) => existing.toLowerCase() === n.toLowerCase()
    );
    if (isDuplicate) {
      setError(`A connection named "${n}" already exists.`);
      return;
    }
    setError('');
    const id = connection?.id ?? uuidv4();
    onSave({ id, name: n, provider, connectionString: cs });
    onClose();
  };

  const handleTest = async () => {
    if (!onTestConnection) return;
    const cs = connStr.trim();
    if (!providerMeta?.optionalConnStr && !cs) {
      setTestState('error');
      setTestMsg('Connection string is required.');
      return;
    }
    setTestState('testing');
    setTestMsg('');
    try {
      const result = await onTestConnection(provider, cs);
      if (result.success) {
        setTestState('success');
        setTestMsg('Connection successful.');
      } else {
        setTestState('error');
        setTestMsg(result.message || 'Connection failed.');
      }
    } catch (err) {
      setTestState('error');
      setTestMsg(err.message || 'Connection failed.');
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="db-conn-dialog">
        <div className="db-conn-dialog-header">
          <span>{isNew ? 'Add Connection' : 'Edit Connection'}</span>
          <button className="settings-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="db-conn-dialog-body">
          <label className="db-conn-dialog-label">Name</label>
          <input
            className="nuget-input"
            placeholder="Connection name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          <label className="db-conn-dialog-label">Provider</label>
          <select
            className="nuget-input db-provider-select"
            value={provider}
            onChange={(e) => { setProvider(e.target.value); setTestState(null); }}
          >
            {DB_PROVIDERS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
          <label className="db-conn-dialog-label">Connection String</label>
          <input
            className="nuget-input db-connstr-input"
            placeholder={DB_CONNSTR_PLACEHOLDER[provider] ?? 'Connection string'}
            value={connStr}
            onChange={(e) => { setConnStr(e.target.value); setTestState(null); }}
            spellCheck={false}
          />
          {error && <div className="db-form-error">{error}</div>}
          {testState && (
            <div className={`db-test-result db-test-${testState}`}>
              {testState === 'testing' && <span className="db-test-spinner" />}
              {testState === 'success' && '✓ '}
              {testState === 'error' && '✗ '}
              {testState === 'testing' ? 'Testing connection…' : testMsg}
            </div>
          )}
        </div>
        <div className="db-conn-dialog-footer">
          <button className="nuget-remove-btn db-form-btn" onClick={onClose}>Cancel</button>
          {onTestConnection && (
            <button
              className="db-test-btn db-form-btn"
              onClick={handleTest}
              disabled={testState === 'testing'}
            >
              Test
            </button>
          )}
          <button className="nuget-add-btn db-form-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
