import React from 'react';
import { FormatContent } from './FormatContent.jsx';

export function HorizontalOutput({ items, separator }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="horizontal-output" style={{ gap: separator || '12px' }}>
      {items.map((item, i) => (
        <div key={i} className="horizontal-output-item">
          {item && <FormatContent format={item.format} content={item.content} />}
        </div>
      ))}
    </div>
  );
}
