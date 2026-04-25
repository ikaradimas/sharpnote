import React, { useState } from 'react';
import { parseCsv, tableToCSV } from '../../utils.js';
import { DataTable } from './DataTable.jsx';
import { GraphOutput } from './GraphOutput.jsx';
import { WidgetOutput } from './WidgetOutput.jsx';
import { MarkdownOutput } from './MarkdownOutput.jsx';
import { HorizontalOutput } from './HorizontalOutput.jsx';
import { ConfirmWidget } from './ConfirmWidget.jsx';
import { ImageOutput } from './ImageOutput.jsx';
import { MapOutput } from './MapOutput.jsx';
import { SankeyOutput } from './SankeyOutput.jsx';
import { TreeMapOutput } from './TreeMapOutput.jsx';
import { CalendarHeatOutput } from './CalendarHeatOutput.jsx';
import { NetworkOutput } from './NetworkOutput.jsx';
import { PromptWidget } from './PromptWidget.jsx';
import { ProgressOutput } from './ProgressOutput.jsx';
import { ObjectTree } from './ObjectTree.jsx';
import { LayoutOutput } from './LayoutOutput.jsx';
import { FormOutput } from './FormOutput.jsx';

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

export function OutputBlock({ msg, index, notebookId, allCells, onRunCellByName }) {
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
    } else if (msg.format === 'form') {
      inner = <FormOutput spec={msg.content} notebookId={notebookId} allCells={allCells} onRunCellByName={onRunCellByName} />;
    } else if (msg.format === 'widget') {
      inner = <WidgetOutput spec={msg.content} notebookId={notebookId} />;
    } else if (msg.format === 'markdown') {
      inner = <MarkdownOutput content={msg.content} />;
    } else if (msg.format === 'horizontal') {
      inner = <HorizontalOutput items={msg.content} separator={msg.separator} />;
    } else if (msg.format === 'confirm') {
      inner = <ConfirmWidget spec={msg.content} notebookId={notebookId} />;
    } else if (msg.format === 'image') {
      inner = <ImageOutput spec={msg.content} notebookId={notebookId} handleId={msg.handleId} />;
    } else if (msg.format === 'map') {
      inner = <MapOutput spec={msg.content} />;
    } else if (msg.format === 'sankey') {
      inner = <SankeyOutput spec={msg.content} />;
    } else if (msg.format === 'treemap') {
      inner = <TreeMapOutput spec={msg.content} />;
    } else if (msg.format === 'calendar') {
      inner = <CalendarHeatOutput spec={msg.content} />;
    } else if (msg.format === 'network') {
      inner = <NetworkOutput spec={msg.content} />;
    } else if (msg.format === 'prompt') {
      inner = <PromptWidget spec={msg.content} notebookId={notebookId} />;
    } else if (msg.format === 'progress') {
      inner = <ProgressOutput spec={msg.content} />;
    } else if (msg.format === 'tree') {
      inner = <ObjectTree json={msg.content} />;
    } else if (msg.format === 'layout') {
      inner = <LayoutOutput columns={msg.columns} cells={msg.cells} />;
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

function isTableMsg(msg) {
  return msg.type === 'display' && (msg.format === 'table' || msg.format === 'csv');
}

function TabbedResults({ tableMessages, notebookId, allCells, onRunCellByName }) {
  const [activeTab, setActiveTab] = useState(0);
  const msg = tableMessages[activeTab];
  return (
    <div className="output-tabbed">
      <div className="output-tab-bar">
        {tableMessages.map((m, i) => {
          const rows = m.format === 'csv' ? parseCsv(m.content) : m.content;
          const count = Array.isArray(rows) ? rows.length : 0;
          return (
            <button
              key={i}
              className={`output-tab${i === activeTab ? ' active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {m.title || `Result ${i + 1}`}
              <span className="output-tab-count">{count}</span>
            </button>
          );
        })}
      </div>
      <OutputBlock msg={msg} index={activeTab} notebookId={notebookId} allCells={allCells} onRunCellByName={onRunCellByName} />
    </div>
  );
}

export function CellOutput({ messages, notebookId, allCells, onRunCellByName }) {
  if (!messages || messages.length === 0) return null;

  // If 2+ table outputs exist, group them into a tabbed view
  const tableMessages = messages.filter(isTableMsg);
  const nonTableMessages = messages.filter((m) => !isTableMsg(m));
  const useTabs = tableMessages.length >= 2;

  return (
    <div className="cell-output">
      {nonTableMessages.map((msg, i) => (
        <OutputBlock key={msg.handleId || `nt-${i}`} msg={msg} index={i} notebookId={notebookId} allCells={allCells} onRunCellByName={onRunCellByName} />
      ))}
      {useTabs ? (
        <TabbedResults tableMessages={tableMessages} notebookId={notebookId} allCells={allCells} onRunCellByName={onRunCellByName} />
      ) : (
        tableMessages.map((msg, i) => (
          <OutputBlock key={msg.handleId || `t-${i}`} msg={msg} index={i} notebookId={notebookId} allCells={allCells} onRunCellByName={onRunCellByName} />
        ))
      )}
    </div>
  );
}
