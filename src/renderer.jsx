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
import { EditorState } from '@codemirror/state';
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
  return { id: uuidv4(), type, content, ...(type === 'code' ? { outputMode: 'auto' } : {}) };
}

// ── CodeMirror Editor ────────────────────────────────────────────────────────

function CodeEditor({ value, onChange, language = 'csharp', onCtrlEnter,
                      onRequestCompletions, onRequestLint }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onCtrlEnterRef = useRef(onCtrlEnter);
  const completionsRef = useRef(onRequestCompletions);
  const lintRef = useRef(onRequestLint);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCtrlEnterRef.current = onCtrlEnter; }, [onCtrlEnter]);
  useEffect(() => { completionsRef.current = onRequestCompletions; }, [onRequestCompletions]);
  useEffect(() => { lintRef.current = onRequestLint; }, [onRequestLint]);

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

function MarkdownCell({ cell, onUpdate, onDelete, onMoveUp, onMoveDown, onAddAbove, onAddBelow }) {
  const [editing, setEditing] = useState(!cell.content);

  const handleRenderClick = () => setEditing(true);
  const handleBlur = () => { if (cell.content) setEditing(false); };
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setEditing(false); }
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
      <div onKeyDown={handleKeyDown}>
        {editing ? (
          <CodeEditor
            value={cell.content}
            onChange={(val) => onUpdate(val)}
            language="markdown"
            onCtrlEnter={() => setEditing(false)}
          />
        ) : (
          <div
            className="markdown-render"
            onClick={handleRenderClick}
            dangerouslySetInnerHTML={{ __html: renderedHtml || '<span class="markdown-placeholder">Click to edit markdown...</span>' }}
          />
        )}
      </div>
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
  requestCompletions,
  requestLint,
}) {
  const outputMode = cell.outputMode || 'auto';
  return (
    <div className={`cell code-cell${isRunning ? ' running' : ''}`}>
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
      />
      <CellOutput messages={outputs} />
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
    md(`# Polyglot Notebook

An interactive C# notebook. Press **Ctrl+Enter** to run a cell, or click **▶ Run**.

| Feature | Syntax |
|---------|--------|
| Console output | \`Console.WriteLine("hello")\` |
| HTML | \`Display.Html("<b>bold</b>")\` |
| Table | \`Display.Table(rows)\` · \`.DisplayTable()\` |
| Chart | \`Display.Graph(chartJsConfig)\` |
| NuGet | \`#r "nuget: Package, Version"\` |
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
  ];
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [cells, setCells] = useState(makeExampleCells);
  const [outputs, setOutputs] = useState({});
  const [runningCells, setRunningCells] = useState(new Set());
  const [kernelStatus, setKernelStatus] = useState('starting');
  const [notebookPath, setNotebookPath] = useState(null);

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

  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return;
    const data = {
      version: '1.0',
      title: notebookPath ? notebookPath.split(/[\\/]/).pop().replace('.polyglot', '') : 'notebook',
      cells: cells.map(({ id, type, content, outputMode }) => ({ id, type, content, ...(type === 'code' ? { outputMode: outputMode || 'auto' } : {}) })),
    };
    const result = await window.electronAPI.saveNotebook(data);
    if (result.success) setNotebookPath(result.filePath);
  }, [cells, notebookPath]);

  const handleLoad = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.loadNotebook();
    if (result.success && result.data) {
      setCells(result.data.cells || []);
      setOutputs({});
      setNotebookPath(result.filePath);
    }
  }, []);

  const handleReset = useCallback(() => {
    if (!window.electronAPI) return;
    setKernelStatus('starting');
    setOutputs({});
    setRunningCells(new Set());
    pendingResolversRef.current = {};
    window.electronAPI.resetKernel();
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
      />
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
    </div>
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root'));
root.render(<App />);
