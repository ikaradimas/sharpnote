import React, { useState } from 'react';

const TYPE_OPTIONS = ['string', 'int', 'long', 'float', 'double', 'bool', 'date', 'datetime', 'uuid', 'object'];

export function ModelEditor({ model, modelNames, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const updateField = (idx, key, value) => {
    const fields = model.fields.map((f, i) => i === idx ? { ...f, [key]: value } : f);
    onUpdate({ ...model, fields });
  };

  const addField = () => {
    onUpdate({ ...model, fields: [...model.fields, { name: '', type: 'string', required: false, description: '' }] });
  };

  const removeField = (idx) => {
    onUpdate({ ...model, fields: model.fields.filter((_, i) => i !== idx) });
  };

  return (
    <div className="api-ed-model">
      <div className="api-ed-model-header" onClick={() => setExpanded(v => !v)}>
        <span className="api-ed-expand">{expanded ? '▾' : '▸'}</span>
        <input
          className="api-ed-model-name"
          value={model.name}
          onChange={(e) => onUpdate({ ...model, name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="ModelName"
          spellCheck={false}
        />
        <span className="api-ed-model-count">{model.fields.length} fields</span>
        <button className="api-ed-remove-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete model">✕</button>
      </div>
      {expanded && (
        <div className="api-ed-model-body">
          <input
            className="api-ed-desc-input"
            value={model.description || ''}
            onChange={(e) => onUpdate({ ...model, description: e.target.value })}
            placeholder="Model description"
          />
          <div className="api-ed-fields">
            <div className="api-ed-field-header">
              <span className="api-ed-field-col-name">Name</span>
              <span className="api-ed-field-col-type">Type</span>
              <span className="api-ed-field-col-req">Req</span>
              <span className="api-ed-field-col-desc">Description</span>
              <span className="api-ed-field-col-act" />
            </div>
            {model.fields.map((f, i) => (
              <div key={i} className="api-ed-field-row">
                <input className="api-ed-field-col-name" value={f.name} onChange={(e) => updateField(i, 'name', e.target.value)} placeholder="field" spellCheck={false} />
                <select className="api-ed-field-col-type" value={TYPE_OPTIONS.includes(f.type?.toLowerCase()) ? f.type.toLowerCase() : ''} onChange={(e) => updateField(i, 'type', e.target.value)}>
                  <option value="">custom…</option>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  {modelNames.filter(n => n !== model.name).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <input type="checkbox" className="api-ed-field-col-req" checked={f.required} onChange={(e) => updateField(i, 'required', e.target.checked)} />
                <input className="api-ed-field-col-desc" value={f.description || ''} onChange={(e) => updateField(i, 'description', e.target.value)} placeholder="description" />
                <button className="api-ed-remove-btn api-ed-field-col-act" onClick={() => removeField(i)}>✕</button>
              </div>
            ))}
          </div>
          <button className="api-ed-add-btn" onClick={addField}>+ Field</button>
        </div>
      )}
    </div>
  );
}
