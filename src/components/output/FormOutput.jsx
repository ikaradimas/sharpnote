import React, { useState, useCallback } from 'react';

export function FormOutput({ spec, notebookId, allCells, onRunCellByName }) {
  const { formKey, title, targetCell, fields } = spec;
  const [values, setValues] = useState(() => {
    const init = {};
    for (const f of fields || []) {
      init[f.key] = f.defaultValue ?? (f.type === 'checkbox' ? false : f.type === 'number' ? 0 : '');
    }
    return init;
  });
  const [submitting, setSubmitting] = useState(false);

  const setValue = useCallback((key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    // Check required fields
    for (const f of fields || []) {
      if (f.required && !values[f.key] && values[f.key] !== 0 && values[f.key] !== false) return;
    }

    setSubmitting(true);

    // Send form values to kernel for storage
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'form_submit', formKey, values,
    });

    // Find and run the target cell
    if (targetCell && onRunCellByName) {
      onRunCellByName(notebookId, targetCell, values);
    }

    setTimeout(() => setSubmitting(false), 500);
  }, [formKey, targetCell, fields, values, notebookId, onRunCellByName]);

  return (
    <form className="form-output" onSubmit={handleSubmit}>
      {title && <div className="form-output-title">{title}</div>}
      <div className="form-output-fields">
        {(fields || []).map((f) => (
          <FormField key={f.key} field={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} />
        ))}
      </div>
      <div className="form-output-actions">
        <button
          type="submit"
          className="form-output-submit"
          disabled={submitting}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
        {targetCell && <span className="form-output-target">→ {targetCell}</span>}
      </div>
    </form>
  );
}

function FormField({ field, value, onChange }) {
  const { key, label, type, required, placeholder, min, max, step, options } = field;

  const labelEl = (
    <label className="form-field-label" htmlFor={`form-${key}`}>
      {label}{required && <span className="form-field-required">*</span>}
    </label>
  );

  if (type === 'checkbox') {
    return (
      <div className="form-field form-field-checkbox">
        <input
          id={`form-${key}`}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {labelEl}
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div className="form-field">
        {labelEl}
        <select
          id={`form-${key}`}
          className="form-field-input"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {(options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (type === 'textarea') {
    return (
      <div className="form-field">
        {labelEl}
        <textarea
          id={`form-${key}`}
          className="form-field-input form-field-textarea"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          rows={3}
        />
      </div>
    );
  }

  // text, number, date
  return (
    <div className="form-field">
      {labelEl}
      <input
        id={`form-${key}`}
        type={type || 'text'}
        className="form-field-input"
        value={value ?? ''}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}
