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
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
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

// ── Documentation data ────────────────────────────────────────────────────────

const DOCS_TAB_ID = '__docs__';

const DOCS_SECTIONS = [
  {
    id: 'overview', title: 'Overview',
    content: [
      { type: 'p', text: 'Polyglot Notebook is a desktop notebook application for interactive C# scripting. Notebooks contain an ordered sequence of code and markdown cells that share execution state within a kernel process.' },
      { type: 'h3', text: 'Key Concepts' },
      { type: 'ul', items: [
        'Notebook — a .cnb file containing an ordered list of cells',
        'Cell — a unit of code or markdown content',
        'Kernel — a .NET process that executes C# and persists variables across cells',
        'Tab — each open notebook has its own tab and fully independent kernel process',
      ]},
    ],
  },
  {
    id: 'notebooks', title: 'Notebooks',
    content: [
      { type: 'h3', text: 'Creating a Notebook' },
      { type: 'p', text: 'File → New Notebook (⌘N) or click the + button in the tab bar. A dialog asks whether to start from the Examples template or a blank notebook.' },
      { type: 'h3', text: 'Opening a Notebook' },
      { type: 'p', text: 'File → Open… (⌘O). The notebook always opens in a new tab — your existing tabs are unaffected.' },
      { type: 'h3', text: 'Saving' },
      { type: 'ul', items: [
        'Save (⌘S) — saves to the current file path; prompts for a path if not yet saved',
        'Save As… (⌘⇧S) — always prompts for a new path',
        'An amber • on the tab indicates unsaved changes',
      ]},
      { type: 'h3', text: 'Tabs & Navigation' },
      { type: 'ul', items: [
        'Click a tab to switch to it — the inactive pane stays mounted, preserving scroll position, editor undo history, and all state',
        'Drag a tab left or right to reorder it in the tab bar',
        'Close a tab with the × button; a confirmation appears if there are unsaved changes',
        'If the last tab is closed, a fresh blank notebook is created automatically',
      ]},
      { type: 'h3', text: 'Renaming' },
      { type: 'p', text: 'Double-click the tab title or the notebook title in the toolbar to rename inline. Press Enter or click away to confirm; Escape to cancel. If the notebook has been saved, the file on disk is also renamed. Any characters are allowed in the display title; characters illegal in filenames ( / \\ : * ? " < > | ) are stripped from the saved filename.' },
    ],
  },
  {
    id: 'cells', title: 'Cells',
    content: [
      { type: 'h3', text: 'Cell Types' },
      { type: 'ul', items: [
        'Code cell — C# code, executed by the kernel with persistent state',
        'Markdown cell — rich text: headings, lists, code spans, tables, links, blockquotes',
      ]},
      { type: 'h3', text: 'Adding Cells' },
      { type: 'p', text: 'Hover between any two cells (or above the first cell) to reveal the + Code and + Markdown insert buttons. The toolbar also has Add Markdown and Add Code buttons that append to the end of the notebook.' },
      { type: 'h3', text: 'Moving Cells' },
      { type: 'p', text: 'Hover over a cell to reveal ↑ ↓ arrows in the top-right corner. Click to move the cell one position up or down.' },
      { type: 'h3', text: 'Deleting Cells' },
      { type: 'p', text: 'Hover over a cell to reveal the 🗑 delete button. Click once to enter confirmation mode (button turns red and shows "del?"), then click again to confirm deletion.' },
      { type: 'h3', text: 'Locking Cells' },
      { type: 'p', text: 'Hover over a code cell and click the 🔓 lock icon in the bottom-right to toggle the lock. Locked cells (🔒) display a darker background and cannot be edited. Useful for protecting reference code or read-only examples.' },
      { type: 'h3', text: 'Editing Markdown' },
      { type: 'p', text: 'Click the ✏ pencil button on a rendered markdown cell, or double-click its content, to enter edit mode. Click OK or press Ctrl+Enter to render; click Cancel or press Escape to discard changes.' },
    ],
  },
  {
    id: 'execution', title: 'Running Code',
    content: [
      { type: 'h3', text: 'Running a Single Cell' },
      { type: 'ul', items: [
        'Click the Run button in the cell header',
        'Press Ctrl+Enter (Cmd+Enter on macOS) while the code editor is focused',
      ]},
      { type: 'h3', text: 'Running All Cells' },
      { type: 'ul', items: [
        'Run → Run All Cells (⌘⇧↩)',
        'Cells execute in order from top to bottom',
        'Each cell waits for the previous cell to complete before starting',
      ]},
      { type: 'h3', text: 'Output Modes' },
      { type: 'p', text: 'Each code cell has an output mode selector (Text / Table / Chart) in the cell header, to the right of the language label:' },
      { type: 'ul', items: [
        'Text — plain Console.Write / Console.WriteLine output',
        'Table — structured data rendered as a scrollable table; use Display.Df() or Display.Table()',
        'Chart — interactive chart rendered via Chart.js; use Display.Chart()',
      ]},
      { type: 'h3', text: 'Clearing Output' },
      { type: 'p', text: 'Run → Clear All Output removes all cell output in the active notebook without resetting kernel state.' },
    ],
  },
  {
    id: 'scripting', title: 'C# Scripting',
    content: [
      { type: 'h3', text: 'State Persistence' },
      { type: 'p', text: 'Variables, functions, classes, and using statements defined in any cell persist and are available in all subsequently executed cells. State accumulates as you run cells.' },
      { type: 'h3', text: 'The Display Helper' },
      { type: 'p', text: 'A global Display object is available in every cell with the following methods:' },
      { type: 'ul', items: [
        'Display.Html(string html) — renders arbitrary HTML in the output area',
        'Display.Table(IEnumerable<T> rows) — renders an object collection as a formatted data table',
        'Display.Df(DataTable dt) — renders a System.Data.DataTable',
        'Display.Chart(object spec) — renders a Chart.js chart from a configuration object',
      ]},
      { type: 'h3', text: 'Using Directives' },
      { type: 'p', text: 'Standard C# using statements work across the notebook. Common namespaces are pre-imported: System, System.Linq, System.Collections.Generic. Add any additional namespace in any cell.' },
      { type: 'h3', text: 'NuGet References' },
      { type: 'p', text: 'Add packages via the NuGet panel. After a package loads, reference its namespace in any cell with a standard using statement.' },
      { type: 'h3', text: 'Config Access' },
      { type: 'p', text: 'Key-value configuration entries (see Configuration) are available in scripts as a global Dictionary<string, string> named Config:' },
      { type: 'code', text: 'var connStr = Config["ConnectionString"];\nConsole.WriteLine(connStr);' },
    ],
  },
  {
    id: 'output', title: 'Output & Display',
    content: [
      { type: 'h3', text: 'Text Output' },
      { type: 'p', text: 'Console.Write and Console.WriteLine produce plain text output shown below the cell.' },
      { type: 'h3', text: 'HTML Output' },
      { type: 'p', text: 'Display.Html("<b>bold</b>") renders HTML directly in the output area. Use this for custom formatting, embedded content, or styled results.' },
      { type: 'h3', text: 'Data Tables' },
      { type: 'p', text: 'Display.Table(myList) or Display.Df(myDataTable) renders structured data as a scrollable table with column headers. Switch the cell output mode to Table.' },
      { type: 'h3', text: 'Charts' },
      { type: 'p', text: 'Display.Chart(spec) renders a Chart.js chart. Switch the cell output mode to Chart and pass a configuration object:' },
      { type: 'code', text: 'Display.Chart(new {\n  type = "bar",\n  data = new {\n    labels = new[]{ "A", "B", "C" },\n    datasets = new[] { new {\n      label = "Values",\n      data = new[] { 1, 2, 3 }\n    }}\n  }\n});' },
      { type: 'h3', text: 'Errors' },
      { type: 'p', text: 'Compilation and runtime errors appear in red. Stack traces are shown in a dimmer colour below the main error message. An error in one cell does not prevent other cells from running.' },
      { type: 'h3', text: 'Exporting Output' },
      { type: 'p', text: 'Hover over any output block to reveal an export button (⬇) in the top-right corner. Click it to save the output to a file.' },
    ],
  },
  {
    id: 'kernel', title: 'Kernel',
    content: [
      { type: 'h3', text: 'What Is the Kernel' },
      { type: 'p', text: 'Each notebook tab spawns its own .NET kernel process (dotnet run). The kernel receives code snippets over stdin and returns structured results over stdout as newline-delimited JSON.' },
      { type: 'h3', text: 'Status Indicator' },
      { type: 'p', text: 'The coloured dot in the toolbar shows kernel state:' },
      { type: 'ul', items: [
        'Yellow / pulsing — kernel is starting up',
        'Amber — kernel is ready and waiting for input',
        'Red — kernel error or process exited unexpectedly',
      ]},
      { type: 'h3', text: 'Resetting the Kernel' },
      { type: 'p', text: 'Run → Reset Kernel sends a reset command to the kernel, clearing all accumulated state: variables, loaded assemblies, and using directives. Cell content and output are preserved.' },
      { type: 'h3', text: 'Per-Notebook Isolation' },
      { type: 'p', text: 'Each tab runs a completely independent kernel process. Code in notebook A cannot see or affect state in notebook B. This lets you safely run conflicting experiments in parallel.' },
    ],
  },
  {
    id: 'nuget', title: 'NuGet Packages',
    content: [
      { type: 'p', text: 'Open the NuGet panel with the NuGet button in the toolbar. The panel has three tabs: Installed, Browse, and Sources.' },
      { type: 'h3', text: 'Installed Tab' },
      { type: 'p', text: 'Shows all packages added to this notebook. Each entry displays its ID, version, and current load status:' },
      { type: 'ul', items: [
        '● dim — package pending load',
        '● yellow / spinning — currently being restored and loaded',
        '● amber — loaded and ready to use',
        '● red — failed to load (hover for error; use the retry button ↺)',
      ]},
      { type: 'p', text: 'Remove a package with the × button. Packages are saved in the .cnb file and reloaded automatically when the notebook is opened.' },
      { type: 'h3', text: 'Browse Tab' },
      { type: 'p', text: 'Search the NuGet gallery by package ID. Results show package name, latest version, and download count. Click Add to add the package to the notebook at its latest version.' },
      { type: 'h3', text: 'Sources Tab' },
      { type: 'p', text: 'Manage NuGet feed URLs. nuget.org is included by default and cannot be removed. Enable or disable sources with the checkbox. Add custom feeds (e.g. private Azure Artifacts) with a name and URL.' },
    ],
  },
  {
    id: 'config', title: 'Configuration',
    content: [
      { type: 'p', text: 'Open the Config panel with the Config button in the toolbar. A badge shows the number of entries when the panel is closed.' },
      { type: 'h3', text: 'Adding Entries' },
      { type: 'p', text: 'Enter a key and value in the input row at the bottom of the panel and press Enter or click Add. Keys and values are plain strings.' },
      { type: 'h3', text: 'Editing Entries' },
      { type: 'p', text: 'Click the value field of any entry to edit it inline. Changes are applied immediately.' },
      { type: 'h3', text: 'Using Config in Scripts' },
      { type: 'p', text: 'Config entries are injected into the kernel at startup and after Reset. Access them via the global Config dictionary:' },
      { type: 'code', text: 'var token = Config["ApiKey"];\nvar url   = Config["BaseUrl"];\nConsole.WriteLine($"Connecting to {url}");' },
      { type: 'p', text: 'Config is per-notebook and saved with the .cnb file, making it easy to store environment-specific values without hardcoding them in cells.' },
    ],
  },
  {
    id: 'logs', title: 'Log Panel',
    content: [
      { type: 'p', text: 'Open the Log panel with the Log button in the toolbar.' },
      { type: 'h3', text: 'Live Stream' },
      { type: 'p', text: 'When "Live" is selected in the dropdown, log entries appear in real time as the kernel and app produce them. The panel auto-scrolls to the latest entry.' },
      { type: 'h3', text: 'Log Tags' },
      { type: 'ul', items: [
        'NOTEBOOK — lifecycle events: kernel start, cell execute start/complete, kernel exit',
        'USER — log output from running scripts (tagged by the kernel process)',
      ]},
      { type: 'h3', text: 'Historical Logs' },
      { type: 'p', text: 'Log files are written per calendar day to the logs/ directory. Use the dropdown to select and read a past day\'s log. Use the 🗑 button to delete the selected log file.' },
      { type: 'h3', text: 'Note' },
      { type: 'p', text: 'The live log panel shows an interleaved stream from all open notebooks. Use the NOTEBOOK tag and kernel IDs in the messages to distinguish output from different tabs.' },
    ],
  },
  {
    id: 'shortcuts', title: 'Keyboard Shortcuts',
    content: [
      { type: 'shortcuts', rows: [
        { keys: '⌘ N', desc: 'New notebook (prompts for template)' },
        { keys: '⌘ O', desc: 'Open notebook in a new tab' },
        { keys: '⌘ S', desc: 'Save notebook' },
        { keys: '⌘ ⇧ S', desc: 'Save As…' },
        { keys: '⌘ ⇧ ↩', desc: 'Run all cells' },
        { keys: '⌘ =  /  ⌘ +', desc: 'Increase font size' },
        { keys: '⌘ –', desc: 'Decrease font size' },
        { keys: '⌘ 0', desc: 'Reset font size to default' },
        { keys: 'F1', desc: 'Open this documentation' },
        { keys: 'Ctrl+↩  (in editor)', desc: 'Run current cell' },
        { keys: 'Tab  (in editor)', desc: 'Indent selection / accept autocomplete' },
        { keys: 'Ctrl+Z  (in editor)', desc: 'Undo' },
        { keys: 'Ctrl+Y  (in editor)', desc: 'Redo' },
        { keys: 'Enter  (in tab rename)', desc: 'Confirm rename' },
        { keys: 'Escape  (in tab rename)', desc: 'Cancel rename' },
      ]},
    ],
  },
  {
    id: 'fileformat', title: 'File Format',
    content: [
      { type: 'p', text: 'Notebooks are saved as .cnb files — plain JSON that is human-readable and version-control friendly.' },
      { type: 'h3', text: 'Top-Level Fields' },
      { type: 'ul', items: [
        'version — format version number (currently 1)',
        'title — display name of the notebook',
        'cells — ordered array of cell objects',
        'nugetPackages — array of { id, version } objects',
        'nugetSources — array of feed objects with name, url, enabled',
        'config — array of { key, value } configuration pairs',
      ]},
      { type: 'h3', text: 'Cell Object' },
      { type: 'code', text: '{\n  "id":      "uuid-v4",\n  "type":    "code",        // or "markdown"\n  "content": "Console.WriteLine(\\"hello\\");",\n  "locked":  false\n}' },
      { type: 'h3', text: 'Example File' },
      { type: 'code', text: '{\n  "version": 1,\n  "title": "My Analysis",\n  "cells": [ ... ],\n  "nugetPackages": [\n    { "id": "Newtonsoft.Json", "version": "13.0.3" }\n  ],\n  "nugetSources": [\n    { "name": "nuget.org",\n      "url": "https://api.nuget.org/v3/index.json",\n      "enabled": true }\n  ],\n  "config": [\n    { "key": "ApiKey", "value": "abc123" }\n  ]\n}' },
    ],
  },
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
      highlightActiveLineGutter(),
      oneDark,
      langExt,
      ctrlEnterKey,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      updateListener,
      EditorView.lineWrapping,
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
    ];

    if (language === 'csharp') {
      const keywordSource = (ctx) => {
        const word = ctx.matchBefore(/\w*/);
        if (!word || (word.from === word.to && !ctx.explicit)) return null;
        return {
          from: word.from,
          options: CSHARP_KEYWORDS.map((kw) => ({ label: kw, type: 'keyword' })),
          validFor: /^\w*$/,
        };
      };

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

  useEffect(() => {
    if (!isOpen || !window.electronAPI) return;
    window.electronAPI.getLogFiles().then(setLogFiles);
  }, [isOpen]);

  useEffect(() => {
    if (!window.electronAPI) return;
    const handler = (entry) => setLiveEntries((prev) => [...prev, entry]);
    window.electronAPI.onLogEntry(handler);
    return () => window.electronAPI.offLogEntry(handler);
  }, []);

  useEffect(() => {
    if (!isOpen || selectedFile === 'live' || !window.electronAPI) return;
    window.electronAPI.readLogFile(selectedFile).then((text) => {
      setFileEntries(parseLogContent(text || ''));
    });
  }, [isOpen, selectedFile]);

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

  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) {
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

// ── CellControls ─────────────────────────────────────────────────────────────

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

// ── Config Panel ──────────────────────────────────────────────────────────────

function ConfigPanel({ isOpen, onToggle, config, onAdd, onRemove, onUpdate }) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const keyRef = useRef(null);

  if (!isOpen) return null;

  const handleAdd = () => {
    const k = newKey.trim();
    if (!k) return;
    onAdd(k, newValue);
    setNewKey(''); setNewValue('');
    keyRef.current?.focus();
  };

  return (
    <div className="config-panel">
      <div className="config-panel-header">
        <span className="config-panel-title">Config</span>
        <span className="config-panel-hint">Access in scripts via <code>Config["key"]</code></span>
        <button className="config-close-btn" onClick={onToggle} title="Close">×</button>
      </div>
      <div className="config-body">
        <div className="config-list">
          {config.length === 0 && (
            <span className="config-empty">No entries — add key/value pairs below</span>
          )}
          {config.map((entry, i) => (
            <div key={i} className="config-item">
              <span className="config-key">{entry.key}</span>
              <span className="config-eq">=</span>
              <input
                className="nuget-input config-value-input"
                value={entry.value}
                onChange={(e) => onUpdate(i, e.target.value)}
                spellCheck={false}
              />
              <button className="nuget-remove-btn" title="Remove" onClick={() => onRemove(i)}>×</button>
            </div>
          ))}
        </div>
        <div className="config-add-row">
          <input ref={keyRef} className="nuget-input config-key-input" placeholder="Key"
            value={newKey} onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
          <input className="nuget-input config-value-input-add" placeholder="Value"
            value={newValue} onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()} spellCheck={false} />
          <button className="nuget-add-btn" onClick={handleAdd}>+ Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({
  kernelStatus,
  notebookPath,
  notebookTitle,
  onRename,
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
  configPanelOpen,
  onToggleConfig,
  configCount,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const displayName = notebookPath
    ? notebookPath.split(/[\\/]/).pop().replace(/\.cnb$/, '')
    : (notebookTitle || 'Untitled Notebook');

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => { setDraft(displayName); setEditing(true); };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayName) onRename?.(trimmed);
    setEditing(false);
  };

  return (
    <div className="toolbar">
      {editing ? (
        <input
          ref={inputRef}
          className="toolbar-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
          onBlur={commit}
        />
      ) : (
        <span className="toolbar-title" onDoubleClick={startEdit} title="Double-click to rename">{displayName}</span>
      )}
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
        onClick={onToggleConfig}
        title="Toggle config panel"
        style={configPanelOpen ? { background: '#0a2a38', borderColor: 'var(--cyber-dim)', color: 'var(--cyber-cyan)' } : undefined}
      >
        Config{configCount > 0 ? ` (${configCount})` : ''}
      </button>
      <button
        onClick={onToggleNuget}
        title="Toggle NuGet panel"
        style={nugetPanelOpen ? { background: '#0a2a38', borderColor: 'var(--cyber-dim)', color: 'var(--cyber-cyan)' } : undefined}
      >
        Packages
      </button>
      <button
        onClick={onToggleLogs}
        title="Toggle log panel"
        style={logPanelOpen ? { background: '#0a2a38', borderColor: 'var(--cyber-dim)', color: 'var(--cyber-cyan)' } : undefined}
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
| Config | \`Config["Key"]\` · \`Config.Get("Key", "default")\` |
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

    md(`## 9 · Notebook Configuration

Use the **Config** panel (toolbar) to define key/value pairs that become available to all scripts in the notebook via the \`Config\` global.

This is useful for environment-specific settings (URLs, feature flags, credentials) without hard-coding them in cells.

| Expression | Result |
|------------|--------|
| \`Config["Key"]\` | Value string, or \`""\` if missing |
| \`Config.Get("Key", "default")\` | Value with fallback |
| \`Config.Has("Key")\` | \`true\` if key exists and non-empty |
| \`Config.All\` | \`IReadOnlyDictionary<string,string>\` |

Config is persisted in the \`.cnb\` file alongside packages and sources.`),

    cs(`// Read config values (try editing them in the Config panel first)
var env     = Config.Get("Environment", "development");
var baseUrl = Config.Get("ApiBaseUrl", "(not set)");
var missing = Config.Get("NonExistent", "fallback value");

Display.Html($@"
<table style='border-collapse:collapse;font-size:12px'>
  <tr><th style='padding:4px 12px;text-align:left;color:#4fc3f7'>Key</th>
      <th style='padding:4px 12px;text-align:left;color:#4fc3f7'>Value</th></tr>
  <tr><td style='padding:3px 12px'>Environment</td><td style='padding:3px 12px;color:#00e5cc'>{env}</td></tr>
  <tr><td style='padding:3px 12px'>ApiBaseUrl</td><td style='padding:3px 12px;color:#00e5cc'>{baseUrl}</td></tr>
  <tr><td style='padding:3px 12px'>NonExistent</td><td style='padding:3px 12px;color:#555'>{missing}</td></tr>
  <tr><td style='padding:3px 12px;color:#555'>All entries</td><td style='padding:3px 12px;color:#555'>{Config.All.Count} defined</td></tr>
</table>");`),
  ];
}

