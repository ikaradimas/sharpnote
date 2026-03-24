import React, { useState, useCallback, useEffect } from 'react';

export function WidgetOutput({ spec, notebookId }) {
  const { widgetType, widgetKey, label, value } = spec;
  const [localValue, setLocalValue] = useState(value);

  // Sync if spec value changes (e.g. after kernel reset with new default)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const sendChange = useCallback((newValue) => {
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'widget_change',
      widgetKey,
      value: newValue,
    });
  }, [notebookId, widgetKey]);

  if (widgetType === 'slider') {
    const { min, max, step } = spec;
    return (
      <div className="widget-slider">
        <div className="widget-header">
          <span className="widget-label">{label}</span>
          <span className="widget-value">{typeof localValue === 'number' ? localValue.toLocaleString() : localValue}</span>
        </div>
        <input
          type="range"
          className="widget-range"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setLocalValue(v);
          }}
          onMouseUp={(e) => sendChange(parseFloat(e.target.value))}
          onTouchEnd={(e) => sendChange(parseFloat(e.target.value))}
          onKeyUp={(e) => sendChange(parseFloat(e.target.value))}
        />
        <div className="widget-range-bounds">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    );
  }

  if (widgetType === 'dropdown') {
    const { options } = spec;
    return (
      <div className="widget-dropdown">
        <label className="widget-label">{label}</label>
        <select
          className="widget-select"
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value);
            sendChange(e.target.value);
          }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}
