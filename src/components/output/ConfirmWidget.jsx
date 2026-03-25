import React, { useState } from 'react';

export function ConfirmWidget({ spec, notebookId }) {
  const { requestId, message, title } = spec;
  const [state, setState] = useState(null); // null | 'confirmed' | 'cancelled'

  function respond(confirmed) {
    setState(confirmed ? 'confirmed' : 'cancelled');
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'confirm_response',
      requestId,
      confirmed,
    });
  }

  if (state !== null) {
    return (
      <div className={`confirm-widget confirm-widget--${state}`}>
        {state === 'confirmed' ? '✓ Confirmed' : '✕ Cancelled'}
      </div>
    );
  }

  return (
    <div className="confirm-widget confirm-widget--pending">
      {title && <div className="confirm-widget-title">{title}</div>}
      <div className="confirm-widget-message">{message}</div>
      <div className="confirm-widget-buttons">
        <button className="confirm-btn confirm-btn--ok" onClick={() => respond(true)}>OK</button>
        <button className="confirm-btn confirm-btn--cancel" onClick={() => respond(false)}>Cancel</button>
      </div>
    </div>
  );
}
