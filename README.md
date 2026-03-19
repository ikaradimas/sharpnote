# Polyglot Notebook

> Interactive C# notebook application — multi-tab MDI, NuGet package management, database integration, Chart.js visualisations, and a full dock layout system.

![Electron](https://img.shields.io/badge/Electron-34-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![.NET](https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet&logoColor=white)
![C%23](https://img.shields.io/badge/C%23-Roslyn_Scripting-239120?logo=csharp&logoColor=white)
![CodeMirror](https://img.shields.io/badge/CodeMirror-6-D30707?logo=codemirror&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-4-FF6384?logo=chartdotjs&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-2-6E9F18?logo=vitest&logoColor=white)
![xUnit](https://img.shields.io/badge/xUnit-2.9-512BD4?logo=dotnet&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-EFCore_8-003B57?logo=sqlite&logoColor=white)
![esbuild](https://img.shields.io/badge/esbuild-0.25-FFCF00?logo=esbuild&logoColor=black)

---

## Table of Contents

- [Polyglot Notebook](#polyglot-notebook)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Architecture](#architecture)
    - [Electron Main Process (`main.js`)](#electron-main-process-mainjs)
    - [React Renderer (`src/renderer.jsx`)](#react-renderer-srcrendererjsx)
    - [C# Kernel (`kernel/`)](#c-kernel-kernel)
    - [IPC Protocol](#ipc-protocol)
    - [Multi-Kernel Architecture](#multi-kernel-architecture)
    - [Database Integration](#database-integration)
    - [Dock Layout System](#dock-layout-system)
  - [Project Structure](#project-structure)
  - [Prerequisites](#prerequisites)
  - [Getting Started](#getting-started)
  - [Building for Distribution](#building-for-distribution)
  - [Testing](#testing)
    - [JavaScript — Vitest](#javascript--vitest)
    - [C# — xUnit](#c--xunit)
  - [Notebook File Format](#notebook-file-format)

---

## Features

- **Multi-tab MDI** — open multiple notebooks simultaneously in a tabbed interface with per-tab colour coding, pin-to-keep, and rename-on-double-click
- **C# REPL** — each cell is evaluated using Roslyn scripting; state is shared across cells within a notebook, with `using`/`#r` directives supported
- **Per-notebook kernel** — every open notebook gets its own isolated .NET process; kernels start on demand and can be reset independently
- **NuGet integration** — add packages via `#r "nuget: PackageName, Version"` directives or through the Packages panel; multiple package sources supported
- **Rich output** — `Display.Html()`, `Display.Table()`, `Display.Graph()` (Chart.js), `Display.Csv()`, and `Console.Write` captured as `stdout`
- **Database integration** — connect to SQLite, SQLite (In-Memory), SQL Server, PostgreSQL, or Redis; for relational providers the schema is introspected and a typed `DbContext` + POCO classes are code-generated and injected; Redis injects a `StackExchange.Redis.IDatabase` variable
- **Code Library** — file-based snippet library stored in `~/Documents/Polyglot Notebooks/Library/`; subfolder navigation, syntax-highlighted preview, insert-as-cell with animation
- **Dock layout** — panels can be docked to left / right / bottom zones, floated freely, or dragged between zones; opening a panel via the toolbar auto-switches to its tab and briefly highlights it; tab bars show scroll-shadow indicators when tabs overflow; layouts can be saved and restored by name
- **Autocomplete** — Roslyn `ResolveCompletion` backed; falls back to a C# keyword list while the kernel is starting
- **Lint** — real-time Roslyn diagnostics; squiggles rendered via the CodeMirror lint extension
- **Cell execution control** — Run, Stop (interrupt via cancellation token injection), Run From Here, Run To Here
- **Memory sparkline** — kernel reports heap usage every 3 s; rendered as an SVG bar chart in the status bar
- **Recent files** — last 12 opened notebooks persisted to `userData/recent-files.json`; exposed in the File menu
- **Variables panel** — live snapshot of the kernel's global state after each execution
- **Config panel** — per-notebook key/value store passed into the kernel as a `Config["key"]` helper
- **Log panel** — structured, time-stamped kernel log stream with `NOTEBOOK` lifecycle entries and `USER` entries written by `.Log()` calls in scripts
- **Table of Contents** — live heading outline from markdown cells; click any entry to scroll to it
- **Dark theme** — purpose-built urban dark CSS (~2 650 lines); no UI framework dependency

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                  │
│  main.js — BrowserWindow, IPC handlers, kernel manager   │
└────────────────────┬────────────────────────────────────┘
                     │  contextBridge (preload.js)
                     │  window.electronAPI.*
┌────────────────────▼────────────────────────────────────┐
│               React Renderer  (src/renderer.jsx)          │
│  ~3 400 lines · CodeMirror 6 editors · Chart.js output   │
└────────────────────┬────────────────────────────────────┘
                     │  JSON lines over child_process stdin/stdout
          ┌──────────▼──────────┐   ┌─────────────────────┐
          │  kernel (notebook A) │   │  kernel (notebook B) │
          │  .NET 8 / Roslyn     │   │  .NET 8 / Roslyn     │
          └─────────────────────┘   └─────────────────────┘
```

### Electron Main Process (`main.js`)

The main process is a single Node.js/CJS file responsible for:

| Concern | Detail |
|---|---|
| Window management | Single `BrowserWindow`; `mainWindow.webContents` sends events to the renderer |
| Multi-kernel map | `kernels: Map<notebookId, { process, ready, pending[] }>` — each notebook gets its own kernel subprocess |
| IPC handlers | ~40 `ipcMain.handle` / `ipcMain.on` registrations covering file ops, kernel lifecycle, DB connections, library, config, and more |
| File operations | `fs-readdir`, `fs-rename`, `fs-delete` (via `shell.trashItem`), `fs-mkdir`, `fs-get-home` |
| Recent files | Persisted to `<userData>/recent-files.json`; max 12 entries, duplicates moved to front |
| Library | `resolveLibraryPath()` — path-traversal-safe resolver rooted at `~/Documents/Polyglot Notebooks/Library/` |
| DB connections | `<userData>/db-connections.json` — global list of named connection strings |
| Menus | Native macOS / Windows menu built with `Menu.buildFromTemplate`; Tools sub-menu exposes keyboard shortcuts for all panels |
| Logging | Dev mode: `logs/` next to `main.js`; packaged: `<userData>/logs/` |

### React Renderer (`src/renderer.jsx`)

All UI is a single ~3 400-line React file bundled by esbuild. Key components:

| Component | Responsibility |
|---|---|
| `App` | Root state owner — notebooks array, dock layout, DB connections, saved layouts, drag state |
| `NotebookView` | Toolbar + scrollable cells list for one notebook |
| `CodeCell` | CodeMirror 6 editor + run/stop/chevron controls; lint integration |
| `OutputBlock` | Renders every kernel output type: stdout, error, html, markdown, table (DataTable), csv, graph (Chart.js), image, interrupted |
| `TabBar` / `Tab` | Multi-notebook tabs; color picker rendered via `createPortal` to avoid z-index clipping |
| `FilesPanel` | File explorer with breadcrumb navigation, inline rename, drag-free delete |
| `LibraryPanel` | Code snippet library with subfolder nav and CodeMirror preview |
| `NugetPanel` | Package list + add form + custom source management |
| `ConfigPanel` | Key/value editor for per-notebook config passed to the kernel |
| `VarsPanel` | Live variable snapshot from the kernel (name, type, value) |
| `TocPanel` | Table of Contents — heading outline extracted from markdown cells |
| `DbPanel` | Connection form, schema tree, attach/detach DB |
| `DockZone` | Resizable panel zone (left / right / bottom / float) |
| `FloatPanel` | Free-floating draggable/resizable panel window |
| `LayoutManager` | Named layout save/restore popup |
| `StatusBar` | Cursor position + memory sparkline (`MemorySparkline`) |
| `QuitDialog` | Multi-notebook dirty-file confirmation on window close |

**State model per notebook:**
```js
{
  id, title, path, isDirty, color,
  cells, outputs,
  running: Set<cellId>,
  kernelStatus,           // 'starting' | 'ready' | 'error' | 'stopped'
  nugetPackages,          // [{ id, version, status }]
  nugetSources,           // [{ name, url, enabled }]
  config,                 // [{ key, value }]
  logPanelOpen, nugetPanelOpen, configPanelOpen, dbPanelOpen, varsPanelOpen, tocPanelOpen,
  attachedDbs,            // [{ connectionId, status, varName, schema, error }]
  memoryHistory,          // last 60 memory_mb readings
}
```

### C# Kernel (`kernel/`)

The kernel is a self-contained .NET 8 console application that communicates with the main process via **JSON lines over stdin/stdout**.

| File | Responsibility |
|---|---|
| `Program.cs` | Protocol loop, Roslyn script execution, autocomplete, lint, NuGet directive parsing, cancellation token injection, variable snapshot, display system |
| `DbProvider.cs` | `IDbProvider` interface + SQLite / SQL Server / PostgreSQL implementations; schema introspection via `IntrospectAsync` |
| `DbCodeGen.cs` | POCO class + `DbContext` code generation from a `DbSchema`; Roslyn in-memory compilation and injection |

**Exposed scripting APIs:**

```csharp
Display.Html("<b>bold</b>");
Display.Table(myList);
Display.Csv("a,b\n1,2");
Display.Graph(new { type = "bar", data = ... });

"starting pipeline".Log();    // extension method; appears in Log panel, returns value
value.Log("label");           // optional label shown alongside the value
Config["key"]                 // per-notebook key/value store
```

**Cancellation:** `while`, `for`, `foreach`, and `do-while` loops are automatically rewritten by a Roslyn `CSharpSyntaxRewriter` to call `token.ThrowIfCancellationRequested()` at each iteration. This enables the Stop button to interrupt long-running cells without killing the kernel.

### IPC Protocol

Messages are newline-delimited JSON objects. The renderer sends to the kernel; the kernel sends back.

**Renderer → Kernel:**

| `type` | Payload |
|---|---|
| `execute` | `{ id, code }` |
| `interrupt` | `{}` |
| `reset` | `{}` |
| `lint` | `{ requestId, code }` |
| `autocomplete` | `{ requestId, code, position }` |
| `db_connect` | `{ connectionId, provider, connectionString }` |
| `db_disconnect` | `{ connectionId }` |
| `exit` | `{}` |

**Kernel → Renderer:**

| `type` | Payload |
|---|---|
| `ready` | — |
| `stdout` | `{ id, content }` |
| `display` | `{ id, format, content, title? }` |
| `error` | `{ id, message, stackTrace }` |
| `complete` | `{ id, success, cancelled }` |
| `lint_result` | `{ diagnostics[] }` |
| `autocomplete_result` | `{ items[] }` |
| `vars_update` | `{ vars[] }` |
| `db_schema` | `{ connectionId, schema }` |
| `db_ready` | `{ connectionId, varName }` |
| `db_error` | `{ connectionId, message }` |
| `db_disconnected` | `{ connectionId }` |
| `nuget_preload_complete` | — |
| `memory_mb` | `{ mb }` |
| `log` | `{ tag, message, timestamp }` |
| `reset_complete` | — |

### Multi-Kernel Architecture

Each notebook has its own entry in `kernels: Map<notebookId, KernelEntry>`:

```
KernelEntry = {
  process: ChildProcess,   // spawned dotnet kernel process
  ready: boolean,          // true once 'ready' message received
  pending: Message[],      // queued messages waiting for ready
}
```

- Messages sent before `ready` are buffered in `pending[]` and flushed immediately on `ready`.
- `start-kernel` IPC handler: spawns the process, wires up readline on stdout, handles kernel messages and fan-outs to all open windows.
- `stop-kernel`: sends `{ type: 'exit' }` to the kernel; process is killed after a short grace period.
- `kernel-reset`: kills current process, clears pending queue, spawns fresh.
- `kernel-interrupt`: writes `{ type: 'interrupt' }` to stdin.

### Database Integration

The flow from connection to code-generation:

```
1. User adds a connection (name, provider, connection string) → saved to db-connections.json
2. User attaches a connection to a notebook → IPC db_connect → kernel
3. Kernel calls IDbProvider.IntrospectAsync() → DbSchema (tables, columns, types, PKs)
4. DbCodeGen.GenerateSource() → C# source with POCOs + DbContext + OnConfiguring()
5. Kernel compiles the generated source in-memory (Roslyn) and injects the context
6. Kernel emits db_schema (schema tree for UI) then db_ready
7. User accesses the typed DbContext as a named variable (e.g. `northwind.Orders.ToList()`)
```

Supported providers:

| Provider | Key | Connection string |
|---|---|---|
| SQLite | `sqlite` | `Data Source=/path/to/db.sqlite` |
| SQLite (In-Memory) | `sqlite_memory` | shared-cache name, or blank to auto-generate |
| SQL Server | `sqlserver` | `Server=...;Database=...;` |
| PostgreSQL | `postgresql` | `Host=...;Database=...;` |
| Redis | `redis` | `localhost:6379` or `host:port,password=secret` |

### Dock Layout System

Panels (Library, Log, NuGet, Config, DB) can be placed in four zones:

| Zone | Direction | Default contents |
|---|---|---|
| `left` | Vertical | Library |
| `right` | Vertical | Log |
| `bottom` | Horizontal | NuGet, Config, DB |
| `float` | Free | — |

Layout state is stored as `dockLayout = { assignments, order, sizes, floatPos, zoneTab }` and persisted as part of `saveAppSettings`. Users can save named layouts via the Layout Manager (toolbar icon) and switch between them; loading a layout increments `layoutKey` which forces a full DockZone remount to reset sizes.

When a panel is opened via the toolbar (or a keyboard shortcut), the dock zone automatically switches to show that panel's tab and briefly highlights the panel with an accent outline. Zone tab bars display scroll-shadow indicators on overflowing edges; the active tab scrolls into view automatically.

---

## Project Structure

```
polyglot-clone/
├── main.js               # Electron main process
├── preload.js            # contextBridge: exposes window.electronAPI to renderer
├── index.html            # App shell (loads dist/renderer.js)
├── package.json
├── vitest.config.js      # JS test configuration
│
├── src/
│   ├── renderer.jsx      # All React UI (~3 400 lines)
│   └── styles.css        # Urban dark theme (~2 650 lines)
│
├── kernel/
│   ├── kernel.csproj     # .NET 8 project
│   ├── Program.cs        # Protocol loop, Roslyn execution, display system
│   ├── DbProvider.cs     # IDbProvider + SQLite/SQL Server/PostgreSQL
│   ├── DbCodeGen.cs      # Schema → C# POCO + DbContext codegen
│   └── AssemblyInfo.cs   # InternalsVisibleTo kernel.Tests
│
├── kernel/kernel.Tests/
│   ├── kernel.Tests.csproj
│   ├── DbCodeGenTests.cs
│   ├── DbProviderTests.cs
│   ├── CancellationInjectorTests.cs
│   ├── NugetDirectiveTests.cs
│   ├── LintTests.cs
│   └── KernelProtocolTests.cs  # subprocess integration tests
│
├── tests/
│   ├── setup.js                # electronAPI stubs, CodeMirror/Chart.js mocks
│   ├── renderer/               # React component + utility tests (happy-dom)
│   │   ├── utils.test.js
│   │   ├── OutputBlock.test.jsx
│   │   ├── CodeCell.test.jsx
│   │   ├── TabBar.test.jsx
│   │   ├── QuitDialog.test.jsx
│   │   ├── FilesPanel.test.jsx
│   │   ├── DataTable.test.jsx
│   │   ├── VarsPanel.test.jsx
│   │   ├── NugetPanel.test.jsx
│   │   └── ConfigPanel.test.jsx
│   └── main/                   # Main process tests (Node environment)
│       ├── resolveLibraryPath.test.js
│       ├── recentFiles.test.js
│       ├── fileOps.test.js
│       └── kernelLifecycle.test.js
│
├── __mocks__/
│   └── electron.js             # CJS electron mock (used by main.js when VITEST=1)
│
├── assets/
│   ├── icon.icns               # macOS app icon
│   └── icon.png                # Windows/Linux app icon
│
├── scripts/
│   └── patch-electron-icon.js  # postinstall: patches Electron dev icon
│
└── dist/                       # esbuild output (gitignored)
    └── renderer.js
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 18 | Electron host + build tooling |
| npm | ≥ 9 | Package management |
| .NET SDK | 8.0 | Kernel build + test |
| Electron | 34 (installed via npm) | Desktop shell |

---

## Getting Started

**1. Clone and install dependencies**

```bash
git clone <repo-url>
cd polyglot-clone
npm install
```

**2. Run in development mode**

```bash
npm start
```

This bundles the renderer with esbuild, then launches Electron. The kernel subprocess is started automatically when the first notebook is opened.

---

## Building for Distribution

Bundle the renderer and compile a self-contained kernel binary, then package with electron-builder.

**macOS (Universal — x64 + arm64):**
```bash
npm run dist:mac
```

**Windows (x64):**
```bash
npm run dist:win
```

**Both platforms:**
```bash
npm run dist:all
```

Output is written to `/tmp/polyglot-build/` (configured via `build.directories.output` in `package.json`).

**Kernel only** (without packaging):
```bash
npm run build:kernel:mac   # osx-x64 + osx-arm64
npm run build:kernel:win   # win-x64
```

Self-contained binaries are placed under `kernel/bin/<rid>/`.

---

## Testing

### JavaScript — Vitest

```bash
npm test                 # run all tests once
npm run test:watch       # watch mode
npm run test:coverage    # with V8 coverage report
```

**142 tests across 14 files:**

| Suite | Environment | Count |
|---|---|---|
| `tests/renderer/utils.test.js` | happy-dom | 36 |
| `tests/renderer/OutputBlock.test.jsx` | happy-dom | 15 |
| `tests/renderer/CodeCell.test.jsx` | happy-dom | 12 |
| `tests/renderer/TabBar.test.jsx` | happy-dom | 7 |
| `tests/renderer/QuitDialog.test.jsx` | happy-dom | 8 |
| `tests/renderer/FilesPanel.test.jsx` | happy-dom | 7 |
| `tests/renderer/DataTable.test.jsx` | happy-dom | 9 |
| `tests/renderer/VarsPanel.test.jsx` | happy-dom | 7 |
| `tests/renderer/NugetPanel.test.jsx` | happy-dom | 8 |
| `tests/renderer/ConfigPanel.test.jsx` | happy-dom | 9 |
| `tests/main/resolveLibraryPath.test.js` | node | 6 |
| `tests/main/recentFiles.test.js` | node | 5 |
| `tests/main/fileOps.test.js` | node | 8 |
| `tests/main/kernelLifecycle.test.js` | node | 5 |

**Notable test infrastructure decisions:**

- Vitest is pinned to **v2.1.9** — v3/v4 are missing the `rolldown` native binary for `darwin-arm64`.
- `vi.mock('electron', factory)` does not intercept CJS `require('electron')` from within a dynamically-imported CJS module. `main.js` therefore uses `require(process.env.VITEST ? './__mocks__/electron.js' : 'electron')` directly.
- The same limitation applies to `vi.mock('fs')`. `fileOps.test.js` avoids it by using a real temporary directory.
- Renderer tests use **happy-dom** instead of jsdom (jsdom v29 has ESM-compatibility issues with `html-encoding-sniffer`).

### C# — xUnit

```bash
npm run test:kernel
# or directly:
dotnet test kernel/kernel.Tests/kernel.Tests.csproj --logger console
```

**46 tests:**

| Test class | What it covers |
|---|---|
| `DbCodeGenTests` | `SanitizeVarName`, `SanitizeTypeName`, `GenerateSource` (POCO + DbContext output) |
| `DbProviderTests` | Real SQLite temp DB — `IntrospectAsync`, column type mapping, PK detection |
| `CancellationInjectorTests` | Roslyn rewriter injects `ThrowIfCancellationRequested` into `while`/`for`/`foreach`/`do-while` |
| `NugetDirectiveTests` | `ParseNugetDirectives` — versioned, unversioned, line preservation, case insensitivity |
| `LintTests` | `GetLintDiagnostics` — zero errors on valid code, ≥1 on syntax errors, offset validation |
| `KernelProtocolTests` | **Subprocess integration** — spawns the real kernel via `dotnet run`, exercises the full JSON-line protocol: execute, display, shared state, invalid code, reset, lint, autocomplete, vars_update |

---

## Notebook File Format

Notebooks are saved as `.cnb` files — plain JSON:

```jsonc
{
  "version": "1.0",
  "title": "My Notebook",
  "color": "#4a90d9",          // optional tab color (null if unset)
  "cells": [
    {
      "id": "uuid-v4",
      "type": "code",           // "code" | "markdown"
      "content": "var x = 42;\nConsole.WriteLine(x);",
      "outputMode": "auto",     // "auto" | "text" | "html" | "table" | "graph"
      "locked": false
    }
  ],
  "packages": [
    { "id": "Newtonsoft.Json", "version": "13.0.3" }
  ],
  "sources": [
    { "name": "nuget.org", "url": "https://api.nuget.org/v3/index.json", "enabled": true }
  ],
  "config": [
    { "key": "ConnectionString", "value": "Data Source=mydb.sqlite" }
  ],
  "attachedDbIds": ["conn-uuid-1"]   // global connection IDs to re-attach on open
}
```
