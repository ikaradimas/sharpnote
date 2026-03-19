import React from 'react';
import { createRoot } from 'react-dom/client';

// ── Extracted modules ─────────────────────────────────────────────────────────
import { DOCS_TAB_ID, LIB_EDITOR_ID_PREFIX } from './constants.js';
import {
  makeLibEditorId, isLibEditorId, isNotebookId,
  getNotebookDisplayName, formatLogTime,
  extractHeadings, parseCsv, tableToCSV, formatFileSize,
} from './utils.js';

// Re-export everything that tests import from this file
export { DOCS_TAB_ID, LIB_EDITOR_ID_PREFIX };
export { makeLibEditorId, isLibEditorId, isNotebookId, getNotebookDisplayName, formatLogTime };
export { extractHeadings, parseCsv, tableToCSV, formatFileSize };

// ── Component exports (for test re-exports) ───────────────────────────────────
export { DataTable } from './components/output/DataTable.jsx';
export { OutputBlock } from './components/output/OutputBlock.jsx';
export { CodeCell } from './components/editor/CodeCell.jsx';
export { NugetPanel } from './components/panels/nuget/NugetPanel.jsx';
export { ConfigPanel } from './components/panels/ConfigPanel.jsx';
export { VarsPanel } from './components/panels/VarsPanel.jsx';
export { FilesPanel } from './components/panels/FilesPanel.jsx';
export { TabBar } from './components/toolbar/TabBar.jsx';
export { QuitDialog } from './components/dialogs/QuitDialog.jsx';

// ── App bootstrap ─────────────────────────────────────────────────────────────
import { App } from './app/App.jsx';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
}
