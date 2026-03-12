import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { createRoot } from 'react-dom/client';
import { v4 as uuidv4 } from 'uuid';
import { marked } from 'marked';
import Chart from 'chart.js/auto';

// CodeMirror
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';

// ── C# keyword list (used by static completion source) ───────────────────────

const CSHARP_KEYWORDS = [
  'abstract','as','async','await','base','bool','break','byte','case','catch',
  'char','checked','class','const','continue','decimal','default','delegate',
  'do','double','else','enum','event','explicit','extern','false','finally',
  'fixed','float','for','foreach','goto','if','implicit','in','int','interface',
  'internal','is','lock','long','namespace','new','null','object','operator',
  'out','override','params','private','protected','public','readonly','ref',
  'return','sbyte','sealed','short','sizeof','stackalloc','static','string',
  'struct','switch','this','throw','true','try','typeof','uint','ulong',
  'unchecked','unsafe','ushort','using','var','virtual','void','volatile','while',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCell(type = 'code', content = '') {
  return { id: uuidv4(), type, content, ...(type === 'code' ? { outputMode: 'auto', locked: false } : {}) };
}

// ── CodeMirror Editor ────────────────────────────────────────────────────────

function CodeEditor({ value, onChange, language = 'csharp', onCtrlEnter,
                      onRequestCompletions, onRequestLint, readOnly = false }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onCtrlEnterRef = useRef(onCtrlEnter);
  const completionsRef = useRef(onRequestCompletions);
  const lintRef = useRef(onRequestLint);
  const readOnlyCompartmentRef = useRef(null);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCtrlEnterRef.current = onCtrlEnter; }, [onCtrlEnter]);
  useEffect(() => { completionsRef.current = onRequestCompletions; }, [onRequestCompletions]);
  useEffect(() => { lintRef.current = onRequestLint; }, [onRequestLint]);

  // Toggle read-only without recreating the editor
  useEffect(() => {
    const view = viewRef.current;
    const compartment = readOnlyCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({ effects: compartment.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly]);

  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = language === 'markdown'
      ? markdown({ base: markdownLanguage })
      : StreamLanguage.define(csharp);

    const ctrlEnterKey = keymap.of([{
      key: 'Ctrl-Enter',
      run: () => { onCtrlEnterRef.current?.(); return true; },
    }]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const readOnlyCompartment = new Compartment();
    readOnlyCompartmentRef.current = readOnlyCompartment;

    const extensions = [
      history(),
      lineNumbers(),
      highlightActiveLine(),
      oneDark,
      langExt,
      ctrlEnterKey,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      updateListener,
      EditorView.lineWrapping,
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
    ];

    if (language === 'csharp') {
      // Static keyword source — instant, no IPC
      const keywordSource = (ctx) => {
        const word = ctx.matchBefore(/\w*/);
        if (!word || (word.from === word.to && !ctx.explicit)) return null;
        return {
          from: word.from,
          options: CSHARP_KEYWORDS.map((kw) => ({ label: kw, type: 'keyword' })),
          validFor: /^\w*$/,
        };
      };

      // Dynamic source — calls kernel for vars + member completions
      const dynamicSource = async (ctx) => {
        const fn = completionsRef.current;
        if (!fn) return null;
        const code = ctx.state.doc.toString();
        const pos  = ctx.pos;
        const textBefore = code.slice(0, pos);
        const isMemberAccess = /\w\.$/.test(textBefore) || /\w\.\w+$/.test(textBefore);
        const word = ctx.matchBefore(/\w*/);
        if (!isMemberAccess && !ctx.explicit && (!word || word.text.length < 2)) return null;
        try {
          const items = await fn(code, pos);
          if (!items?.length) return null;
          return {
            from: word?.from ?? pos,
            options: items.map((i) => ({ label: i.label, type: i.type || 'text', detail: i.detail })),
            validFor: /^\w*$/,
          };
        } catch { return null; }
      };

      extensions.push(
        autocompletion({ override: [keywordSource, dynamicSource], defaultKeymap: true }),
        keymap.of(completionKeymap),
      );

      // Lint source — calls kernel for syntax diagnostics
      const lintSource = async (view) => {
        const fn = lintRef.current;
        if (!fn) return [];
        try {
          const diags = await fn(view.state.doc.toString());
          return (diags || []).map((d) => ({
            from: d.from, to: d.to,
            severity: d.severity,
            message: d.message,
          }));
        } catch { return []; }
      };

      extensions.push(linter(lintSource, { delay: 600 }));
    }

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Sync external value changes (e.g., load notebook)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="code-editor-wrap" />;
}

// ── DataTable ────────────────────────────────────────────────────────────────

function DataTable({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <div className="output-stdout">(empty table)</div>;
  }
  const columns = Object.keys(rows[0]);
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Convert table rows to CSV string
function tableToCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))].join('\n');
}

// Parse CSV string → array of objects
function parseCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 1) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ''; });
    return obj;
  });
}

// ── Log Panel ────────────────────────────────────────────────────────────────

function parseLogContent(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const m = line.match(/^(\S+)\s+\[([^\]]+)\]\s+(.*)$/);
    if (m) return { timestamp: m[1], tag: m[2], message: m[3] };
    return { timestamp: '', tag: '', message: line };
  });
}

function LogEntry({ entry }) {
  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';
  const tagClass = `log-tag log-tag-${(entry.tag || '').toLowerCase()}`;
  return (
    <div className="log-entry">
      <span className="log-time">{time}</span>
      <span className={tagClass}>{entry.tag}</span>
      <span className="log-message">{entry.message}</span>
    </div>
  );
}

