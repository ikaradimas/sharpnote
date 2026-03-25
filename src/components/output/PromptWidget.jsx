import React, { useState, useRef, useEffect } from 'react';

export function PromptWidget({ spec, notebookId }) {
  const { requestId, message, title, defaultValue } = spec;
  const [value, setValue] = useState(defaultValue || '');
  const [state, setState] = useState(null); // null | 'submitted' | 'cancelled'
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function respond(submitted) {
    const result = submitted ? value : null;
    setState(submitted ? 'submitted' : 'cancelled');
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'prompt_response',
      requestId,
      value: result,
    });
  }

  if (state !== null) {
    return (
      <div className={`prompt-widget prompt-widget--${state}`}>
        {state === 'submitted' ? `✓ "${value}"` : '✕ Cancelled'}
      </div>
    );
  }

  return (
    <div className="prompt-widget prompt-widget--pending">
      {title && <div className="prompt-widget-title">{title}</div>}
      <div className="prompt-widget-message">{message}</div>
      <div className="prompt-widget-input-row">
        <input
          ref={inputRef}
          className="prompt-widget-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') respond(true);
            if (e.key === 'Escape') respond(false);
          }}
        />
        <button className="confirm-btn confirm-btn--ok" onClick={() => respond(true)}>OK</button>
        <button className="confirm-btn confirm-btn--cancel" onClick={() => respond(false)}>Cancel</button>
      </div>
    </div>
  );
}
