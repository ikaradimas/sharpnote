import React from 'react';
import { FormatContent } from './FormatContent.jsx';

function LayoutCell({ title, content }) {
  return (
    <div className="layout-cell">
      {title && <div className="layout-cell-title">{title}</div>}
      {content && <FormatContent format={content.format} content={content.content} />}
    </div>
  );
}

export function LayoutOutput({ columns, cells }) {
  return (
    <div
      className="layout-output"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {cells.map((cell, i) => (
        <LayoutCell key={i} title={cell.title} content={cell.content} />
      ))}
    </div>
  );
}
