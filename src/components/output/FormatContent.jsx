import React from 'react';
import { parseCsv } from '../../utils.js';
import { DataTable } from './DataTable.jsx';
import { GraphOutput } from './GraphOutput.jsx';
import { ImageOutput } from './ImageOutput.jsx';
import { MapOutput } from './MapOutput.jsx';
import { MarkdownOutput } from './MarkdownOutput.jsx';
import { ObjectTree } from './ObjectTree.jsx';

export function FormatContent({ format, content }) {
  if (format === 'html')     return <div className="output-html" dangerouslySetInnerHTML={{ __html: content }} />;
  if (format === 'table')    return <DataTable rows={content} />;
  if (format === 'csv')      return <DataTable rows={parseCsv(content)} />;
  if (format === 'graph')    return <GraphOutput config={content} />;
  if (format === 'image')    return <ImageOutput spec={content} />;
  if (format === 'map')      return <MapOutput spec={content} />;
  if (format === 'markdown') return <MarkdownOutput content={content} />;
  if (format === 'tree')     return <ObjectTree json={content} />;
  return null;
}