// ── Notebook factory ──────────────────────────────────────────────────────────

function createNotebook(withExamples = false) {
  return {
    id: uuidv4(),
    title: 'Untitled',
    path: null,
    isDirty: false,
    cells: withExamples ? makeExampleCells() : [],
    outputs: {},
    running: new Set(),
    kernelStatus: 'starting',
    nugetPackages: [],
    nugetSources: [...DEFAULT_NUGET_SOURCES],
    config: [],
    logPanelOpen: false,
    nugetPanelOpen: false,
    configPanelOpen: false,
  };
}

// ── Docs Panel ────────────────────────────────────────────────────────────────

function hiText(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="docs-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function DocBlock({ block, query }) {
  if (block.type === 'p')
    return <p className="docs-p">{hiText(block.text, query)}</p>;
  if (block.type === 'h3')
    return <h3 className="docs-h3">{hiText(block.text, query)}</h3>;
  if (block.type === 'ul')
    return <ul className="docs-ul">{block.items.map((item, i) => <li key={i}>{hiText(item, query)}</li>)}</ul>;
  if (block.type === 'code')
    return <pre className="docs-code"><code>{block.text}</code></pre>;
  if (block.type === 'shortcuts')
    return (
      <table className="docs-shortcuts">
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i}>
              <td className="docs-shortcut-keys"><kbd>{row.keys}</kbd></td>
              <td className="docs-shortcut-desc">{hiText(row.desc, query)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  return null;
}

function sectionMatchesQuery(section, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const flat = [
    section.title,
    ...section.content.map((b) => {
      if (b.text) return b.text;
      if (b.items) return b.items.join(' ');
      if (b.rows) return b.rows.map((r) => r.keys + ' ' + r.desc).join(' ');
      return '';
    }),
  ].join(' ').toLowerCase();
  return flat.includes(q);
}

function DocsPanel() {
  const [query, setQuery] = useState('');
  const sectionRefs = useRef({});
  const filtered = DOCS_SECTIONS.filter((s) => sectionMatchesQuery(s, query));

  const scrollTo = (id) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="docs-panel">
      <nav className="docs-sidebar">
        <div className="docs-search-wrap">
          <input
            className="docs-search"
            placeholder="Search docs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="docs-search-clear" onClick={() => setQuery('')}>×</button>
          )}
        </div>
        <div className="docs-index">
          {DOCS_SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`docs-index-item${filtered.some((f) => f.id === s.id) ? '' : ' docs-index-dim'}`}
              onClick={() => scrollTo(s.id)}
            >
              {s.title}
            </button>
          ))}
        </div>
      </nav>
      <div className="docs-content">
        {filtered.map((section) => (
          <section
            key={section.id}
            className="docs-section"
            ref={(el) => { sectionRefs.current[section.id] = el; }}
          >
            <h2 className="docs-section-title">{section.title}</h2>
            {section.content.map((block, i) => (
              <DocBlock key={i} block={block} query={query} />
            ))}
          </section>
        ))}
        {filtered.length === 0 && (
          <div className="docs-no-results">No results for "{query}"</div>
        )}
      </div>
    </div>
  );
}

