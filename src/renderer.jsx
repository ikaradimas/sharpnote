import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
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
const LIB_EDITOR_ID_PREFIX = '__libed__';

// ── Tab ID helpers ─────────────────────────────────────────────────────────────
const makeLibEditorId = (fullPath) => `${LIB_EDITOR_ID_PREFIX}${fullPath}`;
const isLibEditorId  = (id) => id?.startsWith(LIB_EDITOR_ID_PREFIX) ?? false;
const isNotebookId   = (id) => !!(id && id !== DOCS_TAB_ID && !isLibEditorId(id));

// ── Kernel request timeouts ───────────────────────────────────────────────────
const COMPLETION_TIMEOUT = 2000; // autocomplete — fast turnaround expected
const LINT_TIMEOUT       = 5000; // lint — Roslyn compilation can be slower

// ── Cursor position broadcast ─────────────────────────────────────────────────
// Any focused CodeEditor writes here; StatusBar subscribes via register fn.
let _setCursorPos = null;

// ── Notebook display name ──────────────────────────────────────────────────────
// Returns the human-readable name for a notebook given its saved path and/or title.
function getNotebookDisplayName(notebookPath, title, fallback = 'Untitled') {
  if (notebookPath) return notebookPath.split(/[\\/]/).pop().replace(/\.cnb$/, '');
  return title || fallback;
}