function LogPanel({ isOpen, onToggle }) {
  const [logFiles, setLogFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('live');
  const [fileEntries, setFileEntries] = useState([]);
  const [liveEntries, setLiveEntries] = useState([]);
  const scrollRef = useRef(null);

  // Load file list when panel opens
  useEffect(() => {
    if (!isOpen || !window.electronAPI) return;
    window.electronAPI.getLogFiles().then(setLogFiles);
  }, [isOpen]);

  // Subscribe to live log entries always (accumulate even when panel is closed)
  useEffect(() => {
    if (!window.electronAPI) return;
    const handler = (entry) => setLiveEntries((prev) => [...prev, entry]);
    window.electronAPI.onLogEntry(handler);
    return () => window.electronAPI.offLogEntry(handler);
  }, []);

  // Load file content when selection changes
  useEffect(() => {
    if (!isOpen || selectedFile === 'live' || !window.electronAPI) return;
    window.electronAPI.readLogFile(selectedFile).then((text) => {
      setFileEntries(parseLogContent(text || ''));
    });
  }, [isOpen, selectedFile]);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveEntries, fileEntries, isOpen]);

  const entries = selectedFile === 'live' ? liveEntries : fileEntries;

  const handleDelete = async () => {
    if (selectedFile === 'live' || !window.electronAPI) return;
    await window.electronAPI.deleteLogFile(selectedFile);
    setLogFiles((prev) => prev.filter((f) => f !== selectedFile));
    setSelectedFile('live');
    setFileEntries([]);
  };

  const handleExport = async () => {
    if (!window.electronAPI) return;
    let content;
    if (selectedFile === 'live') {
      content = liveEntries.map((e) => `${e.timestamp} [${e.tag}] ${e.message}`).join('\n');
    } else {
      content = await window.electronAPI.readLogFile(selectedFile);
    }
    if (content) {
      await window.electronAPI.saveFile({
        content,
        defaultName: selectedFile === 'live' ? 'live.log' : selectedFile,
        filters: [{ name: 'Log', extensions: ['log'] }],
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <select
          className="log-file-select"
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
        >
          <option value="live">Live</option>
          {logFiles.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        {selectedFile === 'live' && <span className="log-live-dot" title="Live" />}
        <button className="log-header-btn" title="Export log" onClick={handleExport}>⬇</button>
        {selectedFile === 'live'
          ? <button className="log-header-btn" title="Clear live log" onClick={() => setLiveEntries([])}>⌫</button>
          : <button className="log-header-btn log-header-danger" title="Delete log file" onClick={handleDelete}>✕</button>
        }
        <button className="log-close-btn" title="Close logs" onClick={onToggle}>×</button>
      </div>
      <div className="log-entries" ref={scrollRef}>
        {entries.length === 0
          ? <div className="log-empty">No entries</div>
          : entries.map((e, i) => <LogEntry key={i} entry={e} />)
        }
      </div>
    </div>
  );
}

// ── GraphOutput ──────────────────────────────────────────────────────────────

function GraphOutput({ config }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  // Destroy on unmount only
  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) {
      // In-place update — avoids recreate flicker for live charts
      try {
        chartRef.current.data = config.data;
        if (config.options) chartRef.current.options = config.options;
        chartRef.current.update('active');
        return;
      } catch {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    }
    try {
      chartRef.current = new Chart(canvasRef.current, config);
    } catch (e) {
      console.error('Chart.js error:', e);
    }
  }, [config]);

  return (
    <div className="graph-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}

// ── CellOutput ───────────────────────────────────────────────────────────────

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

function OutputBlock({ msg, index }) {
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
    }
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
      {inner}
    </div>
  );
}

function CellOutput({ messages }) {
  if (!messages || messages.length === 0) return null;
  return (
    <div className="cell-output">
      {messages.map((msg, i) => <OutputBlock key={msg.handleId || i} msg={msg} index={i} />)}
    </div>
  );
}

// ── CellControls (shared move + delete-with-confirm) ─────────────────────────

function CellControls({ onMoveUp, onMoveDown, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (confirming) {
    return (
      <>
        <span className="delete-confirm-label">Delete?</span>
        <button className="cell-ctrl-btn cell-ctrl-danger" title="Confirm delete" onClick={onDelete}>✓</button>
        <button className="cell-ctrl-btn" title="Cancel" onClick={() => setConfirming(false)}>✕</button>
      </>
    );
  }

  return (
    <>
      <button className="cell-ctrl-btn" title="Move Up" onClick={onMoveUp}>↑</button>
      <button className="cell-ctrl-btn" title="Move Down" onClick={onMoveDown}>↓</button>
      <button className="cell-ctrl-btn" title="Delete" onClick={() => setConfirming(true)}>✕</button>
    </>
  );
}

// ── MarkdownCell ─────────────────────────────────────────────────────────────

function MarkdownCell({ cell, onUpdate, onDelete, onMoveUp, onMoveDown }) {
  const [editing, setEditing] = useState(!cell.content);
  const [draft, setDraft] = useState(cell.content);

  const enterEdit = () => {
    setDraft(cell.content);
    setEditing(true);
  };

  const handleOk = () => {
    onUpdate(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(cell.content);
    setEditing(false);
  };

  const renderedHtml = useMemo(
    () => cell.content ? marked.parse(cell.content) : '',
    [cell.content]
  );

  return (
    <div className="cell markdown-cell">
      <div className="cell-controls">
        <CellControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
      </div>
      {editing ? (
        <div onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}>
          <CodeEditor
            value={draft}
            onChange={setDraft}
            language="markdown"
            onCtrlEnter={handleOk}
          />
          <div className="md-edit-actions">
            <button className="md-action-btn md-ok-btn" onClick={handleOk} title="Commit (Ctrl+Enter)">OK</button>
            <button className="md-action-btn md-cancel-btn" onClick={handleCancel} title="Discard (Escape)">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="markdown-render-wrap" onDoubleClick={enterEdit}>
          <div
            className="markdown-render"
            dangerouslySetInnerHTML={{ __html: renderedHtml || '<span class="markdown-placeholder">Double-click or click Edit to write markdown…</span>' }}
          />
          <div className="md-view-actions">
            <button className="md-action-btn md-edit-btn" onClick={enterEdit} title="Edit">Edit</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CodeCell ─────────────────────────────────────────────────────────────────

function CodeCell({
  cell,
  outputs,
  isRunning,
  onUpdate,
  onRun,
  onDelete,
  onMoveUp,
  onMoveDown,
  onOutputModeChange,
  onToggleLock,
  requestCompletions,
  requestLint,
}) {
  const outputMode = cell.outputMode || 'auto';
  const locked = cell.locked || false;
  return (
    <div className={`cell code-cell${isRunning ? ' running' : ''}${locked ? ' cell-locked' : ''}`}>
      <div className="code-cell-header">
        <span className="cell-lang-label">C#</span>
        <button
          className="run-btn"
          onClick={onRun}
          disabled={isRunning}
          title="Run (Ctrl+Enter)"
        >
          {isRunning ? '◼ Running' : '▶ Run'}
        </button>
        {isRunning && <span className="running-spinner">executing…</span>}
        <div className="header-right">
          <label className="output-mode-label">output</label>
          <select
            className="output-mode-select"
            value={outputMode}
            onChange={(e) => onOutputModeChange(e.target.value)}
            title="Output mode"
          >
            <option value="auto">auto</option>
            <option value="text">text</option>
            <option value="html">html</option>
            <option value="table">table</option>
            <option value="graph">graph</option>
          </select>
          <CellControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} />
        </div>
      </div>
      <CodeEditor
        value={cell.content}
        onChange={(val) => onUpdate(val)}
        language="csharp"
        onCtrlEnter={onRun}
        onRequestCompletions={requestCompletions}
        onRequestLint={requestLint}
        readOnly={locked}
      />
      <CellOutput messages={outputs} />
      <button
        className={`cell-lock-btn${locked ? ' cell-lock-btn-on' : ''}`}
        onClick={onToggleLock}
        title={locked ? 'Unlock cell' : 'Lock cell (read-only)'}
      >
        {locked ? '🔒' : '🔓'}
      </button>
    </div>
  );
}

// ── AddBar ───────────────────────────────────────────────────────────────────

function AddBar({ onAddMarkdown, onAddCode }) {
  return (
    <div className="cell-add-bar">
      <div className="cell-add-bar-inner">
        <button className="cell-add-btn" onClick={onAddMarkdown}>+ Markdown</button>
        <button className="cell-add-btn" onClick={onAddCode}>+ Code</button>
      </div>
    </div>
  );
}

// ── NuGet Panel ──────────────────────────────────────────────────────────────

const DEFAULT_NUGET_SOURCES = [
  { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
];

const NUGET_STATUS_ICONS = {
  pending: { icon: '○', cls: 'nuget-dot-pending', title: 'Will load on kernel start' },
  loading: { icon: '⟳', cls: 'nuget-dot-loading', title: 'Loading…' },
  loaded:  { icon: '✓', cls: 'nuget-dot-loaded',  title: 'Loaded' },
  error:   { icon: '✕', cls: 'nuget-dot-error',   title: 'Error' },
};

function NugetStatusDot({ status, error }) {
  const s = NUGET_STATUS_ICONS[status] || NUGET_STATUS_ICONS.pending;
  return <span className={`nuget-dot ${s.cls}`} title={status === 'error' && error ? error : s.title}>{s.icon}</span>;
}

function formatDownloads(n) {
  if (!n) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

// Resolve the SearchQueryService URL from a NuGet v3 service index
const _serviceIndexCache = {};
async function resolveSearchEndpoint(sourceUrl) {
  if (_serviceIndexCache[sourceUrl] !== undefined) return _serviceIndexCache[sourceUrl];
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(6000) });
    const index = await res.json();
    const resource = (index.resources || []).find((r) =>
      typeof r['@type'] === 'string' && r['@type'].startsWith('SearchQueryService')
    );
    _serviceIndexCache[sourceUrl] = resource?.['@id'] ?? null;
  } catch {
    _serviceIndexCache[sourceUrl] = null;
  }
  return _serviceIndexCache[sourceUrl];
}

async function searchNuget(sources, query) {
  const enabled = sources.filter((s) => s.enabled);
  const results = [];
  const seen = new Set();
  await Promise.all(enabled.map(async (source) => {
    const searchUrl = await resolveSearchEndpoint(source.url);
    if (!searchUrl) return;
    try {
      const res = await fetch(
        `${searchUrl}?q=${encodeURIComponent(query)}&take=25&prerelease=false`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      for (const pkg of (data.data || [])) {
        const key = pkg.id.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ id: pkg.id, version: pkg.version, description: pkg.description,
                         totalDownloads: pkg.totalDownloads, source: source.name });
        }
      }
    } catch { /* source unavailable */ }
  }));
  return results;
}

// ── Installed tab ─────────────────────────────────────────────────────────────

function InstalledTab({ packages, kernelStatus, onAdd, onRemove, onRetry }) {
  const [newId, setNewId] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const idRef = useRef(null);
  const isReady = kernelStatus === 'ready';

  const handleAdd = () => {
    const id = newId.trim();
    if (!id) return;
    onAdd(id, newVersion.trim() || null);
    setNewId(''); setNewVersion('');
    idRef.current?.focus();
  };

  return (
    <div className="nuget-tab-content">
      <div className="nuget-list">
        {packages.length === 0 && <span className="nuget-empty">No startup packages — add one below or browse</span>}
        {packages.map((pkg) => (
          <div key={pkg.id} className="nuget-item">
            <NugetStatusDot status={pkg.status} error={pkg.error} />
            <span className="nuget-id">{pkg.id}</span>
            <span className="nuget-version">{pkg.version || 'latest'}</span>
            {pkg.status === 'error' && (
              <button className="nuget-action-btn" title={`Retry: ${pkg.error || ''}`}
                onClick={() => onRetry(pkg.id, pkg.version)}>↺</button>
            )}
            {pkg.status === 'pending' && isReady && (
              <button className="nuget-action-btn" title="Install now"
                onClick={() => onRetry(pkg.id, pkg.version)}>▶</button>
            )}
            <button className="nuget-remove-btn" title="Remove" onClick={() => onRemove(pkg.id)}>×</button>
          </div>
        ))}
      </div>
      <div className="nuget-add-row">
        <input ref={idRef} className="nuget-input nuget-id-input" placeholder="Package ID"
          value={newId} onChange={(e) => setNewId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
        <input className="nuget-input nuget-ver-input" placeholder="Version"
          value={newVersion} onChange={(e) => setNewVersion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
        <button className="nuget-add-btn" onClick={handleAdd}>{isReady ? '▶ Install' : '+ Add'}</button>
      </div>
    </div>
  );
}

// ── Browse tab ────────────────────────────────────────────────────────────────

function BrowseTab({ sources, onAdd, installedPackages }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true); setSearchError(null);
    try {
      setResults(await searchNuget(sources, q));
    } catch (e) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const isInstalled = (id) => installedPackages.some((p) => p.id.toLowerCase() === id.toLowerCase());

  return (
    <div className="nuget-tab-content">
      <div className="nuget-search-bar">
        <input className="nuget-input nuget-search-input" placeholder="Search packages…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()} spellCheck={false} />
        <button className="nuget-search-btn" onClick={doSearch} disabled={searching}>
          {searching ? '…' : '⌕'}
        </button>
      </div>
      <div className="nuget-results">
        {searchError && <div className="nuget-search-error">{searchError}</div>}
        {!searchError && results.length === 0 && !searching && (
          <div className="nuget-empty">{query.trim() ? 'No results' : 'Type a package name above and press Enter'}</div>
        )}
        {results.map((pkg) => {
          const installed = isInstalled(pkg.id);
          return (
            <div key={pkg.id} className="nuget-result-item">
              <div className="nuget-result-main">
                <span className="nuget-result-id">{pkg.id}</span>
                <span className="nuget-result-version">{pkg.version}</span>
                {pkg.totalDownloads > 0 && (
                  <span className="nuget-result-dl" title={`${pkg.totalDownloads.toLocaleString()} downloads`}>
                    ↓{formatDownloads(pkg.totalDownloads)}
                  </span>
                )}
                <button
                  className={`nuget-result-add${installed ? ' nuget-result-added' : ''}`}
                  onClick={() => !installed && onAdd(pkg.id, pkg.version)}
                  title={installed ? 'Already added' : `Add ${pkg.id} ${pkg.version}`}
                >
                  {installed ? '✓' : '+ Add'}
                </button>
              </div>
              {pkg.description && <div className="nuget-result-desc">{pkg.description}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sources tab ───────────────────────────────────────────────────────────────

function SourcesTab({ sources, onAdd, onRemove, onToggle }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) return;
    onAdd(name.trim(), url.trim());
    setName(''); setUrl('');
  };

  return (
    <div className="nuget-tab-content">
      <div className="nuget-sources-list">
        {sources.map((s) => (
          <div key={s.url} className="nuget-source-item">
            <input type="checkbox" className="nuget-source-check" checked={s.enabled}
              onChange={() => onToggle(s.url)} />
            <span className="nuget-source-name">{s.name}</span>
            <span className="nuget-source-url">{s.url}</span>
            <button className="nuget-remove-btn" title="Remove source" onClick={() => onRemove(s.url)}>×</button>
          </div>
        ))}
      </div>
      <div className="nuget-add-row">
        <input className="nuget-input" style={{ width: 90 }} placeholder="Name"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
        <input className="nuget-input" style={{ flex: 1 }} placeholder="Feed URL (v3 index.json)"
          value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
        <button className="nuget-add-btn" onClick={handleAdd}>+ Add</button>
      </div>
    </div>
  );
}

// ── NuGet Panel (tabbed) ──────────────────────────────────────────────────────

function NugetPanel({ isOpen, onToggle, packages, kernelStatus, sources,
                      onAdd, onRemove, onRetry,
                      onAddSource, onRemoveSource, onToggleSource }) {
  const [tab, setTab] = useState('installed');
  if (!isOpen) return null;

  return (
    <div className="nuget-panel">
      <div className="nuget-panel-header">
        <div className="nuget-tabs">
          {['installed', 'browse'].map((t) => (
            <button key={t} className={`nuget-tab${tab === t ? ' nuget-tab-active' : ''}`}
              onClick={() => setTab(t)}>
              {t === 'installed' ? 'Installed' : 'Browse'}
            </button>
          ))}
        </div>
        <div className="nuget-kernel-badge" style={{ color: kernelStatus === 'ready' ? '#4ec9b0' : '#888' }}>
          kernel {kernelStatus}
        </div>
        <button
          className={`nuget-sources-btn${tab === 'sources' ? ' nuget-sources-btn-active' : ''}`}
          onClick={() => setTab((prev) => prev === 'sources' ? 'installed' : 'sources')}
          title="Configure NuGet sources"
        >⚙</button>
        <button className="nuget-close-btn" onClick={onToggle} title="Close">×</button>
      </div>
      <div className="nuget-body">
        {tab === 'installed' && (
          <InstalledTab packages={packages} kernelStatus={kernelStatus}
            onAdd={onAdd} onRemove={onRemove} onRetry={onRetry} />
        )}
        {tab === 'browse' && (
          <BrowseTab sources={sources} onAdd={onAdd} installedPackages={packages} />
        )}
        {tab === 'sources' && (
          <SourcesTab sources={sources}
            onAdd={onAddSource} onRemove={onRemoveSource} onToggle={onToggleSource} />
        )}
      </div>
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({
  kernelStatus,
  notebookPath,
  onRunAll,
  onAddMarkdown,
  onAddCode,
  onSave,
  onLoad,
  onReset,
  logPanelOpen,
  onToggleLogs,
  nugetPanelOpen,
  onToggleNuget,
}) {
  const filename = notebookPath
    ? notebookPath.split(/[\\/]/).pop()
    : 'Untitled Notebook';

  return (
    <div className="toolbar">
      <span className="toolbar-title">{filename}</span>
      <div className="toolbar-separator" />
      <button onClick={onRunAll} title="Run all code cells">▶▶ Run All</button>
      <button onClick={onAddMarkdown} title="Add markdown cell">+ Markdown</button>
      <button onClick={onAddCode} title="Add code cell">+ Code</button>
      <div className="toolbar-separator" />
      <button onClick={onSave} title="Save notebook">Save</button>
      <button onClick={onLoad} title="Open notebook">Open</button>
      <div className="toolbar-separator" />
      <button onClick={onReset} title="Reset kernel state">Reset Kernel</button>
      <div className="toolbar-separator" />
      <button
        onClick={onToggleNuget}
        title="Toggle NuGet panel"
        style={nugetPanelOpen ? { background: '#094771', borderColor: '#0e639c' } : undefined}
      >
        Packages
      </button>
      <button
        onClick={onToggleLogs}
        title="Toggle log panel"
        style={logPanelOpen ? { background: '#094771', borderColor: '#0e639c' } : undefined}
      >
        Logs
      </button>
      <div className="kernel-status">
        <div className={`kernel-dot ${kernelStatus}`} />
        <span>{kernelStatus}</span>
      </div>
    </div>
  );
}

// ── Example notebook ─────────────────────────────────────────────────────────

function makeExampleCells() {
  const md = (content) => makeCell('markdown', content);
  const cs = (content, outputMode = 'auto') =>
    ({ ...makeCell('code', content), outputMode });

  return [
    md(`# Notebook

An interactive C# notebook. Press **Ctrl+Enter** to run a cell, or click **▶ Run**.

| Feature | Syntax |
|---------|--------|
| Console output | \`Console.WriteLine("hello")\` |
| HTML | \`Display.Html("<b>bold</b>")\` |
| Table | \`Display.Table(rows)\` · \`.DisplayTable()\` |
| Chart | \`Display.Graph(chartJsConfig)\` |
| NuGet | \`#r "nuget: Package, Version"\` |
| Logging | \`value.Log()\` · \`value.Log("label")\` |
| Auto-render | Return a value — type is detected automatically |`),

    md('## 1 · Basic C#'),

    cs(`// Variables, interpolation, LINQ
var name = "Polyglot";
var version = 1.0;
Console.WriteLine($"Hello from {name} v{version}!");

var numbers = Enumerable.Range(1, 10).ToList();
var evens   = numbers.Where(n => n % 2 == 0).ToList();
Console.WriteLine($"Evens: {string.Join(", ", evens)}");

// Returning a value auto-renders it
DateTime.Now`),

    md('## 2 · HTML & Tables'),

    cs(`Display.Html(@"
  <h3 style='color:#4ec9b0;margin:0 0 6px'>Rich HTML output</h3>
  <p>Render <strong>any HTML</strong> — styled text, lists, badges, whatever you need.</p>
");

var products = new[] {
  new { Product = "Widget A", Price = 9.99,  Units = 142 },
  new { Product = "Widget B", Price = 24.99, Units = 87  },
  new { Product = "Widget C", Price = 4.99,  Units = 321 },
};
Display.Table(products);`),

    md('## 3 · Extension Methods'),

    cs(`// .Display() auto-detects type
"Extension methods work directly on any object!".Display();

// Array of objects → table via extension method
var cities = new[] {
  new { City = "Athens",  Country = "Greece",  Pop = 3_153_000 },
  new { City = "Berlin",  Country = "Germany", Pop = 3_645_000 },
  new { City = "Paris",   Country = "France",  Pop = 2_161_000 },
  new { City = "Lisbon",  Country = "Portugal",Pop = 2_957_000 },
};
cities.DisplayTable();`),

    md(`## 4 · NuGet Packages

Use \`#r "nuget: PackageName, Version"\` to load any NuGet package inline.
The first run downloads and caches it; subsequent runs are instant.`),

    cs(`#r "nuget: Newtonsoft.Json, 13.0.3"
using Newtonsoft.Json;

var payload = new {
  name         = "Ada Lovelace",
  born         = 1815,
  contributions = new[] { "First algorithm", "Analytical Engine notes" },
};

var json = JsonConvert.SerializeObject(payload, Formatting.Indented);
Display.Html($"<pre style='color:#9cdcfe;margin:0'>{json}</pre>");`),

    md('## 5 · Charts'),

    cs(`// Return a Chart.js config object — set output mode to "graph"
new {
  type = "line",
  data = new {
    labels   = new[] { "Jan","Feb","Mar","Apr","May","Jun" },
    datasets = new[] {
      new {
        label           = "Revenue ($k)",
        data            = new[] { 42, 58, 51, 74, 83, 91 },
        borderColor     = "rgba(78,201,176,1)",
        backgroundColor = "rgba(78,201,176,0.1)",
        tension         = 0.3,
        fill            = true,
      },
      new {
        label           = "Costs ($k)",
        data            = new[] { 31, 35, 38, 40, 45, 48 },
        borderColor     = "rgba(244,71,71,0.8)",
        backgroundColor = "rgba(244,71,71,0.05)",
        tension         = 0.3,
        fill            = true,
      },
    },
  },
  options = new {
    responsive = true,
    plugins    = new {
      title = new { display = true, text = "Revenue vs Costs 2024" },
    },
  },
}`, 'graph'),

    md('## 6 · CSV'),

    cs(`// Parse and render CSV inline
Display.Csv("Name,Score,Grade\\nAlice,95,A\\nBob,82,B\\nCharlie,78,C+\\nDiana,91,A-");`),

    md(`## 7 · Live Updates

\`Display.NewHtml()\`, \`NewTable()\`, and \`NewGraph()\` return a **handle** whose \`Update*\` methods
replace the output in-place while the cell is still running — useful for progress indicators,
streaming results, and live charts.`),

    cs(`// Animated progress bar
string Bar(int pct) => $@"<div style='font-family:sans-serif;padding:2px 0'>
  <div style='background:#3c3c3c;border-radius:3px;height:16px'>
    <div style='background:#0e639c;height:16px;border-radius:3px;width:{pct}%;transition:width 0.1s'></div>
  </div>
  <p style='color:#888;font-size:11px;margin:3px 0 0'>{pct}%</p>
</div>";

var progress = Display.NewHtml(Bar(0));
for (int i = 1; i <= 20; i++) {
    await Task.Delay(80);
    progress.UpdateHtml(Bar(i * 5));
}
progress.UpdateHtml("<span style='color:#4ec9b0;font-weight:600'>✓ Complete!</span>");`),

    cs(`// Live chart — data updates in-place without flicker
var rng = new Random(42);
int[] vals = { 30, 50, 40, 60, 45 };
var labels = new[] { "A", "B", "C", "D", "E" };

var chart = Display.NewGraph(new {
    type = "bar",
    data = new {
        labels,
        datasets = new[] { new {
            label = "Live data",
            data = vals,
            backgroundColor = "rgba(86,156,214,0.7)",
        }},
    },
    options = new { responsive = true, animation = new { duration = 150 } },
});

for (int frame = 0; frame < 15; frame++) {
    await Task.Delay(250);
    for (int j = 0; j < vals.Length; j++)
        vals[j] = Math.Clamp(vals[j] + rng.Next(-15, 16), 5, 100);
    chart.UpdateGraph(new {
        type = "bar",
        data = new {
            labels,
            datasets = new[] { new {
                label = "Live data",
                data = (int[])vals.Clone(),
                backgroundColor = "rgba(86,156,214,0.7)",
            }},
        },
        options = new { responsive = true, animation = new { duration = 150 } },
    });
}`, 'graph'),

    md(`## 8 · Logging

\`.Log()\` writes an entry to the **Logs panel** (open it with the **Logs** button in the toolbar)
and to a daily rotating file in \`logs/YYYY-MM-DD.log\` beside the app.

- \`value.Log()\` — logs the value and returns it, so it can be chained inline
- \`value.Log("label")\` — prefixes the entry with a label
- Entries tagged **USER** appear in teal; notebook activity tagged **NOTEBOOK** appears in blue`),

    cs(`// Plain string
"Starting data pipeline".Log();

// Label + value (returns the value, so chaining works)
var threshold = 0.75.Log("threshold");

// Log inside a LINQ chain without breaking it
var scores = new[] { 0.42, 0.81, 0.67, 0.91, 0.55 };
var passing = scores
    .Where(s => s >= threshold)
    .Select(s => s.Log("pass"))   // logs each passing score
    .ToList();

// Log a complex object — serialised to JSON automatically
var summary = new { Total = scores.Length, Passing = passing.Count, Threshold = threshold };
summary.Log("summary");

// Display the result too
Display.Html($@"<p style='color:#4ec9b0'>
  {passing.Count} of {scores.Length} scores passed (threshold {threshold:P0})
</p>");`),

    cs(`// Logging inside an async loop — useful for tracking long-running work
var results = new List<(int Step, double Value)>();
var rng2 = new Random(7);

for (int i = 1; i <= 8; i++) {
    await Task.Delay(120);
    var v = Math.Round(rng2.NextDouble() * 100, 1);
    results.Add((i, v));
    $"step {i}: {v}".Log("loop");
}

results.DisplayTable();`),
  ];
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [cells, setCells] = useState(makeExampleCells);
  const [outputs, setOutputs] = useState({});
  const [runningCells, setRunningCells] = useState(new Set());
  const [kernelStatus, setKernelStatus] = useState('starting');
  const [notebookPath, setNotebookPath] = useState(null);
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [nugetPanelOpen, setNugetPanelOpen] = useState(false);
  const [nugetPackages, setNugetPackages] = useState([]);
  const [nugetSources, setNugetSources] = useState(DEFAULT_NUGET_SOURCES);

  // Refs so callbacks can read current state without stale closure
  const nugetPackagesRef = useRef(nugetPackages);
  useEffect(() => { nugetPackagesRef.current = nugetPackages; }, [nugetPackages]);
  const nugetSourcesRef = useRef(nugetSources);
  useEffect(() => { nugetSourcesRef.current = nugetSources; }, [nugetSources]);

  // When kernel becomes ready, preload any pending packages
  useEffect(() => {
    if (kernelStatus !== 'ready') return;
    const pending = nugetPackagesRef.current.filter((p) => p.status === 'pending');
    if (!pending.length || !window.electronAPI) return;
    setNugetPackages((prev) => prev.map((p) =>
      p.status === 'pending' ? { ...p, status: 'loading' } : p
    ));
    window.electronAPI.sendToKernel({
      type: 'preload_nugets',
      packages: pending.map(({ id, version }) => ({ id, version })),
      sources: nugetSourcesRef.current.filter((s) => s.enabled).map((s) => s.url),
    });
  }, [kernelStatus]);

  // Apply font size changes from main process
  useEffect(() => {
    if (!window.electronAPI?.onFontSizeChange) return;
    window.electronAPI.onFontSizeChange((size) => {
      document.documentElement.style.setProperty('--base-font-size', String(size));
    });
  }, []);

  // Queue of cells waiting to run (for Run All)
  const runQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);

  // Track pending execute completions
  const pendingResolversRef = useRef({});
  const pendingCompletionsRef = useRef({});
  const pendingLintRef = useRef({});

  useEffect(() => {
    if (!window.electronAPI) return;

    const handler = (msg) => {
      switch (msg.type) {
        case 'ready':
          setKernelStatus('ready');
          break;

        case 'stdout':
          setOutputs((prev) => ({
            ...prev,
            [msg.id]: [...(prev[msg.id] || []), msg],
          }));
          break;

        case 'display':
          if (msg.update && msg.handleId) {
            // Replace the existing slot with matching handleId
            setOutputs((prev) => ({
              ...prev,
              [msg.id]: (prev[msg.id] || []).map((m) =>
                m.handleId === msg.handleId ? msg : m
              ),
            }));
          } else {
            setOutputs((prev) => ({
              ...prev,
              [msg.id]: [...(prev[msg.id] || []), msg],
            }));
          }
          break;

        case 'error':
          if (msg.id) {
            setOutputs((prev) => ({
              ...prev,
              [msg.id]: [...(prev[msg.id] || []), msg],
            }));
          } else {
            // Kernel-level error
            setKernelStatus('error');
          }
          break;

        case 'complete': {
          const resolve = pendingResolversRef.current[msg.id];
          if (resolve) {
            delete pendingResolversRef.current[msg.id];
            resolve(msg);
          }
          setRunningCells((prev) => {
            const next = new Set(prev);
            next.delete(msg.id);
            return next;
          });
          break;
        }

        case 'autocomplete_result': {
          const resolve = pendingCompletionsRef.current[msg.requestId];
          if (resolve) {
            delete pendingCompletionsRef.current[msg.requestId];
            resolve(msg.items || []);
          }
          break;
        }

        case 'lint_result': {
          const resolve = pendingLintRef.current[msg.requestId];
          if (resolve) {
            delete pendingLintRef.current[msg.requestId];
            resolve(msg.diagnostics || []);
          }
          break;
        }

        case 'nuget_status':
          setNugetPackages((prev) => prev.map((p) =>
            p.id === msg.id
              ? { ...p, status: msg.status, ...(msg.message ? { error: msg.message } : { error: undefined }) }
              : p
          ));
          break;

        case 'nuget_preload_complete':
          break;

        case 'reset_complete':
          setKernelStatus('ready');
          break;

        default:
          break;
      }
    };

    window.electronAPI.onKernelMessage(handler);
    return () => window.electronAPI.offKernelMessage(handler);
  }, []);

  const runCell = useCallback((cell) => {
    if (!window.electronAPI || cell.type !== 'code') return;

    return new Promise((resolve) => {
      // Clear previous outputs
      setOutputs((prev) => ({ ...prev, [cell.id]: [] }));
      setRunningCells((prev) => new Set([...prev, cell.id]));

      pendingResolversRef.current[cell.id] = resolve;
      window.electronAPI.sendToKernel({
        type: 'execute',
        id: cell.id,
        code: cell.content,
        outputMode: cell.outputMode || 'auto',
        sources: nugetSourcesRef.current.filter((s) => s.enabled).map((s) => s.url),
      });
    });
  }, []);

  const runAll = useCallback(async () => {
    const codeCells = cells.filter((c) => c.type === 'code');
    for (const cell of codeCells) {
      await runCell(cell);
    }
  }, [cells, runCell]);

  const addCell = useCallback((type, afterIndex = -1) => {
    const newCell = makeCell(type, '');
    setCells((prev) => {
      const next = [...prev];
      const idx = afterIndex >= 0 ? afterIndex + 1 : next.length;
      next.splice(idx, 0, newCell);
      return next;
    });
  }, []);

  const updateCell = useCallback((id, content) => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, content } : c)));
  }, []);

  const updateCellProp = useCallback((id, prop, value) => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, [prop]: value } : c)));
  }, []);

  const deleteCell = useCallback((id) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
    setOutputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const moveCell = useCallback((id, dir) => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }, []);

  const buildNotebookData = useCallback(() => ({
    version: '1.0',
    title: notebookPath ? notebookPath.split(/[\\/]/).pop().replace('.polyglot', '') : 'notebook',
    packages: nugetPackages.map(({ id, version }) => ({ id, version: version || null })),
    sources: nugetSources,
    cells: cells.map(({ id, type, content, outputMode, locked }) => ({ id, type, content, ...(type === 'code' ? { outputMode: outputMode || 'auto', locked: locked || false } : {}) })),
  }), [cells, notebookPath, nugetPackages, nugetSources]);

  // File > Save — writes to current path if known, else prompts
  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return;
    const data = buildNotebookData();
    if (notebookPath) {
      await window.electronAPI.saveNotebookTo(notebookPath, data);
    } else {
      const result = await window.electronAPI.saveNotebook(data);
      if (result.success) setNotebookPath(result.filePath);
    }
  }, [buildNotebookData, notebookPath]);

  // File > Save As — always prompts
  const handleSaveAs = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.saveNotebook(buildNotebookData());
    if (result.success) setNotebookPath(result.filePath);
  }, [buildNotebookData]);

  const handleLoad = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.loadNotebook();
    if (result.success && result.data) {
      const loadedPkgs = (result.data.packages || []).map((p) => ({ ...p, status: 'pending' }));
      const loadedSources = result.data.sources || DEFAULT_NUGET_SOURCES;
      setCells(result.data.cells || []);
      setOutputs({});
      setNotebookPath(result.filePath);
      setNugetPackages(loadedPkgs);
      setNugetSources(loadedSources);
      // If kernel is already ready, kick off preload immediately
      if (kernelStatus === 'ready' && loadedPkgs.length > 0) {
        setNugetPackages(loadedPkgs.map((p) => ({ ...p, status: 'loading' })));
        window.electronAPI.sendToKernel({
          type: 'preload_nugets',
          packages: loadedPkgs.map(({ id, version }) => ({ id, version })),
          sources: loadedSources.filter((s) => s.enabled).map((s) => s.url),
        });
      }
    }
  }, [kernelStatus]);

  const handleReset = useCallback(() => {
    if (!window.electronAPI) return;
    setKernelStatus('starting');
    setOutputs({});
    setRunningCells(new Set());
    pendingResolversRef.current = {};
    window.electronAPI.resetKernel();
  }, []);

  const addNugetPackage = useCallback((id, version) => {
    const isReady = kernelStatus === 'ready';
    setNugetPackages((prev) => {
      if (prev.some((p) => p.id.toLowerCase() === id.toLowerCase())) return prev;
      return [...prev, { id, version: version || null, status: isReady ? 'loading' : 'pending' }];
    });
    if (isReady && window.electronAPI) {
      window.electronAPI.sendToKernel({
        type: 'preload_nugets',
        packages: [{ id, version: version || null }],
        sources: nugetSourcesRef.current.filter((s) => s.enabled).map((s) => s.url),
      });
    }
  }, [kernelStatus]);

  const removeNugetPackage = useCallback((id) => {
    setNugetPackages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const retryNugetPackage = useCallback((id, version) => {
    if (!window.electronAPI) return;
    setNugetPackages((prev) => prev.map((p) =>
      p.id === id ? { ...p, status: 'loading', error: undefined } : p
    ));
    window.electronAPI.sendToKernel({
      type: 'preload_nugets',
      packages: [{ id, version: version || null }],
      sources: nugetSourcesRef.current.filter((s) => s.enabled).map((s) => s.url),
    });
  }, []);

  const addNugetSource = useCallback((name, url) => {
    setNugetSources((prev) => {
      if (prev.some((s) => s.url === url)) return prev;
      return [...prev, { name, url, enabled: true }];
    });
  }, []);

  const removeNugetSource = useCallback((url) => {
    setNugetSources((prev) => prev.filter((s) => s.url !== url));
  }, []);

  const toggleNugetSource = useCallback((url) => {
    setNugetSources((prev) => prev.map((s) => s.url === url ? { ...s, enabled: !s.enabled } : s));
  }, []);

  const requestCompletions = useCallback((code, position) => {
    return new Promise((resolve) => {
      if (!window.electronAPI) return resolve([]);
      const requestId = uuidv4();
      pendingCompletionsRef.current[requestId] = resolve;
      window.electronAPI.sendToKernel({ type: 'autocomplete', requestId, code, position });
      setTimeout(() => {
        if (pendingCompletionsRef.current[requestId]) {
          delete pendingCompletionsRef.current[requestId];
          resolve([]);
        }
      }, 2000);
    });
  }, []);

  const requestLint = useCallback((code) => {
    return new Promise((resolve) => {
      if (!window.electronAPI) return resolve([]);
      const requestId = uuidv4();
      pendingLintRef.current[requestId] = resolve;
      window.electronAPI.sendToKernel({ type: 'lint', requestId, code });
      setTimeout(() => {
        if (pendingLintRef.current[requestId]) {
          delete pendingLintRef.current[requestId];
          resolve([]);
        }
      }, 5000);
    });
  }, []);

  const handleNew = useCallback(() => {
    if (cells.length > 0 && !window.confirm('Create a new notebook? Unsaved changes will be lost.')) return;
    setCells([]);
    setOutputs({});
    setRunningCells(new Set());
    setNotebookPath(null);
    setNugetPackages([]);
    setNugetSources(DEFAULT_NUGET_SOURCES);
    pendingResolversRef.current = {};
  }, [cells]);

  const clearAllOutputs = useCallback(() => setOutputs({}), []);

  // Menu action dispatch — use a ref so the handler always sees fresh callbacks
  const menuHandlersRef = useRef({});
  menuHandlersRef.current = {
    new: handleNew,
    open: handleLoad,
    save: handleSave,
    'save-as': handleSaveAs,
    'run-all': runAll,
    reset: handleReset,
    'clear-output': clearAllOutputs,
  };

  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return;
    window.electronAPI.onMenuAction((action) => {
      menuHandlersRef.current[action]?.();
    });
  }, []);

  return (
    <div id="app">
      <Toolbar
        kernelStatus={kernelStatus}
        notebookPath={notebookPath}
        onRunAll={runAll}
        onAddMarkdown={() => addCell('markdown')}
        onAddCode={() => addCell('code')}
        onSave={handleSave}
        onLoad={handleLoad}
        onReset={handleReset}
        logPanelOpen={logPanelOpen}
        onToggleLogs={() => setLogPanelOpen((v) => !v)}
        nugetPanelOpen={nugetPanelOpen}
        onToggleNuget={() => setNugetPanelOpen((v) => !v)}
      />
      <div id="main-area">
      <div id="content-area">
      <div className="notebook">
        {cells.length === 0 && (
          <div className="empty-notebook">
            <h2>Empty Notebook</h2>
            <p>Add a markdown or code cell to get started.</p>
          </div>
        )}

        {/* Top add bar */}
        {cells.length > 0 && (
          <AddBar
            onAddMarkdown={() => addCell('markdown', -1)}
            onAddCode={() => addCell('code', -1)}
          />
        )}

        {cells.map((cell, index) => (
          <div key={cell.id} className="cell-wrapper">
            {cell.type === 'markdown' ? (
              <MarkdownCell
                cell={cell}
                onUpdate={(val) => updateCell(cell.id, val)}
                onDelete={() => deleteCell(cell.id)}
                onMoveUp={() => moveCell(cell.id, -1)}
                onMoveDown={() => moveCell(cell.id, 1)}
              />
            ) : (
              <CodeCell
                cell={cell}
                outputs={outputs[cell.id]}
                isRunning={runningCells.has(cell.id)}
                onUpdate={(val) => updateCell(cell.id, val)}
                onRun={() => runCell(cell)}
                onDelete={() => deleteCell(cell.id)}
                onMoveUp={() => moveCell(cell.id, -1)}
                onMoveDown={() => moveCell(cell.id, 1)}
                onOutputModeChange={(mode) => updateCellProp(cell.id, 'outputMode', mode)}
                onToggleLock={() => updateCellProp(cell.id, 'locked', !(cell.locked || false))}
                requestCompletions={requestCompletions}
                requestLint={requestLint}
              />
            )}
            <AddBar
              onAddMarkdown={() => addCell('markdown', index)}
              onAddCode={() => addCell('code', index)}
            />
          </div>
        ))}
      </div>
      <LogPanel isOpen={logPanelOpen} onToggle={() => setLogPanelOpen((v) => !v)} />
      </div>{/* #content-area */}
      <NugetPanel
        isOpen={nugetPanelOpen}
        onToggle={() => setNugetPanelOpen((v) => !v)}
        packages={nugetPackages}
        kernelStatus={kernelStatus}
        sources={nugetSources}
        onAdd={addNugetPackage}
        onRemove={removeNugetPackage}
        onRetry={retryNugetPackage}
        onAddSource={addNugetSource}
        onRemoveSource={removeNugetSource}
        onToggleSource={toggleNugetSource}
      />
      </div>{/* #main-area */}
    </div>
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root'));
root.render(<App />);