// ── Tab & TabBar ──────────────────────────────────────────────────────────────

function Tab({ notebook, isActive, isDragOver, onActivate, onClose, onRename,
               onDragStart, onDragOver, onDrop, onDragEnd }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const name = notebook.path
    ? notebook.path.split(/[\\/]/).pop().replace(/\.cnb$/, '')
    : (notebook.title || 'Untitled');

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(name);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  return (
    <div
      className={`tab${isActive ? ' tab-active' : ''}${isDragOver ? ' tab-drag-over' : ''}`}
      draggable={!editing}
      onDragStart={() => onDragStart(notebook.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(notebook.id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(notebook.id); }}
      onDragEnd={onDragEnd}
      onClick={editing ? undefined : onActivate}
      title={notebook.path || name}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="tab-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
            e.stopPropagation();
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="tab-title" onDoubleClick={startEdit}>{name}</span>
      )}
      {notebook.isDirty && <span className="tab-dirty" title="Unsaved changes">•</span>}
      <button
        className="tab-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close tab"
      >×</button>
    </div>
  );
}

function TabBar({ notebooks, activeId, onActivate, onClose, onNew, onRename,
                  onReorder, docsOpen, onActivateDocs, onCloseDocs }) {
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (id) => { if (id !== dragId) setDragOverId(id); };
  const handleDrop = (targetId) => {
    if (dragId && dragId !== targetId) onReorder(dragId, targetId);
    setDragId(null);
    setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  return (
    <div className="tab-bar">
      {notebooks.map((nb) => (
        <Tab
          key={nb.id}
          notebook={nb}
          isActive={nb.id === activeId}
          isDragOver={dragOverId === nb.id}
          onActivate={() => onActivate(nb.id)}
          onClose={() => onClose(nb.id)}
          onRename={(newName) => onRename(nb.id, newName)}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      ))}
      {docsOpen && (
        <div
          className={`tab${activeId === DOCS_TAB_ID ? ' tab-active' : ''}`}
          onClick={onActivateDocs}
        >
          <span className="tab-title">Documentation</span>
          <button className="tab-close" onClick={(e) => { e.stopPropagation(); onCloseDocs(); }} title="Close">×</button>
        </div>
      )}
      <button className="tab-new" onClick={onNew} title="New notebook">+</button>
    </div>
  );
}

// ── NotebookView ──────────────────────────────────────────────────────────────

function NotebookView({
  nb,
  onSetNb,
  onSetNbDirty,
  onRunCell,
  onRunAll,
  onSave,
  onLoad,
  onReset,
  onRename,
  requestCompletions,
  requestLint,
  onAddNugetPackage,
  onRemoveNugetPackage,
  onRetryNugetPackage,
}) {
  const { cells, outputs, running, kernelStatus, nugetPackages, nugetSources,
          config, logPanelOpen, nugetPanelOpen, configPanelOpen, path: notebookPath } = nb;

  const addCell = (type, afterIndex = -1) => {
    const newCell = makeCell(type, '');
    onSetNbDirty((n) => {
      const next = [...n.cells];
      const idx = afterIndex >= 0 ? afterIndex + 1 : next.length;
      next.splice(idx, 0, newCell);
      return { cells: next };
    });
  };

  const updateCell = (id, content) => {
    onSetNbDirty((n) => ({ cells: n.cells.map((c) => c.id === id ? { ...c, content } : c) }));
  };

  const updateCellProp = (id, prop, value) => {
    onSetNbDirty((n) => ({ cells: n.cells.map((c) => c.id === id ? { ...c, [prop]: value } : c) }));
  };

  const deleteCell = (id) => {
    onSetNbDirty((n) => {
      const newOutputs = { ...n.outputs };
      delete newOutputs[id];
      return { cells: n.cells.filter((c) => c.id !== id), outputs: newOutputs };
    });
  };

  const moveCell = (id, dir) => {
    onSetNbDirty((n) => {
      const idx = n.cells.findIndex((c) => c.id === id);
      if (idx < 0 || idx + dir < 0 || idx + dir >= n.cells.length) return {};
      const next = [...n.cells];
      [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
      return { cells: next };
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Toolbar
        kernelStatus={kernelStatus}
        notebookPath={notebookPath}
        notebookTitle={nb.title}
        onRename={onRename}
        onRunAll={() => onRunAll(nb.id)}
        onAddMarkdown={() => addCell('markdown')}
        onAddCode={() => addCell('code')}
        onSave={() => onSave(nb.id)}
        onLoad={onLoad}
        onReset={() => onReset(nb.id)}
        logPanelOpen={logPanelOpen}
        onToggleLogs={() => onSetNb((n) => ({ logPanelOpen: !n.logPanelOpen }))}
        nugetPanelOpen={nugetPanelOpen}
        onToggleNuget={() => onSetNb((n) => ({ nugetPanelOpen: !n.nugetPanelOpen }))}
        configPanelOpen={configPanelOpen}
        onToggleConfig={() => onSetNb((n) => ({ configPanelOpen: !n.configPanelOpen }))}
        configCount={config.length}
      />
      <div className="main-area">
        <div className="content-area">
          <div className="notebook">
            {cells.length === 0 && (
              <div className="empty-notebook">
                <h2>Empty Notebook</h2>
                <p>Add a markdown or code cell to get started.</p>
              </div>
            )}

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
                    isRunning={running.has(cell.id)}
                    onUpdate={(val) => updateCell(cell.id, val)}
                    onRun={() => onRunCell(nb.id, cell)}
                    onDelete={() => deleteCell(cell.id)}
                    onMoveUp={() => moveCell(cell.id, -1)}
                    onMoveDown={() => moveCell(cell.id, 1)}
                    onOutputModeChange={(mode) => updateCellProp(cell.id, 'outputMode', mode)}
                    onToggleLock={() => updateCellProp(cell.id, 'locked', !(cell.locked || false))}
                    requestCompletions={(code, pos) => requestCompletions(nb.id, code, pos)}
                    requestLint={(code) => requestLint(nb.id, code)}
                  />
                )}
                <AddBar
                  onAddMarkdown={() => addCell('markdown', index)}
                  onAddCode={() => addCell('code', index)}
                />
              </div>
            ))}
          </div>
          <LogPanel
            isOpen={logPanelOpen}
            onToggle={() => onSetNb((n) => ({ logPanelOpen: !n.logPanelOpen }))}
          />
        </div>{/* .content-area */}
        <NugetPanel
          isOpen={nugetPanelOpen}
          onToggle={() => onSetNb((n) => ({ nugetPanelOpen: !n.nugetPanelOpen }))}
          packages={nugetPackages}
          kernelStatus={kernelStatus}
          sources={nugetSources}
          onAdd={(id, ver) => onAddNugetPackage(nb.id, id, ver)}
          onRemove={(id) => onRemoveNugetPackage(nb.id, id)}
          onRetry={(id, ver) => onRetryNugetPackage(nb.id, id, ver)}
          onAddSource={(name, url) => onSetNbDirty((n) => ({
            nugetSources: n.nugetSources.some((s) => s.url === url)
              ? n.nugetSources
              : [...n.nugetSources, { name, url, enabled: true }],
          }))}
          onRemoveSource={(url) => onSetNbDirty((n) => ({
            nugetSources: n.nugetSources.filter((s) => s.url !== url),
          }))}
          onToggleSource={(url) => onSetNbDirty((n) => ({
            nugetSources: n.nugetSources.map((s) => s.url === url ? { ...s, enabled: !s.enabled } : s),
          }))}
        />
        <ConfigPanel
          isOpen={configPanelOpen}
          onToggle={() => onSetNb((n) => ({ configPanelOpen: !n.configPanelOpen }))}
          config={config}
          onAdd={(k, v) => onSetNbDirty((n) => ({ config: [...n.config, { key: k, value: v }] }))}
          onRemove={(i) => onSetNbDirty((n) => ({ config: n.config.filter((_, idx) => idx !== i) }))}
          onUpdate={(i, val) => onSetNbDirty((n) => ({
            config: n.config.map((e, idx) => idx === i ? { ...e, value: val } : e),
          }))}
        />
      </div>{/* .main-area */}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [notebooks, setNotebooks] = useState(() => {
    const nb = createNotebook(true);
    return [nb];
  });
  const [activeId, setActiveId] = useState(notebooks[0].id);
  const [docsOpen, setDocsOpen] = useState(false);

  // Synchronized ref pair — callbacks read fresh state without stale closures
  const notebooksRef = useRef(notebooks);
  useEffect(() => { notebooksRef.current = notebooks; }, [notebooks]);
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const prevNbIdRef = useRef(notebooks[0].id);

  // ── State helpers ──────────────────────────────────────────────────────────

  // Update a specific notebook; updater returns a partial object merged into n
  const setNb = useCallback((id, updater) =>
    setNotebooks((prev) => prev.map((n) => n.id === id
      ? (typeof updater === 'function' ? { ...n, ...updater(n) } : { ...n, ...updater }) : n
    )), []);

  // Like setNb but also marks isDirty: true
  const setNbDirty = useCallback((id, updater) =>
    setNb(id, (n) => ({ ...(typeof updater === 'function' ? updater(n) : updater), isDirty: true })),
    [setNb]);

  // ── Pending resolver maps ──────────────────────────────────────────────────
  const pendingResolversRef = useRef({});   // cellId -> resolveFn
  const pendingCompletionsRef = useRef({});  // requestId -> resolveFn
  const pendingLintRef = useRef({});         // requestId -> resolveFn

  // ── Start kernels on mount ─────────────────────────────────────────────────
  useEffect(() => {
    for (const nb of notebooks) {
      window.electronAPI?.startKernel(nb.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Kernel message router ──────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return;

    const handler = (payload) => {
      const { notebookId, message: msg } = payload;

      switch (msg.type) {
        case 'ready':
          setNb(notebookId, { kernelStatus: 'ready' });
          // Kick pending NuGet preloads
          {
            const nb = notebooksRef.current.find((n) => n.id === notebookId);
            if (nb) {
              const pending = nb.nugetPackages.filter((p) => p.status === 'pending');
              if (pending.length > 0 && window.electronAPI) {
                setNb(notebookId, (n) => ({
                  nugetPackages: n.nugetPackages.map((p) =>
                    p.status === 'pending' ? { ...p, status: 'loading' } : p
                  ),
                }));
                window.electronAPI.sendToKernel(notebookId, {
                  type: 'preload_nugets',
                  packages: pending.map(({ id, version }) => ({ id, version })),
                  sources: nb.nugetSources.filter((s) => s.enabled).map((s) => s.url),
                });
              }
            }
          }
          break;

        case 'stdout':
          setNb(notebookId, (n) => ({
            outputs: { ...n.outputs, [msg.id]: [...(n.outputs[msg.id] || []), msg] },
          }));
          break;

        case 'display':
          if (msg.update && msg.handleId) {
            setNb(notebookId, (n) => ({
              outputs: {
                ...n.outputs,
                [msg.id]: (n.outputs[msg.id] || []).map((m) =>
                  m.handleId === msg.handleId ? msg : m
                ),
              },
            }));
          } else {
            setNb(notebookId, (n) => ({
              outputs: { ...n.outputs, [msg.id]: [...(n.outputs[msg.id] || []), msg] },
            }));
          }
          break;

        case 'error':
          if (msg.id) {
            setNb(notebookId, (n) => ({
              outputs: { ...n.outputs, [msg.id]: [...(n.outputs[msg.id] || []), msg] },
            }));
          } else {
            setNb(notebookId, { kernelStatus: 'error' });
          }
          break;

        case 'complete': {
          const resolve = pendingResolversRef.current[msg.id];
          if (resolve) {
            delete pendingResolversRef.current[msg.id];
            resolve(msg);
          }
          setNb(notebookId, (n) => {
            const next = new Set(n.running);
            next.delete(msg.id);
            return { running: next };
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
          setNb(notebookId, (n) => ({
            nugetPackages: n.nugetPackages.map((p) =>
              p.id === msg.id
                ? { ...p, status: msg.status, ...(msg.message ? { error: msg.message } : { error: undefined }) }
                : p
            ),
          }));
          break;

        case 'nuget_preload_complete':
          break;

        case 'reset_complete':
          setNb(notebookId, { kernelStatus: 'ready' });
          break;

        default:
          break;
      }
    };

    window.electronAPI.onKernelMessage(handler);
    return () => window.electronAPI.offKernelMessage(handler);
  }, [setNb]);

  // ── Font size ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onFontSizeChange) return;
    window.electronAPI.onFontSizeChange((size) => {
      document.documentElement.style.setProperty('--base-font-size', String(size));
    });
  }, []);

  // ── Cell execution ─────────────────────────────────────────────────────────

  const runCell = useCallback((notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'code') return Promise.resolve();

    return new Promise((resolve) => {
      setNb(notebookId, (n) => ({
        outputs: { ...n.outputs, [cell.id]: [] },
        running: new Set([...n.running, cell.id]),
      }));

      pendingResolversRef.current[cell.id] = resolve;

      const nb = notebooksRef.current.find((n) => n.id === notebookId);
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute',
        id: cell.id,
        code: cell.content,
        outputMode: cell.outputMode || 'auto',
        sources: nb ? nb.nugetSources.filter((s) => s.enabled).map((s) => s.url) : [],
        config: nb
          ? Object.fromEntries(nb.config.filter((e) => e.key.trim()).map((e) => [e.key, e.value]))
          : {},
      });
    });
  }, [setNb]);

  const runAll = useCallback(async (notebookId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    for (const cell of nb.cells.filter((c) => c.type === 'code')) {
      await runCell(notebookId, cell);
    }
  }, [runCell]);

  // ── Kernel reset ───────────────────────────────────────────────────────────

  const handleReset = useCallback((notebookId) => {
    if (!window.electronAPI) return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (nb) {
      nb.cells.forEach((cell) => {
        const resolve = pendingResolversRef.current[cell.id];
        if (resolve) {
          delete pendingResolversRef.current[cell.id];
          resolve({ success: false });
        }
      });
    }
    setNb(notebookId, { kernelStatus: 'starting', outputs: {}, running: new Set() });
    window.electronAPI.resetKernel(notebookId);
  }, [setNb]);

  // ── Save / Load ────────────────────────────────────────────────────────────

  const buildNotebookData = useCallback((notebookId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return null;
    return {
      version: '1.0',
      title: nb.path ? nb.path.split(/[\\/]/).pop().replace('.cnb', '') : (nb.title || 'notebook'),
      packages: nb.nugetPackages.map(({ id, version }) => ({ id, version: version || null })),
      sources: nb.nugetSources,
      config: nb.config.filter((e) => e.key.trim()),
      cells: nb.cells.map(({ id, type, content, outputMode, locked }) => ({
        id, type, content,
        ...(type === 'code' ? { outputMode: outputMode || 'auto', locked: locked || false } : {}),
      })),
    };
  }, []);

  const handleSave = useCallback(async (notebookId) => {
    if (!window.electronAPI) return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    const data = buildNotebookData(notebookId);
    if (nb.path) {
      await window.electronAPI.saveNotebookTo(nb.path, data);
      setNb(notebookId, { isDirty: false });
    } else {
      const result = await window.electronAPI.saveNotebook(data);
      if (result.success) setNb(notebookId, { path: result.filePath, isDirty: false });
    }
  }, [buildNotebookData, setNb]);

  const handleSaveAs = useCallback(async (notebookId) => {
    if (!window.electronAPI) return;
    const data = buildNotebookData(notebookId);
    if (!data) return;
    const result = await window.electronAPI.saveNotebook(data);
    if (result.success) setNb(notebookId, { path: result.filePath, isDirty: false });
  }, [buildNotebookData, setNb]);

  // handleLoad always opens a NEW tab
  const handleLoad = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.loadNotebook();
    if (!result.success || !result.data) return;

    const nb = createNotebook(false);
    const loadedPkgs = (result.data.packages || []).map((p) => ({ ...p, status: 'pending' }));
    const nbWithData = {
      ...nb,
      path: result.filePath,
      cells: result.data.cells || [],
      nugetPackages: loadedPkgs,
      nugetSources: result.data.sources || [...DEFAULT_NUGET_SOURCES],
      config: result.data.config || [],
      isDirty: false,
    };

    setNotebooks((prev) => [...prev, nbWithData]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);
  }, []);

  // ── Tab management ─────────────────────────────────────────────────────────

  const handleNew = useCallback(async () => {
    if (!window.electronAPI) return;
    const response = await window.electronAPI.showNewNotebookDialog();
    if (response === 2) return; // Cancel
    const nb = createNotebook(response === 0); // 0 = Examples, 1 = Blank
    setNotebooks((prev) => [...prev, nb]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);
  }, []);

  const handleRenameTab = useCallback(async (notebookId, newName) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    const title = newName.trim();
    if (!nb || !title) return;
    if (nb.path) {
      // Strip characters illegal in filenames on Windows/macOS/Linux
      const safeName = title.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled';
      const newPath = nb.path.replace(/[^/\\]+\.cnb$/, `${safeName}.cnb`);
      const result = await window.electronAPI?.renameFile(nb.path, newPath);
      if (result?.success) setNb(notebookId, { path: newPath, title });
    } else {
      setNb(notebookId, { title });
    }
  }, [setNb]);

  const handleCloseTab = useCallback((tabId) => {
    const currentNotebooks = notebooksRef.current;
    const nb = currentNotebooks.find((n) => n.id === tabId);
    if (!nb) return;

    if (nb.isDirty) {
      const name = nb.path ? nb.path.split(/[\\/]/).pop() : 'Untitled';
      if (!window.confirm(`Close "${name}" without saving?`)) return;
    }

    // Stop kernel
    window.electronAPI?.stopKernel(tabId);

    // Resolve any pending cell executions with failure
    nb.cells.forEach((cell) => {
      const resolve = pendingResolversRef.current[cell.id];
      if (resolve) {
        delete pendingResolversRef.current[cell.id];
        resolve({ success: false });
      }
    });

    const remaining = currentNotebooks.filter((n) => n.id !== tabId);

    if (remaining.length === 0) {
      const fresh = createNotebook(false);
      window.electronAPI?.startKernel(fresh.id);
      setNotebooks([fresh]);
      setActiveId(fresh.id);
    } else {
      setNotebooks(remaining);
      if (activeIdRef.current === tabId) {
        const idx = currentNotebooks.findIndex((n) => n.id === tabId);
        const newActive = remaining[Math.min(idx, remaining.length - 1)];
        setActiveId(newActive.id);
      }
    }
  }, []);

  const handleOpenDocs = useCallback(() => {
    if (activeIdRef.current !== DOCS_TAB_ID) prevNbIdRef.current = activeIdRef.current;
    setDocsOpen(true);
    setActiveId(DOCS_TAB_ID);
  }, []);

  const handleCloseDocs = useCallback(() => {
    setDocsOpen(false);
    const target = prevNbIdRef.current ?? notebooksRef.current[0]?.id;
    if (target) setActiveId(target);
  }, []);

  const handleReorder = useCallback((dragId, dropId) => {
    setNotebooks((prev) => {
      const from = prev.findIndex((n) => n.id === dragId);
      const to = prev.findIndex((n) => n.id === dropId);
      if (from < 0 || to < 0 || from === to) return prev;
      const result = [...prev];
      const [item] = result.splice(from, 1);
      result.splice(to, 0, item);
      return result;
    });
  }, []);

  // ── NuGet package management ───────────────────────────────────────────────

  const addNugetPackage = useCallback((notebookId, id, version) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    const isReady = nb.kernelStatus === 'ready';
    setNb(notebookId, (n) => {
      if (n.nugetPackages.some((p) => p.id.toLowerCase() === id.toLowerCase())) return {};
      return {
        nugetPackages: [...n.nugetPackages, { id, version: version || null, status: isReady ? 'loading' : 'pending' }],
        isDirty: true,
      };
    });
    if (isReady && window.electronAPI) {
      window.electronAPI.sendToKernel(notebookId, {
        type: 'preload_nugets',
        packages: [{ id, version: version || null }],
        sources: nb.nugetSources.filter((s) => s.enabled).map((s) => s.url),
      });
    }
  }, [setNb]);

  const removeNugetPackage = useCallback((notebookId, id) => {
    setNbDirty(notebookId, (n) => ({
      nugetPackages: n.nugetPackages.filter((p) => p.id !== id),
    }));
  }, [setNbDirty]);

  const retryNugetPackage = useCallback((notebookId, id, version) => {
    if (!window.electronAPI) return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    setNb(notebookId, (n) => ({
      nugetPackages: n.nugetPackages.map((p) =>
        p.id === id ? { ...p, status: 'loading', error: undefined } : p
      ),
    }));
    window.electronAPI.sendToKernel(notebookId, {
      type: 'preload_nugets',
      packages: [{ id, version: version || null }],
      sources: nb.nugetSources.filter((s) => s.enabled).map((s) => s.url),
    });
  }, [setNb]);

  // ── Completions & lint ─────────────────────────────────────────────────────

  const requestCompletions = useCallback((notebookId, code, position) => {
    return new Promise((resolve) => {
      if (!window.electronAPI) return resolve([]);
      const requestId = uuidv4();
      pendingCompletionsRef.current[requestId] = resolve;
      window.electronAPI.sendToKernel(notebookId, { type: 'autocomplete', requestId, code, position });
      setTimeout(() => {
        if (pendingCompletionsRef.current[requestId]) {
          delete pendingCompletionsRef.current[requestId];
          resolve([]);
        }
      }, 2000);
    });
  }, []);

  const requestLint = useCallback((notebookId, code) => {
    return new Promise((resolve) => {
      if (!window.electronAPI) return resolve([]);
      const requestId = uuidv4();
      pendingLintRef.current[requestId] = resolve;
      window.electronAPI.sendToKernel(notebookId, { type: 'lint', requestId, code });
      setTimeout(() => {
        if (pendingLintRef.current[requestId]) {
          delete pendingLintRef.current[requestId];
          resolve([]);
        }
      }, 5000);
    });
  }, []);

  // ── Menu action dispatch ───────────────────────────────────────────────────

  const menuHandlersRef = useRef({});
  menuHandlersRef.current = {
    new: handleNew,
    open: handleLoad,
    save: () => handleSave(activeIdRef.current),
    'save-as': () => handleSaveAs(activeIdRef.current),
    'run-all': () => runAll(activeIdRef.current),
    reset: () => handleReset(activeIdRef.current),
    'clear-output': () => setNb(activeIdRef.current, { outputs: {} }),
    docs: handleOpenDocs,
  };

  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return;
    window.electronAPI.onMenuAction((action) => {
      menuHandlersRef.current[action]?.();
    });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div id="app">
      <TabBar
        notebooks={notebooks}
        activeId={activeId}
        onActivate={setActiveId}
        onClose={handleCloseTab}
        onNew={handleNew}
        onRename={handleRenameTab}
        onReorder={handleReorder}
        docsOpen={docsOpen}
        onActivateDocs={handleOpenDocs}
        onCloseDocs={handleCloseDocs}
      />
      <div id="notebooks-container">
        {notebooks.map((notebook) => (
          <div
            key={notebook.id}
            className="notebook-pane"
            style={notebook.id === activeId ? undefined : { display: 'none' }}
          >
            <NotebookView
              nb={notebook}
              onSetNb={(updater) => setNb(notebook.id, updater)}
              onSetNbDirty={(updater) => setNbDirty(notebook.id, updater)}
              onRunCell={runCell}
              onRunAll={runAll}
              onSave={handleSave}
              onLoad={handleLoad}
              onReset={handleReset}
              onRename={(newName) => handleRenameTab(notebook.id, newName)}
              requestCompletions={requestCompletions}
              requestLint={requestLint}
              onAddNugetPackage={addNugetPackage}
              onRemoveNugetPackage={removeNugetPackage}
              onRetryNugetPackage={retryNugetPackage}
            />
          </div>
        ))}
        {docsOpen && (
          <div
            className="notebook-pane"
            style={activeId === DOCS_TAB_ID ? undefined : { display: 'none' }}
          >
            <DocsPanel />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root'));
root.render(<App />);