// ── Log timestamp formatting ───────────────────────────────────────────────────
function formatLogTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const DOCS_SECTIONS = [
  {
    id: 'overview', title: 'Overview',
    content: [
      { type: 'p', text: 'Polyglot Notebook is a desktop C# scripting environment. Notebooks are ordered sequences of code and markdown cells that share state within a dedicated .NET kernel process.' },
      { type: 'h3', text: 'Key Concepts' },
      { type: 'ul', items: [
        'Notebook — a .cnb file containing cells, packages, config, and database attachment state',
        'Cell — a unit of code or markdown; code cells persist state across the kernel session',
        'Kernel — a .NET 8 process per tab that executes C# and keeps all variables alive between cells',
        'Tab — each open notebook has its own tab and a fully independent kernel process',
        'Code Library — a shared folder of reusable .cs/.csx snippets available to all notebooks',
        'DB Panel — attach live database connections and query them with typed EF Core DbContexts',
      ]},
      { type: 'h3', text: 'Quick Reference' },
      { type: 'ul', items: [
        'Console.Write / Console.WriteLine → plain text output',
        'Display.Html(html) → rendered HTML in the output area',
        'Display.Table(list) / list.DisplayTable() → scrollable data table',
        'Display.Graph(chartJsConfig) → interactive Chart.js graph',
        'value.Log() / value.Log("label") → write to the Logs panel; returns value unchanged',
        'Config["key"] → per-notebook key-value configuration',
        '#load "path/to/file.cs" → load a library snippet into the kernel',
        '#r "nuget: PackageId, Version" → add a NuGet package (or use the Packages panel)',
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
      { type: 'h3', text: 'Recent Files' },
      { type: 'p', text: 'File → Open Recent shows up to 12 recently opened notebooks. Selecting one opens it in a new tab. If the file has moved it is removed from the list automatically. The list is also maintained in the system-level recent documents menu (macOS Dock).' },
      { type: 'h3', text: 'Saving' },
      { type: 'ul', items: [
        'Save (⌘S) — saves to the current file path; prompts for a path if not yet saved',
        'Save As… (⌘⇧S) — always prompts for a new path',
        'An amber • on the tab indicates unsaved changes',
        'DB attachment changes (attach/detach) are auto-saved to the file path when a path exists',
      ]},
      { type: 'h3', text: 'Tabs & Navigation' },
      { type: 'ul', items: [
        'Click a tab to switch to it — the inactive pane stays mounted, preserving scroll position, editor undo history, and all state',
        'Drag a tab left or right to reorder it in the tab bar',
        'Close a tab with the × button; a confirmation appears if there are unsaved changes',
        'If the last tab is closed, a fresh blank notebook is created automatically',
        'Library file editor tabs appear alongside notebook tabs; they show a ● when unsaved',
      ]},
      { type: 'h3', text: 'Tab Colors' },
      { type: 'p', text: 'Hover over a tab and click the palette icon to assign a color. The color appears as a 2 px top border on the tab and tints the tab bar\'s bottom edge when that tab is active. Click the same icon again to clear the color.' },
      { type: 'h3', text: 'Renaming' },
      { type: 'p', text: 'Double-click the tab title or the notebook title in the toolbar to rename inline. Press Enter or click away to confirm; Escape to cancel. If the notebook has been saved, the file on disk is also renamed. Characters illegal in filenames ( / \\ : * ? " < > | ) are stripped from the saved filename.' },
    ],
  },
  {
    id: 'cells', title: 'Cells',
    content: [
      { type: 'h3', text: 'Cell Types' },
      { type: 'ul', items: [
        'Code cell — C# executed by the kernel; all cells share one kernel session, so variables and using statements persist across cells',
        'Markdown cell — rich text: headings, lists, code spans, tables, links, and blockquotes rendered on demand',
      ]},
      { type: 'h3', text: 'Adding Cells' },
      { type: 'p', text: 'Hover between any two cells (or above the first cell) to reveal the + Code and + Markdown insert buttons. The toolbar\'s Add Markdown and Add Code buttons append to the end of the notebook.' },
      { type: 'h3', text: 'Moving Cells' },
      { type: 'p', text: 'Hover over a cell to reveal ↑ ↓ arrows in the top-right corner. Click to move the cell one position up or down.' },
      { type: 'h3', text: 'Deleting Cells' },
      { type: 'p', text: 'Hover over a cell to reveal the delete button. Click once to enter confirmation mode (button turns red and shows "del?"), then click again to confirm deletion.' },
      { type: 'h3', text: 'Locking Cells' },
      { type: 'p', text: 'Click the lock icon in the bottom-right of a code cell to toggle the lock. Locked cells show a darker background and cannot be edited — useful for protecting reference code. Locked cells can still be run.' },
      { type: 'h3', text: 'Editing Markdown' },
      { type: 'p', text: 'Click the pencil button on a rendered markdown cell, or double-click its content, to enter edit mode. Click OK or press Ctrl+Enter to render; click Cancel or press Escape to discard changes.' },
      { type: 'h3', text: 'Cell Index Badge' },
      { type: 'p', text: 'Each code cell shows a small [NN] badge on its left edge indicating its position in the notebook. This matches the cell number in error stack traces.' },
    ],
  },
  {
    id: 'execution', title: 'Running Code',
    content: [
      { type: 'h3', text: 'Running a Single Cell' },
      { type: 'ul', items: [
        'Click the ▶ Run button in the cell header',
        'Press Ctrl+Enter (Cmd+Enter on macOS) while the code editor is focused',
      ]},
      { type: 'h3', text: 'Running All Cells' },
      { type: 'ul', items: [
        'Run → Run All Cells (⌘⇧↩)',
        'Cells execute in order from top to bottom',
        'Each cell waits for the previous cell to complete before starting',
      ]},
      { type: 'h3', text: 'Output Modes' },
      { type: 'p', text: 'Each code cell has an output mode selector in the cell header. Five modes are available:' },
      { type: 'ul', items: [
        'auto — the kernel detects the output type and picks the best renderer automatically (default)',
        'text — plain Console.Write / Console.WriteLine output',
        'html — HTML string rendered directly into the output area',
        'table — object collection rendered as a scrollable table',
        'graph — interactive Chart.js graph rendered from a config object',
      ]},
      { type: 'h3', text: 'Autocomplete & Lint' },
      { type: 'p', text: 'The code editor requests completions from the kernel as you type (Roslyn-powered). Press Tab or Enter to accept a suggestion. The editor also performs background linting and underlines errors with squiggles before you run.' },
      { type: 'h3', text: 'Clearing Output' },
      { type: 'p', text: 'Run → Clear All Output removes all cell output in the active notebook without resetting kernel state.' },
    ],
  },
  {
    id: 'scripting', title: 'C# Scripting',
    content: [
      { type: 'h3', text: 'State Persistence' },
      { type: 'p', text: 'Variables, functions, classes, using statements, and loaded assemblies persist across cells and accumulate as you run them. State is cleared only on kernel reset.' },
      { type: 'h3', text: 'Auto-Render' },
      { type: 'p', text: 'If the last expression in a cell produces a value and no explicit Display call was made, the kernel auto-renders the result. Object collections become tables; strings and scalars become text.' },
      { type: 'h3', text: 'The Display Helper' },
      { type: 'p', text: 'A global Display object provides explicit rendering methods:' },
      { type: 'ul', items: [
        'Display.Html(string html) — renders arbitrary HTML in the output area',
        'Display.Table(IEnumerable<T> rows) — renders an object collection as a formatted data table',
        'Display.Df(DataTable dt) — renders a System.Data.DataTable',
        'Display.Graph(object spec) — renders an interactive Chart.js graph from a config object',
        'list.DisplayTable() — extension method shorthand for Display.Table(list)',
      ]},
      { type: 'h3', text: 'Logging with .Log()' },
      { type: 'p', text: '.Log() is an extension method available on any type. It writes a structured entry to the Logs panel, returns the original value unchanged, and can be used inline without breaking a call chain:' },
      { type: 'code', text: '"Starting pipeline".Log();\nvar threshold = 0.75.Log("threshold");\n\nvar passing = scores\n    .Where(s => s >= threshold)\n    .Select(s => s.Log("pass"))   // logs each item, still returns it\n    .ToList();\n\nnew { Total = scores.Length, Passing = passing.Count }.Log("summary");' },
      { type: 'h3', text: 'Using Directives' },
      { type: 'p', text: 'Standard C# using statements work across the whole notebook. Common namespaces are pre-imported: System, System.Linq, System.Collections.Generic. Add any additional namespace in any cell.' },
      { type: 'h3', text: 'Loading Library Files with #load' },
      { type: 'p', text: 'Execute a .cs or .csx file directly in the kernel without copying its content into a cell:' },
      { type: 'code', text: '#load "/Users/you/Documents/Polyglot Notebooks/Library/Helpers.cs"' },
      { type: 'p', text: 'The Library panel generates this directive automatically — select a file and click #load. All its definitions become available to subsequent cells.' },
      { type: 'h3', text: 'NuGet References' },
      { type: 'p', text: 'Add packages via the NuGet panel (⌘⇧P) or with a directive in any cell:' },
      { type: 'code', text: '#r "nuget: Newtonsoft.Json, 13.0.3"' },
      { type: 'h3', text: 'Config Access' },
      { type: 'p', text: 'Per-notebook key-value pairs (see Configuration) are available as a global Config dictionary:' },
      { type: 'code', text: 'var url   = Config["BaseUrl"];\nvar token = Config["ApiKey"];\nvar env   = Config.GetValueOrDefault("Environment", "development");' },
      { type: 'h3', text: 'Database Contexts' },
      { type: 'p', text: 'When a database is attached via the DB panel, a typed EF Core DbContext is injected into the kernel under the connection\'s variable name (e.g. myDb). Use it directly with standard LINQ:' },
      { type: 'code', text: 'var users = myDb.Users.Where(u => u.IsActive).ToList();\nDisplay.Table(users);' },
    ],
  },
  {
    id: 'output', title: 'Output & Display',
    content: [
      { type: 'h3', text: 'Text Output' },
      { type: 'p', text: 'Console.Write and Console.WriteLine produce plain text output shown below the cell. Set the output mode to "text" or leave it on "auto".' },
      { type: 'h3', text: 'HTML Output' },
      { type: 'p', text: 'Display.Html("<b>bold</b>") renders HTML directly in the output area. Use this for custom formatting, styled results, or embedded content.' },
      { type: 'h3', text: 'Data Tables' },
      { type: 'p', text: 'Display.Table(myList) or myList.DisplayTable() renders an object collection as a scrollable table with column headers derived from property names. Display.Df(dataTable) accepts a System.Data.DataTable. Set the output mode to "table".' },
      { type: 'h3', text: 'Graphs (Chart.js)' },
      { type: 'p', text: 'Display.Graph(spec) renders an interactive Chart.js chart. Set the output mode to "graph" and pass an anonymous object matching the Chart.js config schema:' },
      { type: 'code', text: 'Display.Graph(new {\n  type = "bar",\n  data = new {\n    labels = new[] { "Jan", "Feb", "Mar" },\n    datasets = new[] { new {\n      label = "Sales",\n      data  = new[] { 120, 95, 140 },\n      backgroundColor = "rgba(196,150,74,0.7)",\n    }}\n  },\n  options = new { responsive = true }\n});' },
      { type: 'h3', text: 'Errors' },
      { type: 'p', text: 'Compilation and runtime errors appear in red. Stack traces are shown in a dimmer colour below the main error message. An error in one cell does not prevent other cells from running.' },
      { type: 'h3', text: 'Exporting Output' },
      { type: 'p', text: 'Hover over any output block to reveal an export button in the top-right corner. Click it to save the output to a file.' },
    ],
  },
  {
    id: 'database', title: 'Databases',
    content: [
      { type: 'p', text: 'The DB panel lets you connect to databases, browse their schema, and query them with fully-typed EF Core DbContexts — all without leaving the notebook. Click the DB button in the toolbar to open the panel.' },
      { type: 'h3', text: 'Supported Providers' },
      { type: 'ul', items: [
        'SQLite — local file-based database',
        'SQL Server — Microsoft SQL Server or Azure SQL',
        'PostgreSQL — via Npgsql',
      ]},
      { type: 'h3', text: 'Adding a Connection' },
      { type: 'p', text: 'Click the + button in the DB panel. Enter a name (used as the variable name in scripts), choose a provider, and enter a connection string:' },
      { type: 'code', text: '-- SQLite\nData Source=/Users/me/data/mydb.db\n\n-- SQL Server\nServer=localhost;Database=mydb;User Id=sa;Password=pass;TrustServerCertificate=True\n\n-- PostgreSQL\nHost=localhost;Database=mydb;Username=postgres;Password=secret' },
      { type: 'h3', text: 'Attaching to a Notebook' },
      { type: 'p', text: 'Connections are global and can be attached to individual notebooks. Click Attach next to a connection. The kernel connects, introspects the schema, generates a typed DbContext, and injects it as a variable. Attached connections are saved in the .cnb file and reconnect automatically on open.' },
      { type: 'h3', text: 'Connection Status' },
      { type: 'ul', items: [
        '● yellow / pulsing — connecting and generating the DbContext',
        '● teal — attached and ready',
        '● red — connection error (hover the dot for details)',
      ]},
      { type: 'h3', text: 'Schema Browser' },
      { type: 'p', text: 'Expand an attached connection to browse its tables and columns. Each column shows its name, data type, and a PK badge for primary key columns. Click a table header to expand or collapse its column list.' },
      { type: 'h3', text: 'Querying in Scripts' },
      { type: 'p', text: 'The connection name is sanitized to a camelCase variable (e.g. "My DB" → myDb). Use it as a standard EF Core DbContext:' },
      { type: 'code', text: '// Fetch all rows\nvar users = myDb.Users.ToList();\nDisplay.Table(users);\n\n// Filter and project\nvar active = myDb.Users\n    .Where(u => u.IsActive)\n    .Select(u => new { u.Name, u.Email })\n    .OrderBy(u => u.Name)\n    .ToList();\n\n// Raw SQL\nvar result = myDb.Database\n    .SqlQueryRaw<OrderSummary>("SELECT * FROM orders WHERE total > {0}", 100)\n    .ToList();' },
      { type: 'h3', text: 'After Kernel Reset' },
      { type: 'p', text: 'Resetting the kernel re-injects all attached DB contexts automatically. You do not need to re-attach them manually.' },
      { type: 'h3', text: 'Managing Connections' },
      { type: 'p', text: 'Connections are stored globally in app data (shared across all notebooks). Edit or delete a connection with the pencil/bin icons. Detach a connection from the current notebook without deleting it globally using the Detach button.' },
    ],
  },
  {
    id: 'kernel', title: 'Kernel',
    content: [
      { type: 'h3', text: 'What Is the Kernel' },
      { type: 'p', text: 'Each notebook tab spawns its own .NET 8 kernel process. The kernel receives code snippets over stdin and returns structured results over stdout as newline-delimited JSON. It runs Roslyn scripting, handles NuGet restores, and manages EF Core DbContext instances for attached databases.' },
      { type: 'h3', text: 'Status Indicator' },
      { type: 'p', text: 'The coloured dot in the toolbar shows kernel state:' },
      { type: 'ul', items: [
        'Yellow / pulsing — kernel is starting up',
        'Amber — kernel is ready and waiting for input',
        'Red — kernel error or process exited unexpectedly',
      ]},
      { type: 'h3', text: 'Memory Sparkline' },
      { type: 'p', text: 'The status bar at the bottom shows a live memory sparkline for the active kernel. The bar chart displays the last 60 readings sampled every 3 seconds — the most recent bar is fully opaque. Current and peak memory (MB) are shown to the right.' },
      { type: 'h3', text: 'Resetting the Kernel' },
      { type: 'p', text: 'Run → Reset Kernel sends a reset command, clearing all accumulated state: variables, loaded assemblies, and using directives. Cell content and output are preserved. Attached DB contexts, NuGet packages, and Config values are re-injected automatically after reset.' },
      { type: 'h3', text: 'Per-Notebook Isolation' },
      { type: 'p', text: 'Each tab runs a completely independent kernel process. Code in notebook A cannot see or affect state in notebook B, letting you safely run conflicting experiments in parallel.' },
    ],
  },
  {
    id: 'nuget', title: 'NuGet Packages',
    content: [
      { type: 'p', text: 'Open the NuGet panel with Tools → Packages (⌘⇧P) or the Packages button in the toolbar. Packages are saved to the .cnb file and restored automatically every time the notebook is opened.' },
      { type: 'h3', text: 'Installed Tab' },
      { type: 'p', text: 'Shows all packages added to this notebook with their load status:' },
      { type: 'ul', items: [
        '● dim — pending (waiting for the kernel to be ready)',
        '● yellow / spinning — being restored and loaded',
        '● amber — loaded and ready',
        '● red — failed to load (hover for the error; use the retry button)',
      ]},
      { type: 'p', text: 'Remove a package with the × button.' },
      { type: 'h3', text: 'Browse Tab' },
      { type: 'p', text: 'Search the NuGet gallery by package ID. Results show package name, latest version, and download count. Click Add to install at the latest version.' },
      { type: 'h3', text: 'Sources Tab' },
      { type: 'p', text: 'Manage NuGet feed URLs. nuget.org is included by default and cannot be removed. Toggle sources with the checkbox. Add private feeds (e.g. Azure Artifacts) with a name and URL.' },
      { type: 'h3', text: 'Adding Packages in Code' },
      { type: 'p', text: 'Reference a package directly in a cell using the #r directive (takes effect after running the cell):' },
      { type: 'code', text: '#r "nuget: Newtonsoft.Json, 13.0.3"\nusing Newtonsoft.Json;\nConsole.WriteLine(JsonConvert.SerializeObject(new { x = 1 }));' },
    ],
  },
  {
    id: 'config', title: 'Configuration',
    content: [
      { type: 'p', text: 'Open the Config panel with Tools → Config (⌘⇧,) or the Config button in the toolbar. A badge on the button shows the number of entries.' },
      { type: 'h3', text: 'Adding Entries' },
      { type: 'p', text: 'Enter a key and value in the input row at the bottom and press Enter or click Add. Keys and values are plain strings.' },
      { type: 'h3', text: 'Editing Entries' },
      { type: 'p', text: 'Click the value field of any entry to edit it inline. Changes are applied immediately.' },
      { type: 'h3', text: 'Using Config in Scripts' },
      { type: 'p', text: 'Config entries are injected into the kernel at startup and after Reset as a global Config dictionary:' },
      { type: 'code', text: 'var token = Config["ApiKey"];\nvar url   = Config["BaseUrl"];\nvar env   = Config.GetValueOrDefault("Environment", "development");' },
      { type: 'h3', text: 'Scope' },
      { type: 'p', text: 'Config is per-notebook and saved in the .cnb file. Use it for environment-specific values (API keys, connection strings, feature flags) without hardcoding them in cells.' },
    ],
  },
  {
    id: 'library', title: 'Code Library',
    content: [
      { type: 'p', text: 'The Code Library is a shared folder of reusable C# snippets accessible from all notebooks. Open it with Tools → Library (⌘⇧L) or the Library button in the toolbar. Files are stored in ~/Documents/Polyglot Notebooks/Library/ and can be organised into subfolders.' },
      { type: 'h3', text: 'Browsing' },
      { type: 'ul', items: [
        'Subfolders are listed first with a triangle icon — click to enter',
        'A breadcrumb trail at the top shows your current location; click any segment to navigate back',
        'Only .cs and .csx files are shown',
        'Click a file to see a syntax-highlighted preview on the right',
        'Double-click a file to open it in an editor tab',
      ]},
      { type: 'h3', text: 'Inserting into a Notebook' },
      { type: 'ul', items: [
        'Insert as Cell — copies the file content into a new code cell at the current scroll position in the active notebook; the new cell flashes briefly',
        '#load — inserts a #load "absolute/path" directive; the kernel loads the file at execution time without copying its content',
      ]},
      { type: 'h3', text: 'Creating and Editing Files' },
      { type: 'ul', items: [
        'Click + in the panel header to create a new file — type a name and press Enter (.cs is appended if no extension given); Escape cancels',
        'New files open immediately in a library editor tab',
        'Click Edit in the preview or double-click a file to open it in an editor tab',
        'Library editor tabs show ● when there are unsaved changes; save with ⌘S',
      ]},
      { type: 'h3', text: 'Resizing the Panel' },
      { type: 'p', text: 'Drag the left edge of the Library panel to resize its width. Drag the horizontal divider between the file list and the preview to adjust the split.' },
    ],
  },
  {
    id: 'logs', title: 'Log Panel',
    content: [
      { type: 'p', text: 'Open the Log panel with Tools → Logs (⌘⇧G) or the Logs button in the toolbar. It shows a real-time interleaved stream from all open notebooks and writes daily rotating log files alongside the app.' },
      { type: 'h3', text: 'Live Stream' },
      { type: 'p', text: 'When "Live" is selected in the dropdown, log entries appear in real time and the panel auto-scrolls to the latest entry.' },
      { type: 'h3', text: 'Log Entry Tags' },
      { type: 'ul', items: [
        'NOTEBOOK — lifecycle events: kernel start, NuGet restore, cell execute, kernel exit',
        'USER — entries written from scripts with .Log() — shown in teal',
      ]},
      { type: 'h3', text: 'Historical Logs' },
      { type: 'p', text: 'Log files are written per calendar day. Use the dropdown to select a past day\'s log. Click the bin button to delete the selected log file.' },
      { type: 'h3', text: 'Identifying Notebooks in the Log' },
      { type: 'p', text: 'The live stream is interleaved across all open notebooks. Each NOTEBOOK entry includes a kernel ID prefix to distinguish output from different tabs.' },
    ],
  },
  {
    id: 'themes', title: 'Themes',
    content: [
      { type: 'p', text: 'Click the Theme button in the toolbar to open the theme picker. The selected theme applies instantly across the entire UI and is saved across sessions.' },
      { type: 'h3', text: 'Available Themes' },
      { type: 'ul', items: [
        'kl1nt — warm amber/slate dark (default)',
        'Nord — arctic blue-grey dark',
        'Dracula — purple/pink dark',
        'Tokyo Night — deep navy with electric blue accents',
        'Monokai — warm dark with green/cyan accents',
        'Catppuccin — soft pastel dark (Mocha variant)',
        'Solarized Dark — muted teal dark',
        'GitHub Light — clean white/grey light theme',
      ]},
      { type: 'h3', text: 'Color Swatches' },
      { type: 'p', text: 'Each theme in the picker shows three color swatches — base background, primary accent, and secondary accent — so you can preview the palette before selecting.' },
    ],
  },
  {
    id: 'shortcuts', title: 'Keyboard Shortcuts',
    content: [
      { type: 'shortcuts', rows: [
        { keys: '⌘ N', desc: 'New notebook' },
        { keys: '⌘ O', desc: 'Open notebook in a new tab' },
        { keys: '⌘ S', desc: 'Save notebook or library file' },
        { keys: '⌘ ⇧ S', desc: 'Save As…' },
        { keys: '⌘ ⇧ ↩', desc: 'Run all cells in active notebook' },
        { keys: '⌘ ⇧ P', desc: 'Toggle NuGet Packages panel' },
        { keys: '⌘ ⇧ ,', desc: 'Toggle Config panel' },
        { keys: '⌘ ⇧ L', desc: 'Toggle Code Library panel' },
        { keys: '⌘ ⇧ G', desc: 'Toggle Log panel' },
        { keys: '⌘ =  /  ⌘ +', desc: 'Increase font size' },
        { keys: '⌘ –', desc: 'Decrease font size' },
        { keys: '⌘ 0', desc: 'Reset font size to default' },
        { keys: 'F1', desc: 'Open this documentation' },
        { keys: 'Ctrl+↩', desc: 'Run current cell (code editor focused)' },
        { keys: 'Tab', desc: 'Indent selection / accept autocomplete suggestion' },
        { keys: 'Ctrl+Z  /  Ctrl+Y', desc: 'Undo / redo (in code editor)' },
        { keys: 'Enter', desc: 'Confirm rename or new library file name' },
        { keys: 'Escape', desc: 'Cancel rename or new-file prompt' },
      ]},
    ],
  },
  {
    id: 'fileformat', title: 'File Format',
    content: [
      { type: 'p', text: 'Notebooks are saved as .cnb files — plain JSON that is human-readable and version-control friendly.' },
      { type: 'h3', text: 'Top-Level Fields' },
      { type: 'ul', items: [
        'version — format version string (currently "1.0")',
        'title — display name of the notebook',
        'cells — ordered array of cell objects',
        'packages — array of { id, version } NuGet package references',
        'sources — array of feed objects with name, url, enabled',
        'config — array of { key, value } configuration pairs',
        'attachedDbIds — array of global connection IDs to re-attach on open',
      ]},
      { type: 'h3', text: 'Cell Object' },
      { type: 'code', text: '{\n  "id":         "uuid-v4",\n  "type":       "code",    // or "markdown"\n  "content":    "Console.WriteLine(\\"hello\\");",\n  "outputMode": "auto",    // auto | text | html | table | graph\n  "locked":     false\n}' },
      { type: 'h3', text: 'Library Files' },
      { type: 'p', text: 'Library snippets are plain .cs or .csx files stored in ~/Documents/Polyglot Notebooks/Library/. They are not embedded in .cnb files — notebooks reference them via #load directives or by copying content into a cell.' },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortId() {
  return Math.random().toString(36).slice(2, 10); // 8-char base-36
}

function makeCell(type = 'code', content = '') {
  return { id: shortId(), type, content, ...(type === 'code' ? { outputMode: 'auto', locked: false } : {}) };
}

// ── CodeMirror Editor ────────────────────────────────────────────────────────

function CodeEditor({ value, onChange, language = 'csharp', onCtrlEnter,
                      onRequestCompletions, onRequestLint, readOnly = false,
                      cellIndex = null }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onCtrlEnterRef = useRef(onCtrlEnter);
  const completionsRef = useRef(onRequestCompletions);
  const lintRef = useRef(onRequestLint);
  const readOnlyCompartmentRef = useRef(null);
  const cellIndexRef = useRef(cellIndex);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCtrlEnterRef.current = onCtrlEnter; }, [onCtrlEnter]);
  useEffect(() => { completionsRef.current = onRequestCompletions; }, [onRequestCompletions]);
  useEffect(() => { lintRef.current = onRequestLint; }, [onRequestLint]);
  useEffect(() => { cellIndexRef.current = cellIndex; }, [cellIndex]);

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
      if ((update.selectionSet || update.focusChanged) && update.view.hasFocus) {
        const pos  = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        _setCursorPos?.({ line: line.number, col: pos - line.from + 1, cellIndex: cellIndexRef.current });
      }
    });

    const blurHandler = EditorView.domEventHandlers({
      blur: () => { _setCursorPos?.(null); },
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
      blurHandler,
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
  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const columns   = Object.keys(rows[0]);
  const total     = rows.length;
  const pageCount = Math.ceil(total / pageSize);
  const start     = page * pageSize;
  const end       = Math.min(start + pageSize, total);
  const pageRows  = rows.slice(start, end);

  const onPageSize = (e) => { setPageSize(Number(e.target.value)); setPage(0); };

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {pageRows.map((row, i) => (
            <tr key={start + i}>
              {columns.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {total > 20 && (
        <div className="table-pager">
          <span className="table-pager-info">
            {start + 1}–{end} of <strong>{total}</strong> rows
          </span>
          <div className="table-pager-controls">
            <button className="table-pager-btn" onClick={() => setPage(0)}        disabled={page === 0}>«</button>
            <button className="table-pager-btn" onClick={() => setPage(p => p-1)} disabled={page === 0}>‹</button>
            <span className="table-pager-page">page {page + 1} / {pageCount}</span>
            <button className="table-pager-btn" onClick={() => setPage(p => p+1)} disabled={page >= pageCount - 1}>›</button>
            <button className="table-pager-btn" onClick={() => setPage(pageCount-1)} disabled={page >= pageCount - 1}>»</button>
          </div>
          <select className="table-pager-size" value={pageSize} onChange={onPageSize}>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      )}
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
  const time = formatLogTime(entry.timestamp);
  const tagClass = `log-tag log-tag-${(entry.tag || '').toLowerCase().replace(/[^a-z]/g, '')}`;
  return (
    <div className="log-entry">
      <span className="log-time">{time}</span>
      <span className={tagClass}>{entry.tag}</span>
      <span className="log-message">
        {entry.message}
        {entry.memoryMb != null && (
          <span className="log-memory"> · {entry.memoryMb.toFixed(0)} MB</span>
        )}
      </span>
    </div>
  );
}

// ── Resize hook ───────────────────────────────────────────────────────────────
// side: 'left'  → handle on left edge,  dragging left  increases width
//       'right' → handle on right edge, dragging right increases width
//       'top'   → handle on top edge,   dragging up    increases height

function useResize(defaultSize, side, onEnd) {
  const [size, setSize] = useState(defaultSize);
  const sizeRef = useRef(defaultSize);
  const onEndRef = useRef(onEnd);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    const startPos = side === 'top' ? e.clientY : e.clientX;
    const startSize = sizeRef.current;
    const min = 150;
    const max = side === 'top' ? 540 : 700;

    const onMove = (ev) => {
      const delta = side === 'left'  ? startPos - ev.clientX
                  : side === 'right' ? ev.clientX - startPos
                  :                    startPos - ev.clientY; // 'top'
      setSize(Math.max(min, Math.min(max, startSize + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      onEndRef.current?.(sizeRef.current);
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = side === 'top' ? 'row-resize' : 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [side]);

  return [size, onMouseDown];
}

function LogPanel({ isOpen, onToggle, currentMemoryMb = null }) {
  const [width, onResizeMouseDown] = useResize(320, 'left');
  const [logFiles, setLogFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('live');
  const [fileEntries, setFileEntries] = useState([]);
  const [liveEntries, setLiveEntries] = useState([]);
  const scrollRef = useRef(null);
  const memoryRef = useRef(currentMemoryMb);
  useEffect(() => { memoryRef.current = currentMemoryMb; }, [currentMemoryMb]);

  useEffect(() => {
    if (!isOpen || !window.electronAPI) return;
    window.electronAPI.getLogFiles().then(setLogFiles);
  }, [isOpen]);

  useEffect(() => {
    if (!window.electronAPI) return;
    const handler = (entry) => setLiveEntries((prev) => [
      ...prev,
      { ...entry, memoryMb: memoryRef.current },
    ]);
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
    <div className="log-panel" style={{ width }}>
      <div className="resize-handle resize-h" onMouseDown={onResizeMouseDown} />
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

function MarkdownCell({ cell, cellIndex, onUpdate, onDelete, onMoveUp, onMoveDown }) {
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
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
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
            cellIndex={cellIndex}
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
            dangerouslySetInnerHTML={{ __html: renderedHtml || '<span class="markdown-placeholder">Double-click to write markdown…</span>' }}
          />
        </div>
      )}
    </div>
  );
}

// ── CodeCell ─────────────────────────────────────────────────────────────────

function CodeCell({
  cell,
  cellIndex,
  outputs,
  isRunning,
  anyRunning,
  onUpdate,
  onRun,
  onInterrupt,
  onRunFrom,
  onRunTo,
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  return (
    <div className={`cell code-cell${isRunning ? ' running' : ''}${locked ? ' cell-locked' : ''}`}>
      {cellIndex != null && <span className="cell-index-badge">{cellIndex + 1}</span>}
      <div className="code-cell-header">
        <span className="cell-lang-label">C#</span>
        <div className="cell-run-group" ref={dropdownRef}>
          {isRunning ? (
            <button className="cell-stop-btn" onClick={onInterrupt}
                    title="Interrupt (stops async ops; use Reset for tight loops)">
              ⏹ Stop
            </button>
          ) : (
            <>
              <button className="run-btn" onClick={onRun} disabled={anyRunning} title="Run (Ctrl+Enter)">▶ Run</button>
              <button className="cell-run-chevron" onClick={() => setDropdownOpen(v => !v)}
                      disabled={anyRunning} title="More run options">▾</button>
            </>
          )}
          {dropdownOpen && !isRunning && (
            <div className="cell-run-dropdown">
              <button className="cell-run-dropdown-item" onClick={() => { onRun(); setDropdownOpen(false); }}>
                ▶&nbsp; Run this cell
              </button>
              <button className="cell-run-dropdown-item" onClick={() => { onRunFrom(); setDropdownOpen(false); }}>
                ▶▶ Run from here
              </button>
              <button className="cell-run-dropdown-item" onClick={() => { onRunTo(); setDropdownOpen(false); }}>
                ▲▲ Run to here
              </button>
            </div>
          )}
        </div>
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
        cellIndex={cellIndex}
      />
      <CellOutput messages={outputs} />
      <div className="code-cell-footer">
        <button
          className={`cell-lock-btn${locked ? ' cell-lock-btn-on' : ''}`}
          onClick={onToggleLock}
          title={locked ? 'Unlock cell' : 'Lock cell (read-only)'}
        >
          {locked ? '🔒' : '🔓'}
        </button>
      </div>
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
  const [height, onResizeMouseDown] = useResize(260, 'top');
  const [tab, setTab] = useState('installed');
  if (!isOpen) return null;

  return (
    <div className="nuget-panel" style={{ height }}>
      <div className="resize-handle resize-v" onMouseDown={onResizeMouseDown} />
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
  const [height, onResizeMouseDown] = useResize(200, 'top');
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
    <div className="config-panel" style={{ height }}>
      <div className="resize-handle resize-v" onMouseDown={onResizeMouseDown} />
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

// ── DB Panel components ────────────────────────────────────────────────────────

const DB_PROVIDERS = [
  { key: 'sqlite',     label: 'SQLite' },
  { key: 'sqlserver',  label: 'SQL Server' },
  { key: 'postgresql', label: 'PostgreSQL' },
];

function DbStatusDot({ status }) {
  return <span className={`db-status-dot db-status-${status || 'none'}`} />;
}

function DbSchemaTree({ schema }) {
  const [expanded, setExpanded] = useState({});
  if (!schema) return null;
  const toggle = (name) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  return (
    <div className="db-schema-tree">
      {schema.tables.map((table) => (
        <div key={`${table.schema}.${table.name}`} className="db-table-node">
          <div className="db-table-header" onClick={() => toggle(`${table.schema}.${table.name}`)}>
            <span className="db-table-arrow">{expanded[`${table.schema}.${table.name}`] ? '▾' : '▸'}</span>
            <span className="db-table-name">{table.schema ? `${table.schema}.${table.name}` : table.name}</span>
            <span className="db-col-count">{table.columns.length}</span>
          </div>
          {expanded[`${table.schema}.${table.name}`] && (
            <div className="db-columns-list">
              {table.columns.map((col) => (
                <div key={col.name} className={`db-column-node${col.isPrimaryKey ? ' db-col-pk' : ''}`}>
                  <span className="db-col-name">{col.name}</span>
                  <span className="db-col-type">{col.csharpType}</span>
                  {col.isPrimaryKey && <span className="db-pk-badge">PK</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DbConnectionForm({ connection, onSave, onCancel }) {
  const [name, setName] = useState(connection?.name ?? '');
  const [provider, setProvider] = useState(connection?.provider ?? 'sqlite');
  const [connStr, setConnStr] = useState(connection?.connectionString ?? '');

  const handleSave = () => {
    const n = name.trim();
    const cs = connStr.trim();
    if (!n || !cs) return;
    onSave({
      id: connection?.id ?? uuidv4(),
      name: n,
      provider,
      connectionString: cs,
    });
  };

  return (
    <div className="db-connection-form">
      <input
        className="nuget-input"
        placeholder="Connection name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        spellCheck={false}
      />
      <select
        className="nuget-input db-provider-select"
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
      >
        {DB_PROVIDERS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>
      <input
        className="nuget-input db-connstr-input"
        placeholder="Connection string"
        value={connStr}
        onChange={(e) => setConnStr(e.target.value)}
        spellCheck={false}
      />
      <div className="db-form-actions">
        <button className="nuget-remove-btn db-form-btn" onClick={onCancel}>Cancel</button>
        <button className="nuget-add-btn db-form-btn" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}

function DbPanel({
  isOpen, onToggle,
  connections, attachedDbs, notebookId,
  onAttach, onDetach, onRefresh, onRetry,
  onAdd, onUpdate, onRemove,
}) {
  const [height, onResizeMouseDown] = useResize(280, 'top');
  const [leftWidth, onColResizeMouseDown] = useResize(260, 'right');
  const [editingConn, setEditingConn] = useState(null); // null | 'new' | connection object

  if (!isOpen) return null;

  const handleSaveConn = (conn) => {
    if (editingConn === 'new') onAdd(conn);
    else onUpdate(conn.id, conn);
    setEditingConn(null);
  };

  return (
    <div className="db-panel" style={{ height }}>
      <div className="resize-handle resize-v" onMouseDown={onResizeMouseDown} />
      <div className="db-panel-header">
        <span className="db-panel-title">Databases</span>
        <button className="nuget-add-btn db-add-btn" onClick={() => setEditingConn('new')} title="Add connection">+ Add</button>
        <button className="nuget-close-btn" onClick={onToggle} title="Close">×</button>
      </div>
      <div className="db-panel-body">
        {/* Left: global connection list */}
        <div className="db-connections-col" style={{ width: leftWidth, minWidth: leftWidth }}>
          {connections.length === 0 && (
            <span className="config-empty" style={{ padding: '10px 12px', display: 'block' }}>
              No connections — click + Add
            </span>
          )}
          {connections.map((conn) => {
            const attached = attachedDbs.find((d) => d.connectionId === conn.id);
            const prov = DB_PROVIDERS.find((p) => p.key === conn.provider);
            return (
              <div
                key={conn.id}
                className={`db-connection-item${attached ? ' db-connection-attached' : ''}`}
              >
                <div className="db-conn-top">
                  <DbStatusDot status={attached?.status ?? 'none'} />
                  <span className="db-conn-name">{conn.name}</span>
                  <span className="db-provider-badge">{prov?.label ?? conn.provider}</span>
                </div>
                <div className="db-conn-actions">
                  {!attached ? (
                    <button className="db-action-btn db-attach-btn" onClick={() => onAttach(conn.id)} title="Attach to notebook">
                      Attach
                    </button>
                  ) : (
                    <button className="db-action-btn db-detach-btn" onClick={() => onDetach(conn.id)} title="Detach">
                      Detach
                    </button>
                  )}
                  <button className="db-icon-btn db-edit-btn" onClick={() => setEditingConn(conn)} title="Edit">✎</button>
                  <button className="db-icon-btn" onClick={() => { if (window.confirm(`Remove connection "${conn.name}"?`)) onRemove(conn.id); }} title="Remove">×</button>
                </div>
              </div>
            );
          })}
          {editingConn && (
            <DbConnectionForm
              connection={editingConn === 'new' ? null : editingConn}
              onSave={handleSaveConn}
              onCancel={() => setEditingConn(null)}
            />
          )}
        </div>

        {/* Draggable column divider */}
        <div className="db-col-divider" onMouseDown={onColResizeMouseDown} />

        {/* Right: schema tree for attached DBs */}
        <div className="db-schema-col">
          {attachedDbs.length === 0 && (
            <span className="config-empty" style={{ padding: '10px 12px', display: 'block' }}>
              No databases attached — click Attach
            </span>
          )}
          {attachedDbs.map((db) => {
            const conn = connections.find((c) => c.id === db.connectionId);
            return (
              <div key={db.connectionId} className="db-schema-section">
                <div className="db-schema-header">
                  <DbStatusDot status={db.status} />
                  <span className="db-conn-name">{conn?.name ?? db.connectionId}</span>
                  {db.varName && <span className="db-var-badge">{db.varName}</span>}
                  <button
                    className="db-icon-btn"
                    onClick={() => onRefresh(db.connectionId)}
                    title="Refresh schema"
                    disabled={db.status === 'connecting'}
                  >↻</button>
                </div>
                {db.status === 'error' && (
                  <div className="db-error-msg">
                    <span>{db.error}</span>
                    <button className="db-retry-btn" onClick={() => onRetry(db.connectionId)}>↺ Retry</button>
                  </div>
                )}
                {db.schema && <DbSchemaTree schema={db.schema} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── ThemePicker ───────────────────────────────────────────────────────────────

const THEMES = [
  { id: 'kl1nt',         name: 'kl1nt',          swatches: ['#18181b', '#c4964a', '#6889a0'] },
  { id: 'nord',          name: 'Nord',            swatches: ['#2e3440', '#88c0d0', '#81a1c1'] },
  { id: 'dracula',       name: 'Dracula',         swatches: ['#282a36', '#bd93f9', '#ff79c6'] },
  { id: 'tokyo-night',   name: 'Tokyo Night',     swatches: ['#1a1b2e', '#7aa2f7', '#bb9af7'] },
  { id: 'monokai',       name: 'Monokai',         swatches: ['#272822', '#a6e22e', '#66d9e8'] },
  { id: 'catppuccin',    name: 'Catppuccin',      swatches: ['#1e1e2e', '#cba6f7', '#89b4fa'] },
  { id: 'solarized-dark', name: 'Solarized Dark', swatches: ['#002b36', '#268bd2', '#2aa198'] },
  { id: 'github-light',  name: 'GitHub Light',    swatches: ['#ffffff', '#0969da', '#1a7f37'] },
];

function ThemePicker({ theme, onSelect }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Calculate popup position anchored to button
  const [popupStyle, setPopupStyle] = useState({});
  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopupStyle({ top: r.bottom + 4, left: r.left });
    }
  }, [open]);

  return (
    <div className="theme-picker-wrap">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Switch theme"
        className={`toolbar-icon-btn${open ? ' panel-active' : ''}`}
      >
        <IconTheme />
      </button>
      {open && createPortal(
        <div ref={popupRef} className="theme-picker-popup" style={popupStyle}>
          {THEMES.map((t) => (
            <div
              key={t.id}
              className={`theme-picker-item${theme === t.id ? ' active' : ''}`}
              onClick={() => { onSelect(t.id); setOpen(false); }}
            >
              <div className="theme-picker-swatches">
                {t.swatches.map((c, i) => (
                  <span key={i} className="theme-picker-swatch" style={{ background: c }} />
                ))}
              </div>
              <span className="theme-picker-name">{t.name}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Toolbar icons ─────────────────────────────────────────────────────────────

const _ic = { width: '13', height: '13', viewBox: '0 0 13 13', fill: 'none', style: { display: 'block', flexShrink: 0 } };

function IconSave() {
  return <svg {..._ic}>
    <rect x="1.5" y="1.5" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.1"/>
    <rect x="3" y="1.5" width="4.5" height="4" fill="currentColor"/>
    <rect x="3.5" y="7" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1"/>
  </svg>;
}
function IconOpen() {
  return <svg {..._ic} viewBox="0 0 14 13">
    <path d="M1 4.5h3l1.2-1.8h5.3V4.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    <path d="M1 4.5v6.8h12l-2-6.8H1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
  </svg>;
}
function IconReset() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M2.5 6.5A4 4 0 1 1 5.5 10.5"/>
    <path d="M2.5 4v2.5H5"/>
  </svg>;
}
function IconConfig() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <line x1="2" y1="3.5" x2="11" y2="3.5"/>
    <circle cx="4.5" cy="3.5" r="1.3" fill="currentColor" stroke="none"/>
    <line x1="2" y1="6.5" x2="11" y2="6.5"/>
    <circle cx="8.5" cy="6.5" r="1.3" fill="currentColor" stroke="none"/>
    <line x1="2" y1="9.5" x2="11" y2="9.5"/>
    <circle cx="5" cy="9.5" r="1.3" fill="currentColor" stroke="none"/>
  </svg>;
}
function IconPackages() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
    <path d="M6.5 1.5L11.5 4V9L6.5 11.5L1.5 9V4L6.5 1.5z"/>
    <path d="M1.5 4L6.5 6.5L11.5 4"/>
    <line x1="6.5" y1="6.5" x2="6.5" y2="11.5"/>
  </svg>;
}
function IconLogs() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <rect x="1.5" y="1.5" width="10" height="10" rx="1" strokeWidth="1.1"/>
    <path d="M4 5l2 1.5L4 8" strokeLinejoin="round"/>
    <line x1="7" y1="8" x2="10" y2="8"/>
  </svg>;
}
function IconDB() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1">
    <ellipse cx="6.5" cy="3.5" rx="4" ry="1.6"/>
    <path d="M2.5 3.5v6c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6v-6"/>
    <path d="M2.5 6.5c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6"/>
  </svg>;
}
function IconLibrary() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <path d="M6.5 11V3.5a.5.5 0 00-.5-.5H2a.5.5 0 00-.5.5V11"/>
    <path d="M6.5 11V3.5a.5.5 0 01.5-.5H11a.5.5 0 01.5.5V11"/>
    <line x1="1.5" y1="11" x2="11.5" y2="11"/>
  </svg>;
}
function IconTheme() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1">
    <circle cx="6.5" cy="6.5" r="5" />
    <path d="M6.5 1.5v10" strokeLinecap="round"/>
    <path d="M3.2 2.9A5 5 0 0 0 3.2 10.1" strokeLinecap="round"/>
    <path d="M1.5 6.5h5" strokeLinecap="round"/>
  </svg>;
}
function IconVars() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <rect x="1.5" y="2" width="4" height="9" rx="0.5"/>
    <line x1="7" y1="4" x2="11.5" y2="4"/>
    <line x1="7" y1="6.5" x2="11.5" y2="6.5"/>
    <line x1="7" y1="9" x2="10" y2="9"/>
  </svg>;
}
function IconToC() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <line x1="1.5" y1="3" x2="11.5" y2="3"/>
    <line x1="3.5" y1="6" x2="11.5" y2="6"/>
    <line x1="3.5" y1="9" x2="11.5" y2="9"/>
    <line x1="1.5" y1="3" x2="1.5" y2="9"/>
  </svg>;
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
  dbPanelOpen,
  onToggleDb,
  varsPanelOpen,
  onToggleVars,
  tocPanelOpen,
  onToggleToC,
  libraryPanelOpen,
  onToggleLibrary,
  theme,
  onThemeChange,
  dockLayout,
  savedLayouts,
  onSaveLayout,
  onLoadLayout,
  onDeleteLayout,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const displayName = getNotebookDisplayName(notebookPath, notebookTitle, 'Untitled Notebook');

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
      <button onClick={onRunAll} title="Run all code cells" className="toolbar-run-all">▶▶ Run All</button>
      <button onClick={onAddMarkdown} title="Add markdown cell">+ Markdown</button>
      <button onClick={onAddCode} title="Add code cell">+ Code</button>
      <div className="toolbar-separator" />
      <button className="toolbar-icon-btn" onClick={onSave} title="Save notebook"><IconSave /></button>
      <button className="toolbar-icon-btn" onClick={onLoad} title="Open notebook"><IconOpen /></button>
      <div className="toolbar-separator" />
      <ToolsMenu
        onReset={onReset}
        logPanelOpen={logPanelOpen}
        onToggleLogs={onToggleLogs}
        nugetPanelOpen={nugetPanelOpen}
        onToggleNuget={onToggleNuget}
        configPanelOpen={configPanelOpen}
        onToggleConfig={onToggleConfig}
        configCount={configCount}
        dbPanelOpen={dbPanelOpen}
        onToggleDb={onToggleDb}
        varsPanelOpen={varsPanelOpen}
        onToggleVars={onToggleVars}
        tocPanelOpen={tocPanelOpen}
        onToggleToC={onToggleToC}
        libraryPanelOpen={libraryPanelOpen}
        onToggleLibrary={onToggleLibrary}
      />
      {dockLayout && (
        <LayoutManager
          dockLayout={dockLayout}
          savedLayouts={savedLayouts ?? []}
          onSave={onSaveLayout}
          onLoad={onLoadLayout}
          onDelete={onDeleteLayout}
        />
      )}
      <ThemePicker theme={theme} onSelect={onThemeChange} />
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
| Database | Attach via **DB** panel → \`mydb.Users.ToList()\` |
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

    md(`## 10 · Databases

Use the **DB** button in the toolbar to open the database panel.

1. Click **+ Add** to register a named connection (SQLite, SQL Server, or PostgreSQL)
2. Click **Attach** to connect it to this notebook — the kernel introspects the schema and injects a typed \`DbContext\` variable
3. The variable name is derived from the connection name (e.g. *"My CRM"* → \`myCrm\`)
4. All tables appear as strongly-typed \`DbSet<T>\` properties — autocomplete works out of the box

| Task | Expression |
|------|------------|
| Fetch all rows | \`mydb.Users.ToList()\` |
| Filter | \`mydb.Orders.Where(o => o.Total > 100).ToList()\` |
| Project | \`mydb.Products.Select(p => new { p.Name, p.Price }).ToList()\` |
| Count | \`mydb.Users.Count()\` |
| Raw SQL | \`mydb.Users.FromSqlRaw("SELECT * FROM users WHERE active=1").ToList()\` |
| Async | \`await mydb.Orders.ToListAsync()\` |

The connection string stored in the DB panel is passed directly to EF Core — no code changes needed when switching environments.`),

    cs(`// ── Replace "mydb" with your actual connection variable name ──────────────

// 1. List all rows as a table
// mydb.Users.ToList().DisplayTable();

// 2. Filter and project
// mydb.Orders
//     .Where(o => o.Total > 100)
//     .Select(o => new { o.Id, o.CustomerName, o.Total, o.CreatedAt })
//     .OrderByDescending(o => o.Total)
//     .Take(20)
//     .ToList()
//     .DisplayTable();

// 3. Aggregate stats
// var stats = new {
//     Total  = mydb.Orders.Count(),
//     Revenue = mydb.Orders.Sum(o => (decimal?)o.Total) ?? 0,
//     Avg     = mydb.Orders.Average(o => (decimal?)o.Total) ?? 0,
// };
// stats.Display();

// 4. Raw SQL (useful for complex queries or non-EF operations)
// mydb.Database.ExecuteSqlRaw("UPDATE settings SET value='1' WHERE key='maintenance'");

Display.Html(@"
<p style='color:#5a7080;font-style:italic;font-size:12px'>
  Attach a database in the <strong style='color:#c4964a'>DB panel</strong> to run these examples.<br>
  The variable name shown in the schema panel (e.g. <code style='color:#6889a0'>mydb</code>)
  is what you use in code.
</p>");`),

    cs(`// ── Connection string examples ────────────────────────────────────────────
//
// SQLite  (file path):
//   Data Source=/path/to/database.db
//
// SQL Server:
//   Server=localhost;Database=MyDb;User Id=sa;Password=secret;TrustServerCertificate=True
//
// PostgreSQL:
//   Host=localhost;Database=mydb;Username=postgres;Password=secret
//
// ── Multiple databases in the same notebook ───────────────────────────────
// Attach more than one connection — each gets its own variable:
//
//   crm.Customers.ToList()          // "CRM" connection
//   analytics.PageViews.Count()     // "Analytics" connection
//
// ── Reset-safe ────────────────────────────────────────────────────────────
// All attached databases are automatically re-injected after a kernel reset,
// so your variables are always available without re-attaching.

Display.Html(@"<pre style='color:#6889a0;margin:0'>// Ready — attach a DB and start querying</pre>");`),
  ];
}

// ── Notebook factory ──────────────────────────────────────────────────────────

// Preset palette shown in the tab color picker (null = clear color)
const TAB_COLORS = [null, '#e05a6e', '#e0884e', '#c4c44a', '#5bb870', '#4eb8c4', '#6889a0', '#8b6ec4', '#c46e88'];

function TabPinIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" style={{ display: 'block' }}>
      <circle cx="4.5" cy="3.2" r="2.2" fill="currentColor" />
      <line x1="4.5" y1="5.4" x2="4.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// 4 pixel-ghost variants; 5×5 grid, 0=empty 1=body (gaps become eyes/bottom)
const GHOST_PATTERNS = [
  [[0,1,1,1,0],[1,1,1,1,1],[1,0,1,0,1],[1,1,1,1,1],[1,0,1,0,1]], // normal
  [[0,1,1,1,0],[1,1,1,1,1],[0,1,0,1,0],[1,1,1,1,1],[1,0,1,0,1]], // wide-eyed
  [[0,1,1,1,0],[1,1,1,1,1],[1,1,0,1,1],[1,1,1,1,1],[1,0,1,0,1]], // cyclops
  [[0,1,1,1,0],[1,0,1,0,1],[1,1,1,1,1],[1,1,1,1,1],[1,0,1,0,1]], // top-eyes
];

function PixelGhostIcon({ seed = 0 }) {
  const s = 2;
  const grid = GHOST_PATTERNS[seed % GHOST_PATTERNS.length];
  const rects = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell === 1) rects.push(<rect key={`${x}-${y}`} x={x * s} y={y * s} width={s} height={s} fill="currentColor" />);
  }));
  return (
    <svg width={5 * s} height={5 * s} viewBox={`0 0 ${5 * s} ${5 * s}`}
      style={{ display: 'block', imageRendering: 'pixelated' }}>
      {rects}
    </svg>
  );
}

function TabColorIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ display: 'block' }}>
      {/* Classic paint-palette shape */}
      <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8c1.1 0 2-.9 2-2 0-.52-.2-1-.52-1.36-.3-.36-.5-.84-.5-1.36 0-1.1.9-2 2-2h2.36C17.82 13.52 19.82 11.52 19.82 9 19.82 5.18 15.28 2 10 2z"/>
      <circle cx="6"  cy="10"  r="1.4" fill="white" opacity="0.7"/>
      <circle cx="7.5" cy="6.5" r="1.4" fill="white" opacity="0.7"/>
      <circle cx="12" cy="6.5" r="1.4" fill="white" opacity="0.7"/>
      <circle cx="14" cy="10"  r="1.4" fill="white" opacity="0.7"/>
    </svg>
  );
}

function createNotebook(withExamples = false) {
  return {
    id: uuidv4(),
    title: 'Untitled',
    path: null,
    isDirty: false,
    color: null,
    memoryHistory: [],
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
    attachedDbs: [],   // [{ connectionId, status, varName, schema, error }]
    dbPanelOpen: false,
    vars: [],
    varsPanelOpen: false,
    tocPanelOpen: false,
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
               onDragStart, onDragOver, onDrop, onDragEnd, onSetColor,
               isPinned = false, onTogglePin }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pickerPos, setPickerPos] = useState(null); // {top, left} when open
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const colorBtnRef = useRef(null);

  const name = getNotebookDisplayName(notebook.path, notebook.title);
  const ghostSeed = isPinned && notebook.path
    ? [...notebook.path].reduce((a, c) => a + c.charCodeAt(0), 0)
    : 0;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerPos) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerPos(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerPos]);

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(name);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename?.(trimmed);
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  const color = notebook.color;
  const tabStyle = color ? { borderTopColor: color, borderTopWidth: '2px' } : undefined;

  return (
    <div
      className={`tab${isActive ? ' tab-active' : ''}${isDragOver ? ' tab-drag-over' : ''}`}
      style={tabStyle}
      draggable={!editing}
      onDragStart={() => onDragStart(notebook.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(notebook.id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(notebook.id); }}
      onDragEnd={onDragEnd}
      onClick={editing ? undefined : onActivate}
      title={notebook.path || name}
    >
      {isPinned && notebook.path && (
        <span className="tab-ghost-icon" style={color ? { color } : undefined}>
          <PixelGhostIcon seed={ghostSeed} />
        </span>
      )}
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
      {onSetColor && (
        <button
          ref={colorBtnRef}
          className={`tab-color-btn${color ? ' has-color' : ''}`}
          style={color ? { color } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (pickerPos) { setPickerPos(null); return; }
            const rect = colorBtnRef.current.getBoundingClientRect();
            setPickerPos({ top: rect.bottom + 4, left: rect.left });
          }}
          title="Set tab color"
        ><TabColorIcon /></button>
      )}
      {notebook.path && (
        <button
          className={`tab-pin-btn${isPinned ? ' pinned' : ''}`}
          style={isPinned && color ? { color } : undefined}
          onClick={(e) => { e.stopPropagation(); onTogglePin?.(); }}
          title={isPinned ? 'Unpin tab' : 'Pin tab'}
        ><TabPinIcon /></button>
      )}
      {!isPinned && (
        <button
          className="tab-close"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="Close tab"
        >×</button>
      )}
      {pickerPos && createPortal(
        <div
          ref={pickerRef}
          className="tab-color-picker"
          style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {TAB_COLORS.map((c, i) => (
            <button
              key={i}
              className={`tab-color-swatch${c === color ? ' selected' : ''}${c === null ? ' swatch-clear' : ''}`}
              style={c ? { background: c } : undefined}
              title={c ?? 'Clear color'}
              onClick={() => { onSetColor(c); setPickerPos(null); }}
            />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function TabBar({ notebooks, activeId, onActivate, onClose, onNew, onRename,
                  onReorder, onSetColor, activeTabColor,
                  docsOpen, onActivateDocs, onCloseDocs,
                  libEditors, onCloseLibEditor,
                  pinnedPaths, onTogglePin }) {
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

  const pinnedNbs  = notebooks.filter((nb) => nb.path && pinnedPaths?.has(nb.path));
  const regularNbs = notebooks.filter((nb) => !nb.path || !pinnedPaths?.has(nb.path));

  const renderNb = (nb) => (
    <Tab
      key={nb.id}
      notebook={nb}
      isActive={nb.id === activeId}
      isDragOver={dragOverId === nb.id}
      onActivate={() => onActivate(nb.id)}
      onClose={() => onClose(nb.id)}
      onRename={(newName) => onRename(nb.id, newName)}
      onSetColor={(color) => onSetColor(nb.id, color)}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      isPinned={nb.path ? pinnedPaths?.has(nb.path) : false}
      onTogglePin={nb.path ? () => onTogglePin?.(nb.path) : undefined}
    />
  );

  return (
    <div className="tab-bar" style={activeTabColor ? { borderBottomColor: activeTabColor } : undefined}>
      {pinnedNbs.map(renderNb)}
      {pinnedNbs.length > 0 && regularNbs.length > 0 && (
        <div className="tab-bar-pin-spacer" />
      )}
      {regularNbs.map(renderNb)}
      {(libEditors || []).map((e) => (
        <Tab
          key={e.id}
          notebook={{ id: e.id, title: e.filename, isDirty: e.isDirty, path: e.fullPath }}
          isActive={activeId === e.id}
          isDragOver={false}
          onActivate={() => onActivate(e.id)}
          onClose={() => onCloseLibEditor(e.id)}
          draggable={false}
          onDragStart={() => {}}
          onDragOver={() => {}}
          onDrop={() => {}}
          onDragEnd={() => {}}
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
  onInterrupt,
  onRunFrom,
  onRunTo,
  onRename,
  requestCompletions,
  requestLint,
  libraryPanelOpen,
  onToggleLibrary,
  theme,
  onThemeChange,
  dockLayout,
  savedLayouts,
  onSaveLayout,
  onLoadLayout,
  onDeleteLayout,
}) {
  const { cells, outputs, running, kernelStatus,
          config, logPanelOpen, nugetPanelOpen, configPanelOpen,
          dbPanelOpen, varsPanelOpen, tocPanelOpen, path: notebookPath } = nb;

  const addCell = (type, afterIndex = null) => {
    const newCell = makeCell(type, '');
    onSetNbDirty((n) => {
      const next = [...n.cells];
      let idx;
      if (afterIndex === null || afterIndex === undefined) idx = next.length;
      else if (afterIndex < 0) idx = 0;
      else idx = afterIndex + 1;
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
        dbPanelOpen={dbPanelOpen}
        onToggleDb={() => onSetNb((n) => ({ dbPanelOpen: !n.dbPanelOpen }))}
        varsPanelOpen={varsPanelOpen}
        onToggleVars={() => onSetNb((n) => ({ varsPanelOpen: !n.varsPanelOpen }))}
        tocPanelOpen={tocPanelOpen}
        onToggleToC={() => onSetNb((n) => ({ tocPanelOpen: !n.tocPanelOpen }))}
        libraryPanelOpen={libraryPanelOpen}
        onToggleLibrary={onToggleLibrary}
        theme={theme}
        onThemeChange={onThemeChange}
        dockLayout={dockLayout}
        savedLayouts={savedLayouts}
        onSaveLayout={onSaveLayout}
        onLoadLayout={onLoadLayout}
        onDeleteLayout={onDeleteLayout}
      />
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
          <div key={cell.id} className="cell-wrapper" data-cell-id={cell.id}>
            {cell.type === 'markdown' ? (
              <MarkdownCell
                cell={cell}
                cellIndex={index}
                onUpdate={(val) => updateCell(cell.id, val)}
                onDelete={() => deleteCell(cell.id)}
                onMoveUp={() => moveCell(cell.id, -1)}
                onMoveDown={() => moveCell(cell.id, 1)}
              />
            ) : (
              <CodeCell
                cell={cell}
                cellIndex={index}
                outputs={outputs[cell.id]}
                isRunning={running.has(cell.id)}
                anyRunning={running.size > 0}
                onUpdate={(val) => updateCell(cell.id, val)}
                onRun={() => onRunCell(nb.id, cell)}
                onInterrupt={() => onInterrupt(nb.id)}
                onRunFrom={() => onRunFrom(nb.id, cell.id)}
                onRunTo={() => onRunTo(nb.id, cell.id)}
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
    </div>
  );
}

// ── Table of Contents Panel ───────────────────────────────────────────────────

function extractHeadings(cells) {
  const headings = [];
  cells.forEach((cell) => {
    if (cell.type !== 'markdown') return;
    (cell.content || '').split('\n').forEach((line) => {
      const m = line.match(/^(#{1,3})\s+(.+)$/);
      if (m) headings.push({ level: m[1].length, text: m[2].trim(), cellId: cell.id });
    });
  });
  return headings;
}

function TocPanel({ cells }) {
  const headings = useMemo(() => extractHeadings(cells), [cells]);
  const scroll = (cellId) => {
    document.querySelector(`[data-cell-id="${cellId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="toc-panel">
      <div className="toc-panel-header">
        <span className="toc-panel-title">Contents</span>
      </div>
      {headings.length === 0 ? (
        <div className="toc-empty">No headings found</div>
      ) : (
        <div className="toc-list">
          {headings.map((h, i) => (
            <button key={i} className={`toc-item toc-h${h.level}`} onClick={() => scroll(h.cellId)}>
              {h.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Variables Panel ───────────────────────────────────────────────────────────

function VarsPanel({ vars }) {
  const [search, setSearch] = useState('');
  const filtered = search
    ? vars.filter(v => v.name.toLowerCase().includes(search.toLowerCase()) ||
                       v.typeName.toLowerCase().includes(search.toLowerCase()))
    : vars;
  return (
    <div className="vars-panel">
      <div className="vars-panel-header">
        <span className="vars-panel-title">Variables</span>
        <input className="vars-search" placeholder="filter…" value={search}
               onChange={e => setSearch(e.target.value)} spellCheck={false} />
      </div>
      {filtered.length === 0 ? (
        <div className="vars-empty">{vars.length === 0 ? 'No variables in scope yet' : 'No matches'}</div>
      ) : (
        <div className="vars-table-wrap">
          <table className="vars-table">
            <thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.name} className="vars-row">
                  <td className="vars-name">{v.name}</td>
                  <td><span className="vars-type-badge">{v.typeName}</span></td>
                  <td className="vars-value" title={v.value}>
                    {v.isNull ? <span className="vars-null">null</span> : v.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Library Panel ─────────────────────────────────────────────────────────────

function LibraryPanel({ onInsert, onClose, onOpenFile }) {
  const [width, onResizeMouseDown] = useResize(300, 'left');
  const [previewHeight, onPreviewResizeMouseDown] = useResize(220, 'top');
  const [currentPath, setCurrentPath] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null); // { name, fullPath }
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const newFileInputRef = useRef(null);

  const subfolder = currentPath.join('/');

  const refresh = useCallback(async (keepSelected) => {
    if (!window.electronAPI) return;
    setLoading(true);
    const result = await window.electronAPI.getLibraryFiles(subfolder);
    setFolders(result.folders || []);
    setFiles(result.files || []);
    setLoading(false);
    if (!keepSelected || !(result.files || []).find((f) => f.name === keepSelected?.name)) {
      setSelected(null);
      setPreview('');
    }
  }, [subfolder]);

  useEffect(() => {
    setSelected(null);
    setPreview('');
    refresh(null);
  }, [currentPath]);

  const handleSelectFile = useCallback(async (file) => {
    setSelected(file);
    const content = await window.electronAPI.readLibraryFile(file.fullPath);
    setPreview(content);
  }, []);

  const handleDelete = useCallback(async (file, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${file.name}" from library?`)) return;
    await window.electronAPI.deleteLibraryFile(file.fullPath);
    if (selected?.name === file.name) { setSelected(null); setPreview(''); }
    refresh(null);
  }, [selected, refresh]);

  const navigateTo = (idx) => {
    if (idx < 0) setCurrentPath([]);
    else setCurrentPath(currentPath.slice(0, idx + 1));
  };

  const handleStartNew = () => {
    setCreatingNew(true);
    setNewFileName('');
    setTimeout(() => newFileInputRef.current?.focus(), 0);
  };

  const handleCreateNew = async () => {
    let name = newFileName.trim();
    if (!name) { setCreatingNew(false); return; }
    if (!name.endsWith('.cs') && !name.endsWith('.csx')) name += '.cs';
    const relativePath = subfolder ? `${subfolder}/${name}` : name;
    const result = await window.electronAPI.saveLibraryFile(relativePath, '');
    setCreatingNew(false);
    setNewFileName('');
    if (result?.success) {
      await refresh(null);
      onOpenFile({ name, fullPath: result.fullPath });
    }
  };

  return (
    <div className="library-panel" style={{ width }}>
      <div className="resize-handle resize-h" onMouseDown={onResizeMouseDown} />
      <div className="library-header">
        <span className="library-title">Code Library</span>
        <button onClick={handleStartNew} title="New file">+</button>
        <button onClick={() => window.electronAPI?.openLibraryFolder()} title="Open in Finder/Explorer">&#8862;</button>
        <button onClick={() => refresh(selected)} title="Refresh">&#8635;</button>
        <button onClick={onClose} title="Close">&#215;</button>
      </div>

      {creatingNew && (
        <div className="library-new-row">
          <input
            ref={newFileInputRef}
            className="library-new-input"
            placeholder="filename.cs"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateNew();
              if (e.key === 'Escape') { setCreatingNew(false); setNewFileName(''); }
            }}
          />
          <button className="library-new-confirm" onClick={handleCreateNew}>Create</button>
          <button className="library-new-cancel" onClick={() => { setCreatingNew(false); setNewFileName(''); }}>&#215;</button>
        </div>
      )}

      <div className="library-breadcrumb">
        <span className="library-bc-seg" onClick={() => navigateTo(-1)}>Library</span>
        {currentPath.map((seg, i) => (
          <React.Fragment key={i}>
            <span className="library-bc-sep">/</span>
            <span className="library-bc-seg" onClick={() => navigateTo(i)}>{seg}</span>
          </React.Fragment>
        ))}
      </div>

      <div className="library-files">
        {loading && <div className="library-empty">Loading&hellip;</div>}
        {!loading && folders.length === 0 && files.length === 0 && (
          <div className="library-empty">
            {currentPath.length === 0 ? (
              <>
                <p>No snippets yet.</p>
                <p>Add <code>.cs</code> or <code>.csx</code> files, or subfolders, to your library.</p>
                <button className="library-folder-btn" onClick={() => window.electronAPI?.openLibraryFolder()}>
                  Open Library Folder
                </button>
              </>
            ) : (
              <p>Empty folder.</p>
            )}
          </div>
        )}
        {folders.map((name) => (
          <div key={name} className="library-folder" onClick={() => setCurrentPath([...currentPath, name])}>
            <span className="library-folder-icon">&#9656;</span>
            <span className="library-folder-name">{name}</span>
          </div>
        ))}
        {files.map((f) => (
          <div
            key={f.name}
            className={`library-file${selected?.name === f.name ? ' library-file-selected' : ''}`}
            onClick={() => handleSelectFile(f)}
            onDoubleClick={() => onOpenFile(f)}
          >
            <span className="library-file-name">{f.name}</span>
            <span className="library-file-size">{f.size}</span>
            <button className="library-file-delete" onClick={(e) => handleDelete(f, e)} title="Delete">&#215;</button>
          </div>
        ))}
      </div>

      {selected && (
        <>
        <div className="library-split-handle" onMouseDown={onPreviewResizeMouseDown} />
        <div className="library-preview" style={{ height: previewHeight }}>
          <div className="library-preview-header">
            <span className="library-preview-name">{selected.name}</span>
          </div>
          <div className="library-preview-editor">
            <CodeEditor value={preview} onChange={() => {}} language="csharp" readOnly={true} />
          </div>
          <div className="library-insert-row">
            <button className="library-insert-btn" onClick={() => onInsert(preview)}>
              Insert as Cell
            </button>
            <button
              className="library-insert-btn library-load-btn"
              onClick={() => onInsert(`#load "${selected.fullPath}"`)}
              title="#load directive — Roslyn loads the file from disk"
            >
              #load
            </button>
            <button
              className="library-insert-btn library-edit-btn"
              onClick={() => onOpenFile(selected)}
              title="Open file in editor tab"
            >
              Edit
            </button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

// ── Library File Editor ────────────────────────────────────────────────────────

function LibraryEditorPane({ editor, onContentChange, onSave }) {
  return (
    <div className="lib-editor-pane">
      <div className="lib-editor-toolbar">
        <span className="lib-editor-filename">{editor.filename}</span>
        {editor.isDirty && <span className="lib-editor-dirty">&#9679;</span>}
        <span className="lib-editor-path">{editor.fullPath}</span>
        <button
          className="lib-editor-save-btn"
          onClick={() => onSave(editor.id)}
          title="Save (Ctrl+S)"
        >
          Save
        </button>
      </div>
      <div className="lib-editor-content">
        <CodeEditor
          value={editor.content}
          onChange={(val) => onContentChange(editor.id, val)}
          language="csharp"
        />
      </div>
    </div>
  );
}

// ── Dock Layout System ────────────────────────────────────────────────────────

const DEFAULT_DOCK_LAYOUT = {
  assignments: { log: 'right', nuget: 'bottom', config: 'bottom', db: 'bottom', library: 'left', vars: 'right', toc: 'left' },
  order:       { log: 0, nuget: 0, config: 1, db: 2, library: 0, vars: 1, toc: 1 },
  sizes:       { left: 300, right: 320, bottom: 280 },
  floatPos:    {},
  zoneTab:     { left: 'library', right: 'log', bottom: 'nuget' },
};

const DEFAULT_FLOAT_W = 360;
const DEFAULT_FLOAT_H = 300;

const PANEL_META = {
  log:     { label: 'Logs',      icon: <IconLogs /> },
  nuget:   { label: 'Packages',  icon: <IconPackages /> },
  config:  { label: 'Config',    icon: <IconConfig /> },
  db:      { label: 'DB',        icon: <IconDB /> },
  library: { label: 'Library',   icon: <IconLibrary /> },
  vars:    { label: 'Variables', icon: <IconVars /> },
  toc:     { label: 'Contents',  icon: <IconToC /> },
};

function renderPanelContent(panelId, p) {
  if (!p) return null;
  switch (panelId) {
    case 'log':     return <LogPanel {...p} />;
    case 'nuget':   return <NugetPanel {...p} />;
    case 'config':  return <ConfigPanel {...p} />;
    case 'db':      return <DbPanel {...p} />;
    case 'vars':    return <VarsPanel {...p} />;
    case 'toc':     return <TocPanel {...p} />;
    case 'library': return <LibraryPanel {...p} />;
    default:        return null;
  }
}

function IconLayout() {
  return <svg {..._ic} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <rect x="1.5" y="1.5" width="10" height="10" rx="1"/>
    <line x1="4.5" y1="1.5" x2="4.5" y2="11.5"/>
    <line x1="1.5" y1="6.5" x2="11.5" y2="6.5"/>
  </svg>;
}

// ── Dock debug logging ────────────────────────────────────────────────────────
// Logs appear in the app's Logs panel (tag: DOCK).  Remove when bug is resolved.
const dockLog = (...args) => window.electronAPI?.rendererLog('DOCK', args.join(' '));

// ── DockZone ──────────────────────────────────────────────────────────────────

function DockZone({ zone, dockLayout, openFlags, panelProps,
                    onTabChange, onPanelClose, onStartDrag, onResizeEnd }) {
  const resizeSide = zone === 'left' ? 'right' : zone === 'right' ? 'left' : 'top';
  const [size, onResizeMouseDown] = useResize(
    dockLayout.sizes[zone] ?? 300,
    resizeSide,
    (newSize) => onResizeEnd?.(zone, newSize)
  );

  // Panels assigned to this zone, sorted by their order value
  const assigned = Object.keys(dockLayout.assignments)
    .filter((id) => dockLayout.assignments[id] === zone)
    .sort((a, b) => (dockLayout.order[a] ?? 0) - (dockLayout.order[b] ?? 0));

  // Only panels that are currently open (have their open flag set)
  const openPanels = assigned.filter((id) => openFlags[id]);

  // Active tab: prefer saved zoneTab, fall back to first open panel
  let activeTab = dockLayout.zoneTab[zone];
  if (!openPanels.includes(activeTab)) activeTab = openPanels[0] ?? null;

  const visible = openPanels.length > 0;

  // Always render the same root element regardless of visible state.
  // This keeps hook state (useResize) stable and avoids reconciliation issues
  // when the first panel is added to a previously-empty zone.
  const zoneStyle = visible ? (zone === 'bottom' ? { height: size } : { width: size }) : undefined;

  return (
    <div
      className={`dock-zone dock-zone-${zone}${visible ? '' : ' dock-zone-hidden'}`}
      style={zoneStyle}
    >
      <div className="dock-zone-rh" onMouseDown={onResizeMouseDown} />
      <div className="dock-zone-tabbar">
        {openPanels.map((id) => (
          <div
            key={id}
            className={`dock-zone-tab${id === activeTab ? ' active' : ''}`}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              onStartDrag(id, e.clientX, e.clientY);
            }}
            onClick={() => onTabChange(zone, id)}
          >
            {PANEL_META[id].icon}
            <span>{PANEL_META[id].label}</span>
            <span
              className="dock-zone-tab-close"
              onClick={(e) => { e.stopPropagation(); onPanelClose(id); }}
            >×</span>
          </div>
        ))}
      </div>
      {/* All assigned panels are kept mounted to preserve state; only the active one is shown */}
      {assigned.map((id) => (
        <div
          key={id}
          className="dock-zone-content"
          style={{ display: visible && id === activeTab && openFlags[id] ? undefined : 'none' }}
        >
          {panelProps[id] && renderPanelContent(id, { ...panelProps[id], isOpen: !!openFlags[id] })}
        </div>
      ))}
    </div>
  );
}

// ── FloatPanel ────────────────────────────────────────────────────────────────

function FloatPanel({ panelId, pos, onMove, onClose, onStartDrag, children }) {
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);

  const handleHeaderDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const ox = e.clientX - posRef.current.x;
    const oy = e.clientY - posRef.current.y;
    const mv = (ev) => onMove(panelId, { ...posRef.current, x: ev.clientX - ox, y: ev.clientY - oy });
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  };

  const handleResizeDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, sw = posRef.current.w, sh = posRef.current.h;
    const mv = (ev) => onMove(panelId, {
      ...posRef.current,
      w: Math.max(260, sw + ev.clientX - sx),
      h: Math.max(150, sh + ev.clientY - sy),
    });
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  };

  return (
    <div className="float-panel" style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}>
      <div className="float-panel-header" onMouseDown={handleHeaderDown}>
        <div
          className="float-panel-drag-handle"
          title="Drag to dock"
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onStartDrag?.(panelId, e.clientX, e.clientY);
          }}
        >⠿</div>
        {PANEL_META[panelId]?.icon}
        <span>{PANEL_META[panelId]?.label ?? panelId}</span>
        <button
          className="dock-zone-tab-close"
          style={{ marginLeft: 'auto' }}
          onClick={() => onClose(panelId)}
        >×</button>
      </div>
      <div className="float-panel-body">{children}</div>
      <div className="float-panel-resize" onMouseDown={handleResizeDown} />
    </div>
  );
}

// ── DockDropOverlay ───────────────────────────────────────────────────────────

// Pure visual overlay — no drag events. Zone hover state is driven by
// document-level mousemove in App computing cursor position against edge thresholds.
const DOCK_DROP_ZONES = [
  { key: 'left',   label: '← Left'   },
  { key: 'right',  label: 'Right →'  },
  { key: 'bottom', label: '↓ Bottom' },
  { key: 'float',  label: 'Float'    },
];
function DockDropOverlay({ sourceZone, active, hovered }) {
  return (
    <div className={`dock-drop-overlay${active ? ' dock-drop-overlay-active' : ''}`}>
      {DOCK_DROP_ZONES.map(({ key, label }) => {
        const isSame = active && key === sourceZone;
        return (
          <div
            key={key}
            className={`dock-drop-zone dock-drop-${key}${hovered === key ? ' drag-over' : ''}${isSame ? ' same-zone' : ''}`}
          >
            <span className="dock-drop-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── ToolsMenu ─────────────────────────────────────────────────────────────────

function ToolsMenu({
  onReset,
  logPanelOpen, onToggleLogs,
  nugetPanelOpen, onToggleNuget,
  configPanelOpen, onToggleConfig, configCount,
  dbPanelOpen, onToggleDb,
  varsPanelOpen, onToggleVars,
  tocPanelOpen, onToggleToC,
  libraryPanelOpen, onToggleLibrary,
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popupRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({});
  const popupPosRef = useRef({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reposition after every render so the menu tracks the button through layout shifts.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const top = r.bottom + 4;
    const right = window.innerWidth - r.right;
    if (top !== popupPosRef.current.top || right !== popupPosRef.current.right) {
      popupPosRef.current = { top, right };
      setPopupStyle({ top, right });
    }
  });

  const close = () => setOpen(false);

  const kernelItems = [
    { icon: <IconReset />, label: 'Reset Kernel', action: () => { onReset(); close(); } },
  ];
  const panelItems = [
    { icon: <IconConfig />,    label: configCount > 0 ? `Config (${configCount})` : 'Config',
      action: onToggleConfig, active: configPanelOpen },
    { icon: <IconPackages />,  label: 'Packages',  action: onToggleNuget,    active: nugetPanelOpen },
    { icon: <IconLogs />,      label: 'Logs',       action: onToggleLogs,     active: logPanelOpen },
    { icon: <IconDB />,        label: 'Database',   action: onToggleDb,       active: dbPanelOpen },
    { icon: <IconVars />,      label: 'Variables',  action: onToggleVars,     active: varsPanelOpen },
    { icon: <IconToC />,       label: 'Contents',   action: onToggleToC,      active: tocPanelOpen },
    { icon: <IconLibrary />,   label: 'Library',    action: onToggleLibrary,  active: libraryPanelOpen },
  ];

  const anyPanelActive = panelItems.some((p) => p.active);

  return (
    <div className="theme-picker-wrap">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Tools"
        className={`toolbar-icon-text-btn${open || anyPanelActive ? ' panel-active' : ''}`}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ display: 'block', flexShrink: 0 }}>
          <rect x="1.5" y="2.5" width="10" height="1.1" rx="0.5" fill="currentColor"/>
          <rect x="1.5" y="5.95" width="10" height="1.1" rx="0.5" fill="currentColor"/>
          <rect x="1.5" y="9.4" width="10" height="1.1" rx="0.5" fill="currentColor"/>
        </svg>
        <span>Tools</span>
      </button>
      {open && createPortal(
        <div ref={popupRef} className="tools-menu-popup" style={popupStyle}>
          <div className="tools-menu-section-label">Kernel</div>
          {kernelItems.map(({ icon, label, action }) => (
            <button key={label} className="tools-menu-item" onClick={action}>
              <span className="tools-menu-icon">{icon}</span>
              <span className="tools-menu-label">{label}</span>
            </button>
          ))}
          <div className="tools-menu-separator" />
          <div className="tools-menu-section-label">Panels</div>
          {panelItems.map(({ icon, label, action, active }) => (
            <button key={label} className={`tools-menu-item${active ? ' tools-menu-item-active' : ''}`} onClick={action}>
              <span className="tools-menu-icon">{icon}</span>
              <span className="tools-menu-label">{label}</span>
              {active && <span className="tools-menu-active-dot" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── LayoutManager ─────────────────────────────────────────────────────────────

function LayoutManager({ dockLayout, savedLayouts, onSave, onLoad, onDelete }) {
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const btnRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const [popupStyle, setPopupStyle] = useState({});
  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopupStyle({ top: r.bottom + 4, left: r.left });
    }
  }, [open]);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    onSave(name, dockLayout);
    setSaveName('');
    setOpen(false);
  };

  return (
    <div className="theme-picker-wrap">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Layout Manager"
        className={`toolbar-icon-btn${open ? ' panel-active' : ''}`}
      >
        <IconLayout />
      </button>
      {open && createPortal(
        <div ref={popupRef} className="layout-manager-popup" style={popupStyle}>
          {savedLayouts.length === 0 && (
            <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>No saved layouts</div>
          )}
          {savedLayouts.map((sl) => (
            <div key={sl.name} className="layout-entry">
              <span style={{ flex: 1, fontSize: '11px' }}>{sl.name}</span>
              <button
                className="toolbar-icon-btn"
                onClick={() => { onLoad(sl); setOpen(false); }}
                title="Load layout"
                style={{ fontSize: '10px', padding: '2px 6px' }}
              >Load</button>
              <button
                className="toolbar-icon-btn"
                onClick={() => onDelete(sl.name)}
                title="Delete layout"
                style={{ fontSize: '10px', padding: '2px 4px', color: 'var(--status-error)' }}
              >×</button>
            </div>
          ))}
          <div className="layout-save-row">
            <input
              className="toolbar-rename-input"
              style={{ flex: 1, fontSize: '11px', padding: '2px 6px' }}
              placeholder="Layout name…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setOpen(false); }}
            />
            <button
              className="toolbar-icon-btn"
              onClick={handleSave}
              style={{ fontSize: '10px', padding: '2px 6px' }}
            >Save</button>
          </div>
        </div>,
        document.body
      )}
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
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [libEditors, setLibEditors] = useState([]);
  const [dbConnections, setDbConnections] = useState([]);
  const [theme, setTheme] = useState('kl1nt');
  const isFirstThemeRender = useRef(true);
  const themeRef = useRef('kl1nt');
  useEffect(() => { themeRef.current = theme; }, [theme]);
  const [pinnedPaths, setPinnedPaths] = useState(() => new Set());
  const initialNbIdRef = useRef(notebooks[0].id);

  // Dock layout state
  const [dockLayout, setDockLayout] = useState(DEFAULT_DOCK_LAYOUT);
  const [savedLayouts, setSavedLayouts] = useState([]);
  const [draggingPanel, setDraggingPanel] = useState(null);
  const [hoveredDropZone, setHoveredDropZone] = useState(null);
  const [layoutKey, setLayoutKey] = useState(0);
  const dockLayoutRef = useRef(DEFAULT_DOCK_LAYOUT);
  const savedLayoutsRef = useRef([]);
  const draggingPanelRef = useRef(null);
  const hoveredDropZoneRef = useRef(null);
  const pendingDragRef = useRef(null); // { panelId, startX, startY } | null
  useEffect(() => { dockLayoutRef.current = dockLayout; }, [dockLayout]);
  useEffect(() => { savedLayoutsRef.current = savedLayouts; }, [savedLayouts]);

  // Synchronized ref pair — callbacks read fresh state without stale closures
  const notebooksRef = useRef(notebooks);
  useEffect(() => { notebooksRef.current = notebooks; }, [notebooks]);
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const libEditorsRef = useRef(libEditors);
  useEffect(() => { libEditorsRef.current = libEditors; }, [libEditors]);
  const dbConnectionsRef = useRef(dbConnections);
  useEffect(() => { dbConnectionsRef.current = dbConnections; }, [dbConnections]);
  const pinnedPathsRef = useRef(pinnedPaths);
  useEffect(() => { pinnedPathsRef.current = pinnedPaths; }, [pinnedPaths]);

  // Auto-save the notebook file whenever DB attachment state changes (ready/detached),
  // so users don't need to manually save to persist which DBs are attached.
  const prevDbReadyRef = useRef({});
  useEffect(() => {
    for (const nb of notebooks) {
      if (!nb.path) continue;
      const curr = nb.attachedDbs
        .filter((d) => d.status === 'ready')
        .map((d) => d.connectionId)
        .sort()
        .join(',');
      const prev = prevDbReadyRef.current[nb.id];
      if (prev !== undefined && prev !== curr) {
        // Build data directly from nb (not via notebooksRef, which may lag)
        const data = {
          version: '1.0',
          title: getNotebookDisplayName(nb.path, nb.title, 'notebook'),
          color: nb.color || null,
          packages: nb.nugetPackages.map(({ id, version }) => ({ id, version: version || null })),
          sources: nb.nugetSources,
          config: nb.config.filter((e) => e.key.trim()),
          attachedDbIds: nb.attachedDbs.filter((d) => d.status === 'ready').map((d) => d.connectionId),
          cells: nb.cells.map(({ id, type, content, outputMode, locked }) => ({
            id, type, content,
            ...(type === 'code' ? { outputMode: outputMode || 'auto', locked: locked || false } : {}),
          })),
        };
        window.electronAPI?.saveNotebookTo(nb.path, data);
      }
      prevDbReadyRef.current[nb.id] = curr;
    }
  }, [notebooks]);

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
  const pendingResolversRef = useRef({});    // cellId -> resolveFn
  const pendingCompletionsRef = useRef({});  // requestId -> resolveFn
  const pendingLintRef = useRef({});         // requestId -> resolveFn

  // Cancel all pending cell executions for a given cell list (e.g. on reset or tab close)
  const cancelPendingCells = useCallback((cells) => {
    cells.forEach((cell) => {
      const resolve = pendingResolversRef.current[cell.id];
      if (resolve) {
        delete pendingResolversRef.current[cell.id];
        resolve({ success: false });
      }
    });
  }, []);

  // ── DB connections load/save ───────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI?.loadDbConnections().then((list) => {
      if (Array.isArray(list)) setDbConnections(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    window.electronAPI?.saveDbConnections(dbConnections);
  }, [dbConnections]);

  // ── Theme load/apply/save + pinned tabs restore ────────────────────────────
  useEffect(() => {
    window.electronAPI?.loadAppSettings().then((s) => {
      if (s?.theme) setTheme(s.theme);
      if (s?.dockLayout) {
        const loaded = {
          ...DEFAULT_DOCK_LAYOUT,
          ...s.dockLayout,
          // Deep-merge sub-objects so newly added panels (e.g. vars) are always present
          assignments: { ...DEFAULT_DOCK_LAYOUT.assignments, ...(s.dockLayout.assignments || {}) },
          order:       { ...DEFAULT_DOCK_LAYOUT.order,       ...(s.dockLayout.order       || {}) },
        };
        setDockLayout(loaded);
        dockLayoutRef.current = loaded;
      }
      if (Array.isArray(s?.savedLayouts)) {
        setSavedLayouts(s.savedLayouts);
        savedLayoutsRef.current = s.savedLayouts;
      }
      const pinned = Array.isArray(s?.pinnedTabs) ? s.pinnedTabs : [];
      if (pinned.length === 0) return;
      setPinnedPaths(new Set(pinned));
      // Open pinned files in new tabs on startup
      Promise.allSettled(pinned.map((fp) => window.electronAPI.openRecentFile(fp)))
        .then((results) => {
          const toAdd = [];
          results.forEach((r) => {
            if (r.status !== 'fulfilled' || !r.value?.success) return;
            const nb = createNotebook(false);
            const loadedPkgs = (r.value.data.packages || []).map((p) => ({ ...p, status: 'pending' }));
            const savedDbIds = r.value.data.attachedDbIds || [];
            toAdd.push({
              nb: {
                ...nb,
                path: r.value.filePath,
                color: r.value.data.color || null,
                cells: r.value.data.cells || [],
                nugetPackages: loadedPkgs,
                nugetSources: r.value.data.sources || [...DEFAULT_NUGET_SOURCES],
                config: r.value.data.config || [],
                attachedDbs: savedDbIds.map((id) => ({
                  connectionId: id, status: 'connecting', varName: '', schema: null, error: undefined,
                })),
                isDirty: false,
              },
            });
          });
          if (toAdd.length === 0) return;
          setNotebooks((prev) => {
            // Remove initial blank tab if it was never touched
            const initId = initialNbIdRef.current;
            const initNb = prev.find((n) => n.id === initId);
            const isBlank = initNb && !initNb.isDirty && !initNb.path
              && initNb.cells.length <= 1 && !(initNb.cells[0]?.content);
            const base = isBlank ? prev.filter((n) => n.id !== initId) : prev;
            const existingPaths = new Set(base.map((n) => n.path).filter(Boolean));
            const fresh = toAdd.filter(({ nb }) => !existingPaths.has(nb.path)).map(({ nb }) => nb);
            return [...base, ...fresh];
          });
          toAdd.forEach(({ nb }) => window.electronAPI.startKernel(nb.id));
        });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  useEffect(() => {
    if (isFirstThemeRender.current) { isFirstThemeRender.current = false; return; }
    window.electronAPI?.saveAppSettings({ theme, pinnedTabs: [...pinnedPathsRef.current], dockLayout: dockLayoutRef.current, savedLayouts: savedLayoutsRef.current });
  }, [theme]); // pinnedPathsRef is stable ref, no dep needed

  // When dbConnections first loads, send db_connect for any notebooks whose
  // saved DBs are still 'connecting' (kernel was already ready before connections loaded).
  useEffect(() => {
    if (dbConnections.length === 0) return;
    for (const nb of notebooksRef.current) {
      if (nb.kernelStatus !== 'ready') continue;
      const toReattach = nb.attachedDbs.filter((d) => d.status === 'connecting');
      for (const d of toReattach) {
        const conn = dbConnections.find((c) => c.id === d.connectionId);
        if (!conn) continue;
        const varName = conn.name
          .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
          .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
          .replace(/^[^a-zA-Z]/, 'db');
        setNb(nb.id, (n) => ({
          attachedDbs: n.attachedDbs.map((a) =>
            a.connectionId === d.connectionId ? { ...a, varName } : a
          ),
        }));
        window.electronAPI?.sendToKernel(nb.id, {
          type: 'db_connect',
          connectionId: conn.id,
          name: conn.name,
          provider: conn.provider,
          connectionString: conn.connectionString,
          varName,
        });
      }
    }
  }, [dbConnections, setNb]);

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
          setNb(notebookId, { kernelStatus: 'ready', vars: [] });
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
              // Re-attach saved DBs
              const toReattach = nb.attachedDbs.filter((d) => d.status === 'connecting');
              for (const d of toReattach) {
                const conn = dbConnectionsRef.current.find((c) => c.id === d.connectionId);
                if (!conn) continue; // connections may not be loaded yet — leave as 'connecting'
                const varName = conn.name
                  .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
                  .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
                  .replace(/^[^a-zA-Z]/, 'db');
                setNb(notebookId, (n) => ({
                  attachedDbs: n.attachedDbs.map((a) =>
                    a.connectionId === d.connectionId ? { ...a, varName } : a
                  ),
                }));
                window.electronAPI?.sendToKernel(notebookId, {
                  type: 'db_connect',
                  connectionId: conn.id,
                  name: conn.name,
                  provider: conn.provider,
                  connectionString: conn.connectionString,
                  varName,
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
            // Ignore process-exit errors that arrive while we're already restarting
            setNb(notebookId, (n) =>
              n.kernelStatus === 'starting' ? {} : { kernelStatus: 'error' }
            );
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
            const extra = msg.cancelled
              ? { outputs: { ...n.outputs, [msg.id]: [...(n.outputs[msg.id] || []), { type: 'interrupted' }] } }
              : {};
            return { running: next, ...extra };
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

        case 'memory_mb':
          setNb(notebookId, (n) => ({
            memoryHistory: [...n.memoryHistory.slice(-59), msg.mb],
          }));
          break;

        case 'vars_update':
          setNb(notebookId, { vars: msg.vars });
          break;

        case 'nuget_preload_complete':
          break;

        case 'reset_complete':
          setNb(notebookId, { kernelStatus: 'ready', vars: [] });
          break;

        case 'db_schema':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.map((d) =>
              d.connectionId === msg.connectionId
                ? { ...d, schema: { databaseName: msg.databaseName, tables: msg.tables } }
                : d
            ),
          }));
          break;

        case 'db_ready':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.map((d) =>
              d.connectionId === msg.connectionId
                ? { ...d, status: 'ready', varName: msg.varName, error: undefined }
                : d
            ),
          }));
          break;

        case 'db_error':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.map((d) =>
              d.connectionId === msg.connectionId
                ? { ...d, status: 'error', error: msg.message }
                : d
            ),
          }));
          break;

        case 'db_disconnected':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.filter((d) => d.connectionId !== msg.connectionId),
          }));
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

  const runFrom = useCallback(async (notebookId, cellId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb || nb.running.size > 0) return;
    const idx = nb.cells.findIndex((c) => c.id === cellId);
    if (idx < 0) return;
    for (const cell of nb.cells.slice(idx).filter((c) => c.type === 'code'))
      await runCell(notebookId, cell);
  }, [runCell]);

  const runTo = useCallback(async (notebookId, cellId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb || nb.running.size > 0) return;
    const idx = nb.cells.findIndex((c) => c.id === cellId);
    if (idx < 0) return;
    for (const cell of nb.cells.slice(0, idx + 1).filter((c) => c.type === 'code'))
      await runCell(notebookId, cell);
  }, [runCell]);

  // ── Kernel interrupt ───────────────────────────────────────────────────────

  const handleInterrupt = useCallback((notebookId) => {
    window.electronAPI?.interruptKernel(notebookId);
  }, []);

  // ── Kernel reset ───────────────────────────────────────────────────────────

  const handleReset = useCallback((notebookId) => {
    if (!window.electronAPI) return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (nb) cancelPendingCells(nb.cells);
    setNb(notebookId, (n) => ({
      kernelStatus: 'starting',
      outputs: {},
      running: new Set(),
      vars: [],
      // Reset loaded/loading packages to pending so the new kernel re-preloads them
      nugetPackages: n.nugetPackages.map((p) =>
        (p.status === 'loaded' || p.status === 'loading') ? { ...p, status: 'pending' } : p
      ),
      // Reset ready/connecting DBs to connecting so the new kernel re-attaches them
      attachedDbs: n.attachedDbs.map((d) =>
        d.status !== 'error' ? { ...d, status: 'connecting', schema: null } : d
      ),
    }));
    window.electronAPI.resetKernel(notebookId);
  }, [setNb]);

  // ── Save / Load ────────────────────────────────────────────────────────────

  const buildNotebookData = useCallback((notebookId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return null;
    return {
      version: '1.0',
      title: getNotebookDisplayName(nb.path, nb.title, 'notebook'),
      color: nb.color || null,
      packages: nb.nugetPackages.map(({ id, version }) => ({ id, version: version || null })),
      sources: nb.nugetSources,
      config: nb.config.filter((e) => e.key.trim()),
      attachedDbIds: nb.attachedDbs.filter((d) => d.status === 'ready').map((d) => d.connectionId),
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
    const savedDbIds = result.data.attachedDbIds || [];
    const nbWithData = {
      ...nb,
      path: result.filePath,
      color: result.data.color || null,
      cells: result.data.cells || [],
      nugetPackages: loadedPkgs,
      nugetSources: result.data.sources || [...DEFAULT_NUGET_SOURCES],
      config: result.data.config || [],
      attachedDbs: savedDbIds.map((id) => ({ connectionId: id, status: 'connecting', varName: '', schema: null, error: undefined })),
      isDirty: false,
    };

    setNotebooks((prev) => [...prev, nbWithData]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);
  }, []);

  // Open a recently used file in a new tab
  const handleOpenRecent = useCallback(async (filePath) => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openRecentFile(filePath);
    if (!result.success) {
      alert(`Could not open file:\n${result.error || 'File not found'}`);
      return;
    }
    const nb = createNotebook(false);
    const loadedPkgs = (result.data.packages || []).map((p) => ({ ...p, status: 'pending' }));
    const savedDbIds2 = result.data.attachedDbIds || [];
    setNotebooks((prev) => [...prev, {
      ...nb,
      path: result.filePath,
      color: result.data.color || null,
      cells: result.data.cells || [],
      nugetPackages: loadedPkgs,
      nugetSources: result.data.sources || [...DEFAULT_NUGET_SOURCES],
      config: result.data.config || [],
      attachedDbs: savedDbIds2.map((id) => ({ connectionId: id, status: 'connecting', varName: '', schema: null, error: undefined })),
      isDirty: false,
    }]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);
  }, []);

  // Insert a library snippet at the current scroll position of the active notebook
  const handleInsertLibraryFile = useCallback((content) => {
    const nbId = activeIdRef.current;
    if (!isNotebookId(nbId)) return;

    // Find the last cell whose top edge is within the visible viewport of the scroll container
    let insertAfterIndex = -1; // -1 = prepend before all cells (edge case: empty or scrolled to top)
    const notebook = document.querySelector(`.notebook-pane[data-nb="${nbId}"] .notebook`);
    if (notebook) {
      const wrappers = notebook.querySelectorAll('.cell-wrapper');
      const viewportBottom = notebook.getBoundingClientRect().bottom;
      for (let i = 0; i < wrappers.length; i++) {
        if (wrappers[i].getBoundingClientRect().top < viewportBottom) insertAfterIndex = i;
        else break;
      }
      // Default to end if all cells are visible or list is short
      if (insertAfterIndex < 0 && wrappers.length > 0) insertAfterIndex = wrappers.length - 1;
    }

    const targetIndex = insertAfterIndex + 1;
    setNbDirty(nbId, (n) => {
      const next = [...n.cells];
      next.splice(targetIndex, 0, makeCell('code', content));
      return { cells: next };
    });

    // After React re-renders, scroll to the new cell and flash it
    setTimeout(() => {
      const nb = document.querySelector(`.notebook-pane[data-nb="${nbId}"] .notebook`);
      if (!nb) return;
      const wrappers = nb.querySelectorAll('.cell-wrapper');
      const target = wrappers[targetIndex];
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      target.classList.add('cell-flash');
      target.addEventListener('animationend', () => target.classList.remove('cell-flash'), { once: true });
    }, 50);
  }, [setNbDirty]);

  // Open a library file in an editor tab
  const handleOpenLibraryFile = useCallback(async (file) => {
    if (!window.electronAPI) return;
    const id = makeLibEditorId(file.fullPath);
    const existing = libEditorsRef.current.find((e) => e.id === id);
    if (existing) { setActiveId(id); return; }
    const content = await window.electronAPI.readLibraryFile(file.fullPath);
    setLibEditors((prev) => [...prev, {
      id, fullPath: file.fullPath, filename: file.name, content, isDirty: false,
    }]);
    setActiveId(id);
  }, []);

  const handleCloseLibEditor = useCallback((id) => {
    const editor = libEditorsRef.current.find((e) => e.id === id);
    if (!editor) return;
    if (editor.isDirty && !window.confirm(`Close "${editor.filename}" without saving?`)) return;
    setLibEditors((prev) => prev.filter((e) => e.id !== id));
    if (activeIdRef.current === id) {
      const nbs = notebooksRef.current;
      setActiveId(nbs[nbs.length - 1]?.id ?? null);
    }
  }, []);

  const handleLibEditorChange = useCallback((id, newContent) => {
    setLibEditors((prev) => prev.map((e) => e.id === id ? { ...e, content: newContent, isDirty: true } : e));
  }, []);

  const handleSaveLibEditor = useCallback(async (id) => {
    const editor = libEditorsRef.current.find((e) => e.id === id);
    if (!editor || !window.electronAPI) return;
    await window.electronAPI.saveLibraryFile(editor.fullPath, editor.content);
    setLibEditors((prev) => prev.map((e) => e.id === id ? { ...e, isDirty: false } : e));
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

  const handleSetTabColor = useCallback((notebookId, color) => {
    setNb(notebookId, { color });
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (nb?.path) {
      const data = buildNotebookData(notebookId);
      window.electronAPI?.saveNotebookTo(nb.path, { ...data, color: color || null });
    }
  }, [setNb, buildNotebookData]);

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

  const handleTogglePin = useCallback((filePath) => {
    setPinnedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
      window.electronAPI?.saveAppSettings({ theme: themeRef.current, pinnedTabs: [...next], dockLayout: dockLayoutRef.current, savedLayouts: savedLayoutsRef.current });
      return next;
    });
  }, []);

  const handleCloseTab = useCallback((tabId) => {
    const currentNotebooks = notebooksRef.current;
    const nb = currentNotebooks.find((n) => n.id === tabId);
    if (!nb) return;

    if (nb.path && pinnedPathsRef.current.has(nb.path)) return; // pinned — not closeable

    if (nb.isDirty) {
      if (!window.confirm(`Close "${getNotebookDisplayName(nb.path, nb.title)}" without saving?`)) return;
    }

    // Stop kernel
    window.electronAPI?.stopKernel(tabId);

    // Resolve any pending cell executions with failure
    cancelPendingCells(nb.cells);

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

  // ── DB connection management ───────────────────────────────────────────────

  const handleAddDbConnection = useCallback((conn) => {
    setDbConnections((prev) => [...prev, conn]);
  }, []);

  const handleUpdateDbConnection = useCallback((id, updates) => {
    setDbConnections((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const handleRemoveDbConnection = useCallback((id) => {
    setDbConnections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleAttachDb = useCallback((notebookId, connectionId) => {
    const conn = dbConnections.find((c) => c.id === connectionId);
    if (!conn) return;
    const varName = conn.name
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
      .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
      .replace(/^[^a-zA-Z]/, 'db');
    setNb(notebookId, (n) => {
      if (n.attachedDbs.some((d) => d.connectionId === connectionId)) return {};
      return { attachedDbs: [...n.attachedDbs, { connectionId, status: 'connecting', varName, schema: null, error: undefined }] };
    });
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'db_connect',
      connectionId,
      name: conn.name,
      provider: conn.provider,
      connectionString: conn.connectionString,
      varName,
    });
  }, [setNb, dbConnections]);

  const handleDetachDb = useCallback((notebookId, connectionId) => {
    window.electronAPI?.sendToKernel(notebookId, { type: 'db_disconnect', connectionId });
    setNb(notebookId, (n) => ({
      attachedDbs: n.attachedDbs.filter((d) => d.connectionId !== connectionId),
    }));
  }, [setNb]);

  const handleRefreshDb = useCallback((notebookId, connectionId) => {
    setNb(notebookId, (n) => ({
      attachedDbs: n.attachedDbs.map((d) =>
        d.connectionId === connectionId ? { ...d, status: 'connecting' } : d
      ),
    }));
    window.electronAPI?.sendToKernel(notebookId, { type: 'db_refresh', connectionId });
  }, [setNb]);

  const handleRetryDb = useCallback((notebookId, connectionId) => {
    const conn = dbConnections.find((c) => c.id === connectionId);
    if (!conn) return;
    const varName = conn.name
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
      .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
      .replace(/^[^a-zA-Z]/, 'db');
    setNb(notebookId, (n) => ({
      attachedDbs: n.attachedDbs.map((d) =>
        d.connectionId === connectionId ? { ...d, status: 'connecting', error: undefined } : d
      ),
    }));
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'db_connect',
      connectionId,
      name: conn.name,
      provider: conn.provider,
      connectionString: conn.connectionString,
      varName,
    });
  }, [setNb, dbConnections]);

  // ── Dock layout handlers ───────────────────────────────────────────────────

  const handlePanelZoneChange = useCallback((panelId, newZone) => {
    setDockLayout((prev) => {
      const newAssignments = { ...prev.assignments, [panelId]: newZone };
      const newZoneTab = { ...prev.zoneTab, [newZone]: panelId };
      let newFloatPos = prev.floatPos;
      if (newZone === 'float' && !prev.floatPos[panelId]) {
        newFloatPos = { ...prev.floatPos, [panelId]: { x: 200, y: 100, w: DEFAULT_FLOAT_W, h: DEFAULT_FLOAT_H } };
      }
      const updated = { ...prev, assignments: newAssignments, zoneTab: newZoneTab, floatPos: newFloatPos };
      dockLayoutRef.current = updated;
      return updated;
    });
  }, []);

  const handleZoneTabChange = useCallback((zone, panelId) => {
    setDockLayout((prev) => {
      const updated = { ...prev, zoneTab: { ...prev.zoneTab, [zone]: panelId } };
      dockLayoutRef.current = updated;
      return updated;
    });
  }, []);

  const handlePanelClose = useCallback((panelId) => {
    if (panelId === 'library') {
      setLibraryPanelOpen(false);
    } else {
      const nbId = activeIdRef.current;
      if (isNotebookId(nbId)) {
        const flagMap = { log: 'logPanelOpen', nuget: 'nugetPanelOpen', config: 'configPanelOpen', db: 'dbPanelOpen', vars: 'varsPanelOpen', toc: 'tocPanelOpen' };
        const flag = flagMap[panelId];
        if (flag) setNb(nbId, { [flag]: false });
      }
    }
  }, [setNb]);

  const handleZoneResizeEnd = useCallback((zone, newSize) => {
    setDockLayout((prev) => {
      const updated = { ...prev, sizes: { ...prev.sizes, [zone]: newSize } };
      dockLayoutRef.current = updated;
      window.electronAPI?.saveAppSettings({
        theme: themeRef.current,
        pinnedTabs: [...pinnedPathsRef.current],
        dockLayout: updated,
        savedLayouts: savedLayoutsRef.current,
      });
      return updated;
    });
  }, []);

  const handleFloatMove = useCallback((panelId, newPos) => {
    setDockLayout((prev) => {
      const updated = { ...prev, floatPos: { ...prev.floatPos, [panelId]: newPos } };
      dockLayoutRef.current = updated;
      return updated;
    });
  }, []);

  // handleStartDrag: called from DockZone tab onMouseDown and FloatPanel grip onMouseDown.
  // Stores the pending drag start position; actual drag is activated after a 6px threshold.
  const handleStartDrag = useCallback((panelId, startX, startY) => {
    pendingDragRef.current = panelId ? { panelId, startX, startY } : null;
  }, []);

  // Document-level mousemove/mouseup replace HTML5 DnD.
  // Avoids the Electron/Chromium bug where dragend fires immediately after dragstart
  // for elements near the bottom edge of the window.
  useEffect(() => {
    const THRESHOLD = 6;

    function getDropZone(x, y) {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (x < 100) return 'left';
      if (x > vw - 100) return 'right';
      if (y > vh - 100) return 'bottom';
      if (Math.abs(x - vw / 2) < 52 && Math.abs(y - vh / 2) < 36) return 'float';
      return null;
    }

    const onMouseMove = (e) => {
      const pending = pendingDragRef.current;
      if (!pending) return;

      if (!draggingPanelRef.current) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
        dockLog('drag-start panel=' + pending.panelId);
        document.body.classList.add('dock-panel-dragging');
        setDraggingPanel(pending.panelId);
        draggingPanelRef.current = pending.panelId;
      }

      const zone = getDropZone(e.clientX, e.clientY);
      if (zone !== hoveredDropZoneRef.current) {
        hoveredDropZoneRef.current = zone;
        setHoveredDropZone(zone);
      }
    };

    const onMouseUp = () => {
      const panelId = draggingPanelRef.current;
      pendingDragRef.current = null;
      document.body.classList.remove('dock-panel-dragging');

      if (panelId !== null) {
        const zone = hoveredDropZoneRef.current;
        dockLog('drop panel=' + panelId + ' zone=' + (zone ?? 'none'));
        hoveredDropZoneRef.current = null;
        setHoveredDropZone(null);
        setDraggingPanel(null);
        draggingPanelRef.current = null;
        if (zone && zone !== dockLayoutRef.current.assignments[panelId]) {
          handlePanelZoneChange(panelId, zone);
          setTimeout(() => {
            window.electronAPI?.saveAppSettings({
              theme: themeRef.current,
              pinnedTabs: [...pinnedPathsRef.current],
              dockLayout: dockLayoutRef.current,
              savedLayouts: savedLayoutsRef.current,
            });
          }, 50);
        }
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
  }, [handlePanelZoneChange]);

  const handleSaveLayout = useCallback((name, layout) => {
    setSavedLayouts((prev) => {
      const exists = prev.findIndex((sl) => sl.name === name);
      const updated = exists >= 0
        ? prev.map((sl, i) => i === exists ? { name, layout } : sl)
        : [...prev, { name, layout }];
      savedLayoutsRef.current = updated;
      window.electronAPI?.saveAppSettings({
        theme: themeRef.current,
        pinnedTabs: [...pinnedPathsRef.current],
        dockLayout: dockLayoutRef.current,
        savedLayouts: updated,
      });
      return updated;
    });
  }, []);

  const handleLoadLayout = useCallback((savedLayout) => {
    const layout = {
      ...DEFAULT_DOCK_LAYOUT,
      ...savedLayout.layout,
      assignments: { ...DEFAULT_DOCK_LAYOUT.assignments, ...(savedLayout.layout.assignments || {}) },
      order:       { ...DEFAULT_DOCK_LAYOUT.order,       ...(savedLayout.layout.order       || {}) },
    };
    setDockLayout(layout);
    dockLayoutRef.current = layout;
    setLayoutKey((k) => k + 1);
    window.electronAPI?.saveAppSettings({
      theme: themeRef.current,
      pinnedTabs: [...pinnedPathsRef.current],
      dockLayout: layout,
      savedLayouts: savedLayoutsRef.current,
    });
  }, []);

  const handleDeleteLayout = useCallback((name) => {
    setSavedLayouts((prev) => {
      const updated = prev.filter((sl) => sl.name !== name);
      savedLayoutsRef.current = updated;
      window.electronAPI?.saveAppSettings({
        theme: themeRef.current,
        pinnedTabs: [...pinnedPathsRef.current],
        dockLayout: dockLayoutRef.current,
        savedLayouts: updated,
      });
      return updated;
    });
  }, []);

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
      }, COMPLETION_TIMEOUT);
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
      }, LINT_TIMEOUT);
    });
  }, []);

  // ── Menu action dispatch ───────────────────────────────────────────────────

  const menuHandlersRef = useRef({});
  const isNotebook = () => isNotebookId(activeIdRef.current);

  menuHandlersRef.current = {
    new: handleNew,
    open: handleLoad,
    save: () => {
      const id = activeIdRef.current;
      if (isLibEditorId(id)) handleSaveLibEditor(id);
      else handleSave(id);
    },
    'save-as': () => { if (isNotebook()) handleSaveAs(activeIdRef.current); },
    'run-all': () => { if (isNotebook()) runAll(activeIdRef.current); },
    reset: () => { if (isNotebook()) handleReset(activeIdRef.current); },
    'clear-output': () => { if (isNotebook()) setNb(activeIdRef.current, { outputs: {} }); },
    docs: handleOpenDocs,
    'toggle-packages': () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ nugetPanelOpen: !n.nugetPanelOpen })); },
    'toggle-config':   () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ configPanelOpen: !n.configPanelOpen })); },
    'toggle-logs':     () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ logPanelOpen: !n.logPanelOpen })); },
    'toggle-library':  () => setLibraryPanelOpen((v) => !v),
    'toggle-db':       () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ dbPanelOpen: !n.dbPanelOpen })); },
  };

  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return;
    window.electronAPI.onMenuAction((action) => {
      if (action && typeof action === 'object') {
        if (action.type === 'open-recent') handleOpenRecent(action.path);
        return;
      }
      menuHandlersRef.current[action]?.();
    });
  }, [handleOpenRecent]);

  // ── Panel props + open flags ───────────────────────────────────────────────

  const activeNb = notebooks.find((n) => n.id === activeId) ?? null;

  const openFlags = useMemo(() => ({
    log:     isNotebookId(activeId) ? (activeNb?.logPanelOpen ?? false) : false,
    nuget:   isNotebookId(activeId) ? (activeNb?.nugetPanelOpen ?? false) : false,
    config:  isNotebookId(activeId) ? (activeNb?.configPanelOpen ?? false) : false,
    db:      isNotebookId(activeId) ? (activeNb?.dbPanelOpen ?? false) : false,
    library: libraryPanelOpen,
    vars:    isNotebookId(activeId) ? (activeNb?.varsPanelOpen ?? false) : false,
    toc:     isNotebookId(activeId) ? (activeNb?.tocPanelOpen ?? false) : false,
  }), [activeId, activeNb, libraryPanelOpen]);

  const panelPropsMap = useMemo(() => {
    const nbId = activeNb?.id ?? null;
    return {
      log: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ logPanelOpen: !n.logPanelOpen })) : () => {},
        currentMemoryMb: activeNb?.memoryHistory?.length
          ? activeNb.memoryHistory[activeNb.memoryHistory.length - 1] : null,
      },
      nuget: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ nugetPanelOpen: !n.nugetPanelOpen })) : () => {},
        packages: activeNb?.nugetPackages ?? [],
        kernelStatus: activeNb?.kernelStatus ?? 'starting',
        sources: activeNb?.nugetSources ?? [],
        onAdd: nbId ? (id, ver) => addNugetPackage(nbId, id, ver) : () => {},
        onRemove: nbId ? (id) => removeNugetPackage(nbId, id) : () => {},
        onRetry: nbId ? (id, ver) => retryNugetPackage(nbId, id, ver) : () => {},
        onAddSource: nbId ? (name, url) => setNbDirty(nbId, (n) => ({
          nugetSources: n.nugetSources.some((s) => s.url === url)
            ? n.nugetSources : [...n.nugetSources, { name, url, enabled: true }],
        })) : () => {},
        onRemoveSource: nbId ? (url) => setNbDirty(nbId, (n) => ({
          nugetSources: n.nugetSources.filter((s) => s.url !== url),
        })) : () => {},
        onToggleSource: nbId ? (url) => setNbDirty(nbId, (n) => ({
          nugetSources: n.nugetSources.map((s) => s.url === url ? { ...s, enabled: !s.enabled } : s),
        })) : () => {},
      },
      config: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ configPanelOpen: !n.configPanelOpen })) : () => {},
        config: activeNb?.config ?? [],
        onAdd: nbId ? (k, v) => setNbDirty(nbId, (n) => ({ config: [...n.config, { key: k, value: v }] })) : () => {},
        onRemove: nbId ? (i) => setNbDirty(nbId, (n) => ({ config: n.config.filter((_, idx) => idx !== i) })) : () => {},
        onUpdate: nbId ? (i, val) => setNbDirty(nbId, (n) => ({
          config: n.config.map((e, idx) => idx === i ? { ...e, value: val } : e),
        })) : () => {},
      },
      db: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ dbPanelOpen: !n.dbPanelOpen })) : () => {},
        connections: dbConnections,
        attachedDbs: activeNb?.attachedDbs ?? [],
        notebookId: nbId,
        onAttach: nbId ? (connId) => handleAttachDb(nbId, connId) : () => {},
        onDetach: nbId ? (connId) => handleDetachDb(nbId, connId) : () => {},
        onRefresh: nbId ? (connId) => handleRefreshDb(nbId, connId) : () => {},
        onRetry: nbId ? (connId) => handleRetryDb(nbId, connId) : () => {},
        onAdd: handleAddDbConnection,
        onUpdate: handleUpdateDbConnection,
        onRemove: handleRemoveDbConnection,
      },
      library: {
        onInsert: handleInsertLibraryFile,
        onClose: () => setLibraryPanelOpen(false),
        onOpenFile: handleOpenLibraryFile,
      },
      vars: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ varsPanelOpen: !n.varsPanelOpen })) : () => {},
        vars: activeNb?.vars ?? [],
      },
      toc: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ tocPanelOpen: !n.tocPanelOpen })) : () => {},
        cells: activeNb?.cells ?? [],
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNb, dbConnections]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const dockZoneProps = {
    dockLayout,
    openFlags,
    panelProps: panelPropsMap,
    onTabChange: handleZoneTabChange,
    onPanelClose: handlePanelClose,
    onStartDrag: handleStartDrag,
    onResizeEnd: handleZoneResizeEnd,
  };

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
        onSetColor={handleSetTabColor}
        activeTabColor={notebooks.find((n) => n.id === activeId)?.color ?? null}
        docsOpen={docsOpen}
        onActivateDocs={handleOpenDocs}
        onCloseDocs={handleCloseDocs}
        libEditors={libEditors}
        onCloseLibEditor={handleCloseLibEditor}
        pinnedPaths={pinnedPaths}
        onTogglePin={handleTogglePin}
      />
      <div className="dock-workspace" key={layoutKey}>
        <DockZone zone="left" {...dockZoneProps} />
        <div className="dock-center-col">
          <div className="dock-content-row">
            <div id="notebooks-container">
              {notebooks.map((notebook) => (
                <div
                  key={notebook.id}
                  className="notebook-pane"
                  data-nb={notebook.id}
                  style={notebook.id === activeId ? undefined : { display: 'none' }}
                >
                  <NotebookView
                    nb={notebook}
                    onSetNb={(updater) => setNb(notebook.id, updater)}
                    onSetNbDirty={(updater) => setNbDirty(notebook.id, updater)}
                    onRunCell={runCell}
                    onRunAll={runAll}
                    onInterrupt={handleInterrupt}
                    onRunFrom={runFrom}
                    onRunTo={runTo}
                    onSave={handleSave}
                    onLoad={handleLoad}
                    onReset={handleReset}
                    onRename={(newName) => handleRenameTab(notebook.id, newName)}
                    requestCompletions={requestCompletions}
                    requestLint={requestLint}
                    libraryPanelOpen={libraryPanelOpen}
                    onToggleLibrary={() => setLibraryPanelOpen((v) => !v)}
                    theme={theme}
                    onThemeChange={setTheme}
                    dockLayout={dockLayout}
                    savedLayouts={savedLayouts}
                    onSaveLayout={handleSaveLayout}
                    onLoadLayout={handleLoadLayout}
                    onDeleteLayout={handleDeleteLayout}
                  />
                </div>
              ))}
              {libEditors.map((editor) => (
                <div
                  key={editor.id}
                  className="notebook-pane"
                  style={editor.id === activeId ? undefined : { display: 'none' }}
                >
                  <LibraryEditorPane
                    editor={editor}
                    onContentChange={handleLibEditorChange}
                    onSave={handleSaveLibEditor}
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
            <DockZone zone="right" {...dockZoneProps} />
          </div>
          <DockZone zone="bottom" {...dockZoneProps} />
        </div>
      </div>
      <StatusBar notebooks={notebooks} activeId={activeId} />
      {Object.entries(dockLayout.assignments)
        .filter(([panelId, z]) => z === 'float' && !!openFlags[panelId])
        .map(([panelId]) => {
          const p = panelPropsMap[panelId];
          if (!p) return null;
          const pos = dockLayout.floatPos[panelId] ?? { x: 200, y: 100, w: DEFAULT_FLOAT_W, h: DEFAULT_FLOAT_H };
          return (
            <FloatPanel key={panelId} panelId={panelId} pos={pos} onMove={handleFloatMove} onClose={handlePanelClose} onStartDrag={handleStartDrag}>
              {renderPanelContent(panelId, { ...p, isOpen: true })}
            </FloatPanel>
          );
        })}
      <DockDropOverlay
        active={!!draggingPanel}
        sourceZone={draggingPanel ? dockLayout.assignments[draggingPanel] : null}
        hovered={hoveredDropZone}
      />
    </div>
  );
}

// ── Status Bar ────────────────────────────────────────────────────────────────

function MemorySparkline({ history }) {
  const W = 80, H = 22, PAD = 2;
  const BAR_W = 2, GAP = 1;
  const n = Math.min(history.length, Math.floor((W - PAD * 2) / (BAR_W + GAP)));
  const slice = history.slice(-n);

  if (slice.length === 0) {
    return <svg width={W} height={H} style={{ display: 'block', opacity: 0.2 }}><rect x={0} y={H/2} width={W} height={1} fill="currentColor"/></svg>;
  }

  const max = Math.max(...slice);
  const min = Math.min(...slice);
  const range = max - min || 1;
  const isLatest = (i) => i === slice.length - 1;

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {slice.map((v, i) => {
        const barH = Math.max(2, ((v - min) / range) * (H - PAD * 2));
        const x = PAD + i * (BAR_W + GAP);
        const y = H - PAD - barH;
        return (
          <rect
            key={i}
            x={x} y={y} width={BAR_W} height={barH}
            fill="var(--accent-primary)"
            opacity={isLatest(i) ? 1 : 0.45}
            rx="0.5"
          />
        );
      })}
    </svg>
  );
}

function StatusBar({ notebooks, activeId }) {
  const nb = isNotebookId(activeId) ? notebooks.find((n) => n.id === activeId) : null;
  const history = nb?.memoryHistory ?? [];
  const current = history.length > 0 ? history[history.length - 1] : null;
  const peak    = history.length > 0 ? Math.max(...history) : null;

  const [cursorPos, setCursorPos] = useState(null);
  useEffect(() => {
    _setCursorPos = setCursorPos;
    return () => { _setCursorPos = null; };
  }, []);

  return (
    <div className="status-bar">
      <span className="status-label">MEM</span>
      <MemorySparkline history={history} />
      <span className="status-mem-value">
        {current != null ? `${current.toFixed(1)} MB` : '— MB'}
      </span>
      {peak != null && (
        <span className="status-mem-peak">peak {peak.toFixed(1)}</span>
      )}
      {cursorPos && (
        <span className="status-cursor-pos">
          {cursorPos.cellIndex != null ? `Cell ${cursorPos.cellIndex + 1}  ` : ''}Ln {cursorPos.line}  Col {cursorPos.col}
        </span>
      )}
    </div>
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root'));
root.render(<App />);
