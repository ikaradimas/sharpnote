import React, { useState } from 'react';

export function VarInspectDialog({ name, typeName, value, fullValue, onLoadFull, onClose }) {
  const [copied, setCopied] = useState(false);

  const displayed = fullValue ?? value ?? '';
  const isTruncated = !fullValue && typeof value === 'string' && value.length >= 119;

  const handleCopy = () => {
    navigator.clipboard?.writeText(displayed).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="var-inspect-overlay" onClick={handleOverlayClick}>
      <div className="var-inspect-dialog">
        <div className="var-inspect-header">
          <span className="var-inspect-name">{name}</span>
          <span className="var-inspect-type">{typeName}</span>
          <button className="var-inspect-close" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="var-inspect-body">
          {displayed
            ? <pre className="var-inspect-value">{displayed}</pre>
            : <span className="var-null">null</span>
          }
          {isTruncated && (
            <div className="var-inspect-truncated">
              Value may be truncated — click Load Full Value
            </div>
          )}
        </div>
        <div className="var-inspect-footer">
          {!fullValue && (
            <button className="var-inspect-load-btn" onClick={onLoadFull}>
              Load Full Value
            </button>
          )}
          <button className="var-inspect-copy-btn" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
