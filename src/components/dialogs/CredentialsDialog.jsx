import React, { useState } from 'react';

export function CredentialsDialog({ items, onSubmit }) {
  const [values, setValues] = useState(() => Object.fromEntries(items.map(i => [i.id, ''])));

  const handleChange = (id, value) => setValues(prev => ({ ...prev, [id]: value }));

  const handleSubmit = () => {
    const filled = items.map(i => ({ ...i, value: values[i.id] || '' }));
    onSubmit(filled);
  };

  const allFilled = items.every(i => values[i.id]?.trim());

  return (
    <div className="export-app-overlay">
      <div className="export-app-dialog" style={{ maxWidth: 500 }}>
        <div className="export-app-header">
          <span className="export-app-title">Missing Credentials</span>
        </div>
        <div className="export-app-body">
          <p className="export-app-hint">
            This notebook requires credentials that were not included in the export. Please provide them below.
          </p>
          {items.map(item => (
            <div key={item.id} className="export-app-field">
              <label className="export-app-label">{item.label}</label>
              <input className="export-app-input" type={item.field === 'connectionString' ? 'text' : 'password'}
                placeholder={item.field === 'connectionString' ? 'Connection string' : 'Value'}
                value={values[item.id]} onChange={(e) => handleChange(item.id, e.target.value)}
                spellCheck={false} />
            </div>
          ))}
          <div className="export-app-actions">
            <button className="kafka-btn" onClick={() => onSubmit([])}>Skip</button>
            <button className="kafka-btn kafka-btn-primary" onClick={handleSubmit} disabled={!allFilled}>
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
