import React from 'react';
import { parseCsv } from '../../utils.js';
import { DataTable } from './DataTable.jsx';
import { GraphOutput } from './GraphOutput.jsx';
import { ImageOutput } from './ImageOutput.jsx';
import { MarkdownOutput } from './MarkdownOutput.jsx';
import { ObjectTree } from './ObjectTree.jsx';

function LayoutCell({ title, content }) {
  let inner = null;

  if (content) {
    const { format } = content;
    if (format === 'html') {
      inner = <div className="output-html" dangerouslySetInnerHTML={{ __html: content.content }} />;
    } else if (format === 'table') {
      inner = <DataTable rows={content.content} />;
    } else if (format === 'csv') {
      inner = <DataTable rows={parseCsv(content.content)} />;
    } else if (format === 'graph') {
      inner = <GraphOutput config={content.content} />;
    } else if (format === 'image') {
      inner = <ImageOutput spec={content.content} />;
    } else if (format === 'markdown') {
      inner = <MarkdownOutput content={content.content} />;
    } else if (format === 'tree') {
      inner = <ObjectTree json={content.content} />;
    }
  }

  return (
    <div className="layout-cell">
      {title && <div className="layout-cell-title">{title}</div>}
      {inner}
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
