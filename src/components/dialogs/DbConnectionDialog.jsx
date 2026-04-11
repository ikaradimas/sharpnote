import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DB_PROVIDERS, DB_CONNSTR_PLACEHOLDER } from '../../config/db-providers.js';

// Append timeout params to connection string if not already present
function applyTimeouts(connStr, provider, connTimeout, cmdTimeout) {
  let cs = connStr.trim();
  if (!cs) return cs;

  if (provider === 'redis') {
    // Redis: connectTimeout=N (milliseconds)
    if (connTimeout && !cs.toLowerCase().includes('connecttimeout'))
      cs += `,connectTimeout=${connTimeout * 1000}`;
    return cs;
  }

  // Relational: semicolon-delimited key=value
  if (!cs.endsWith(';') && cs.length > 0) cs += ';';

  if (provider === 'postgresql') {
    if (connTimeout && !cs.toLowerCase().includes('timeout='))
      cs += `Timeout=${connTimeout};`;
    if (cmdTimeout && !cs.toLowerCase().includes('command timeout'))
      cs += `Command Timeout=${cmdTimeout};`;
  } else if (provider === 'sqlserver') {
    if (connTimeout && !cs.toLowerCase().includes('connection timeout') && !cs.toLowerCase().includes('connect timeout'))
      cs += `Connection Timeout=${connTimeout};`;
    if (cmdTimeout && !cs.toLowerCase().includes('command timeout'))
      cs += `Command Timeout=${cmdTimeout};`;
  } else {
    // SQLite
    if (connTimeout && !cs.toLowerCase().includes('default timeout'))
      cs += `Default Timeout=${connTimeout};`;
  }

  return cs;
}

export function DbConnectionDialog({ connection, existingNames, onSave, onClose, onTestConnection }) {
  const isNew = !connection;
  const [name, setName] = useState(connection?.name ?? '');
  const [provider, setProvider] = useState(connection?.provider ?? 'sqlite');
  const [connStr, setConnStr] = useState(connection?.connectionString ?? '');
  const [connTimeout, setConnTimeout] = useState(connection?.connTimeout ?? 30);
  const [cmdTimeout, setCmdTimeout] = useState(connection?.cmdTimeout ?? 60);
  const [error, setError] = useState('');
  const [testState, setTestState] = useState(null);
  const [testMsg, setTestMsg] = useState('');

  const providerMeta = DB_PROVIDERS.find((p) => p.key === provider);
  const isRedis = provider === 'redis';
  const isMemory = provider === 'sqlite_memory';

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
    const finalCs = isMemory ? cs : applyTimeouts(cs, provider, connTimeout, cmdTimeout);
    onSave({ id, name: n, provider, connectionString: finalCs, connTimeout, cmdTimeout });
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
      const testCs = isMemory ? cs : applyTimeouts(cs, provider, connTimeout, cmdTimeout);
      const result = await onTestConnection(provider, testCs);
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

          {!isMemory && (
            <div className="db-timeout-row">
              <label className="db-timeout-field">
                <span className="db-conn-dialog-label">Connection Timeout (s)</span>
                <input
                  className="nuget-input db-timeout-input"
                  type="number"
                  min="1"
                  max="300"
                  value={connTimeout}
                  onChange={(e) => setConnTimeout(Math.max(1, parseInt(e.target.value) || 30))}
                />
              </label>
              {!isRedis && (
                <label className="db-timeout-field">
                  <span className="db-conn-dialog-label">Command Timeout (s)</span>
                  <input
                    className="nuget-input db-timeout-input"
                    type="number"
                    min="1"
                    max="600"
                    value={cmdTimeout}
                    onChange={(e) => setCmdTimeout(Math.max(1, parseInt(e.target.value) || 60))}
                  />
                </label>
              )}
            </div>
          )}

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
