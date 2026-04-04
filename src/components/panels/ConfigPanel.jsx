import React, { useState, useRef } from 'react';
import { useResize } from '../../hooks/useResize.js';

const CONFIG_TYPES = ['string', 'number', 'boolean', 'secret'];

export function ConfigPanel({ isOpen, onToggle, config, onAdd, onRemove, onUpdate }) {
  const [height, onResizeMouseDown] = useResize(200, 'top');
  const [newKey, setNewKey]       = useState('');
  const [newValue, setNewValue]   = useState('');
  const [newType, setNewType]     = useState('string');
  const [newEnvVar, setNewEnvVar] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);
  const keyRef = useRef(null);

  if (!isOpen) return null;

  const handleAdd = () => {
    const k = newKey.trim();
    if (!k) return;
    onAdd(k, newValue, newType, newEnvVar.trim() || undefined);
    setNewKey(''); setNewValue(''); setNewType('string'); setNewEnvVar('');
    keyRef.current?.focus();
  };

  return (
    <div className="config-panel" style={{ height }}>
      <div className="resize-handle resize-v" onMouseDown={onResizeMouseDown} />
      <div className="config-panel-header">
        <span className="config-panel-title">Config</span>
        <span className="config-panel-hint">Access in scripts via <code>Config["key"]</code></span>
        <button
          className={`config-show-btn${showSecrets ? ' active' : ''}`}
          onClick={() => setShowSecrets((v) => !v)}
          title={showSecrets ? 'Hide secret values' : 'Show secret values'}
        >{showSecrets ? '◉' : '◎'}</button>
        <button className="config-close-btn" onClick={onToggle} title="Close">×</button>
      </div>
      <div className="config-body">
        <div className="config-list">
          {config.length === 0 && (
            <div className="panel-empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.3 }}>
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              <span className="panel-empty-title">No config entries</span>
              <span className="panel-empty-hint">Add key/value pairs to configure this notebook</span>
            </div>
          )}
          {config.map((entry, i) => {
            const isSecret = entry.type === 'secret';
            const inputType = isSecret && !showSecrets ? 'password' : 'text';
            return (
              <div key={i} className="config-item">
                <span className="config-key">{entry.key}</span>
                <input
                  className="nuget-input config-env-input"
                  value={entry.envVar || ''}
                  onChange={(e) => onUpdate(i, { envVar: e.target.value || undefined })}
                  placeholder="ENV_VAR"
                  spellCheck={false}
                />
                <select
                  className="config-type-select"
                  value={entry.type || 'string'}
                  onChange={(e) => onUpdate(i, { type: e.target.value })}
                >
                  {CONFIG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="config-eq">=</span>
                <input
                  className="nuget-input config-value-input"
                  type={inputType}
                  value={entry.value}
                  onChange={(e) => onUpdate(i, { value: e.target.value })}
                  spellCheck={false}
                />
                <button className="nuget-remove-btn" title="Remove" onClick={() => onRemove(i)}>×</button>
              </div>
            );
          })}
        </div>
        <div className="config-add-row">
          <input ref={keyRef} className="nuget-input config-key-input" placeholder="Key"
            value={newKey} onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
          <input className="nuget-input config-env-input" placeholder="ENV_VAR"
            value={newEnvVar} onChange={(e) => setNewEnvVar(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
          <select className="config-type-select" value={newType} onChange={(e) => setNewType(e.target.value)}>
            {CONFIG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="config-eq">=</span>
          <input className="nuget-input config-value-input-add" placeholder="Value"
            value={newValue} onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
          <button className="nuget-add-btn" onClick={handleAdd}>+ Add</button>
        </div>
      </div>
    </div>
  );
}
