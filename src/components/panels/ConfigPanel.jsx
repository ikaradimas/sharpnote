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
            <span className="config-empty">No entries — add key/value pairs below</span>
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
