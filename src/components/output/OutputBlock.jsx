import React from 'react';
import { parseCsv, tableToCSV } from '../../utils.js';
import { DataTable } from './DataTable.jsx';
import { GraphOutput } from './GraphOutput.jsx';
import { WidgetOutput } from './WidgetOutput.jsx';
import { MarkdownOutput } from './MarkdownOutput.jsx';
import { HorizontalOutput } from './HorizontalOutput.jsx';

async function exportMsg(msg) {
  if (!window.electronAPI?.saveFile) return;
  let content, defaultName, filters;

  if (msg.type === 'stdout') {
    content = msg.content;
    defaultName = 'output.txt';
    filters = [{ name: 'Text', extensions: ['txt'] }];
  } else if (msg.type === 'display') {
    if (msg.format === 'html') {
      content = `<!DOCTYPE html><html><body>${msg.content}</body></html>`;
      defaultName = 'output.html';
      filters = [{ name: 'HTML', extensions: ['html'] }];
    } else if (msg.format === 'table') {
      content = tableToCSV(msg.content);
      defaultName = 'output.csv';
      filters = [{ name: 'CSV', extensions: ['csv'] }];
    } else if (msg.format === 'csv') {
      content = msg.content;
      defaultName = 'output.csv';
      filters = [{ name: 'CSV', extensions: ['csv'] }];
    } else if (msg.format === 'graph') {
      content = JSON.stringify(msg.content, null, 2);
      defaultName = 'chart.json';
      filters = [{ name: 'JSON', extensions: ['json'] }];
    }
  }

  if (content !== undefined) {
    await window.electronAPI.saveFile({ content, defaultName, filters });
  }
}

export function OutputBlock({ msg, index, notebookId }) {
  const canExport = msg.type === 'stdout' ||
    (msg.type === 'display' && ['html', 'table', 'csv', 'graph'].includes(msg.format));

  let inner = null;
  if (msg.type === 'stdout') {
    inner = <div className="output-stdout">{msg.content}</div>;
  } else if (msg.type === 'error') {
    inner = (
      <>
        <div className="output-error">{msg.message}</div>
        {msg.stackTrace && <div className="output-error-stack">{msg.stackTrace}</div>}
      </>
    );
  } else if (msg.type === 'display') {
    if (msg.format === 'html') {
      inner = <div className="output-html" dangerouslySetInnerHTML={{ __html: msg.content }} />;
    } else if (msg.format === 'table') {
      inner = <DataTable rows={msg.content} />;
    } else if (msg.format === 'csv') {
      inner = <DataTable rows={parseCsv(msg.content)} />;
    } else if (msg.format === 'graph') {
      inner = <GraphOutput config={msg.content} />;
    } else if (msg.format === 'widget') {
      inner = <WidgetOutput spec={msg.content} notebookId={notebookId} />;
    } else if (msg.format === 'markdown') {
      inner = <MarkdownOutput content={msg.content} />;
    } else if (msg.format === 'horizontal') {
      inner = <HorizontalOutput items={msg.content} separator={msg.separator} />;
    }
  } else if (msg.type === 'interrupted') {
    inner = <div className="output-interrupted">⏹ Execution interrupted</div>;
  }

  if (inner === null) return null;

  return (
    <div key={index} className="output-block">
      {canExport && (
        <button
          className="export-btn"
          title="Export output"
          onClick={() => exportMsg(msg)}
        >
          ⬇
        </button>
      )}
      {msg.title && <div className="output-title">{msg.title}</div>}
      {inner}
    </div>
  );
}

export function CellOutput({ messages, notebookId }) {
  if (!messages || messages.length === 0) return null;
  return (
    <div className="cell-output">
      {messages.map((msg, i) => (
        <OutputBlock key={msg.handleId || i} msg={msg} index={i} notebookId={notebookId} />
      ))}
    </div>
  );
}
