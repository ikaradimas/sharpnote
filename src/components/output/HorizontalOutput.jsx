import React from 'react';
import { parseCsv } from '../../utils.js';
import { DataTable } from './DataTable.jsx';
import { GraphOutput } from './GraphOutput.jsx';
import { MarkdownOutput } from './MarkdownOutput.jsx';

// Renders a single child item from a Util.HorizontalRun payload.
// Mirrors the display-format dispatch in OutputBlock but without the outer chrome.
function HorizontalItem({ item }) {
  if (!item) return null;
  const { format, content } = item;
  if (format === 'html')     return <div className="output-html" dangerouslySetInnerHTML={{ __html: content }} />;
  if (format === 'table')    return <DataTable rows={content} />;
  if (format === 'csv')      return <DataTable rows={parseCsv(content)} />;
  if (format === 'graph')    return <GraphOutput config={content} />;
  if (format === 'markdown') return <MarkdownOutput content={content} />;
  return null;
}

export function HorizontalOutput({ items, separator }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="horizontal-output" style={{ gap: separator || '12px' }}>
      {items.map((item, i) => (
        <div key={i} className="horizontal-output-item">
          <HorizontalItem item={item} />
        </div>
      ))}
    </div>
  );
}
