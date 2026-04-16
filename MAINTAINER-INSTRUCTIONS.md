# Maintainer Instructions

Architecture guide for developers working on SharpNote.

## Architecture Overview

Three process layers communicate via JSON messages:

```
┌──────────────────────────────────────────────────────────┐
│  React Renderer (src/)                                   │
│  App.jsx → hooks → components → config                   │
│  State: notebooks, settings, panels, dock layout         │
└──────────┬──────────────────────────────────┬────────────┘
           │ IPC (preload.js, 215 lines)      │
           │ 54 exposed methods               │
┌──────────▼──────────────────────────────────▼────────────┐
│  Electron Main Process (main.js + src/main/)             │
│  447 lines entry + 18 modules                            │
│  kernel-manager, settings, file-ops, mock-server, etc.   │
└──────────┬───────────────────────────────────────────────┘
           │ stdin/stdout JSON lines
┌──────────▼───────────────────────────────────────────────┐
│  C# Kernel (kernel/)                                     │
│  Roslyn CSharpScript engine + 15 message handlers        │
│  Display, Docker, Mock, Db, NuGet, LSP, Debug            │
└──────────────────────────────────────────────────────────┘
```

## File Structure

### Renderer (`src/`)

| Path | Purpose | Key files |
|------|---------|-----------|
| `src/app/` | Root component, status bar | App.jsx (1432 lines — global state hub), StatusBar.jsx |
| `src/components/editor/` | Cell types | CodeCell, MarkdownCell, SqlCell, HttpCell, ShellCell, DockerCell, CheckCell, DecisionCell, CodeEditor, AddBar, CellControls, CellNameColor |
| `src/components/output/` | Output rendering | OutputBlock, DataTable, FormOutput, MarkdownOutput, GraphOutput |
| `src/components/panels/` | Side panels | DocsPanel, ChangelogPanel, DbPanel, GitPanel, ApiPanel, ApiEditorPanel, KafkaPanel, VarsPanel, etc. |
| `src/components/dock/` | Dock/float layout | DockZone, FloatPanel, LayoutManager, renderPanelContent |
| `src/components/dialogs/` | Modals | SettingsDialog, CommandPalette, DbConnectionDialog, NewNotebookDialog, QuitDialog |
| `src/components/toolbar/` | Tab bar, toolbar | TabBar, Toolbar, ThemePicker, ToolsMenu |
| `src/hooks/` | Custom hooks (10 files) | useKernelManager (824 lines), useNotebookManager (652), useDockLayout, useCellDependencies, useCellScheduler, useCellOrchestrator |
| `src/config/` | Static data | docs-sections.js (1293 lines), changelog.js, themes.js, db-providers.js, dock-layout.jsx |
| `src/main/` | Main process modules (18 files) | kernel-manager.js (371), mock-server.js (240), settings.js, menu.js, notebook-io.js, git-ops.js |

### Kernel (`kernel/`)

| Path | Purpose |
|------|---------|
| `Program.cs` | Entry point + stdin message dispatch loop |
| `Globals.cs` | ScriptGlobals class — all properties available to user code |
| `Display.cs` | DisplayHelper + CanvasHandle + DisplayHandle (781 lines) |
| `DockerHelper.cs` | Docker CLI wrapper |
| `MockHelper.cs` | Mock server control via request-response protocol |
| `Handlers/` | 15 partial-class handlers for each message type |
| `Db/` | Database providers, code generation, schema introspection |
| `WorkspaceManager.cs` | Roslyn AdhocWorkspace for LSP completions/diagnostics |

### Key standalone files

| File | Lines | Purpose |
|------|-------|---------|
| `main.js` | 447 | Electron entry — window, IPC registration, lifecycle |
| `preload.js` | 215 | Context bridge — 54 IPC methods exposed to renderer |
| `src/notebook-factory.js` | 2520 | `makeCell()`, 11 templates, `createNotebook()` |
| `src/styles.css` | 8196 | All styles — uses `--base-font-size` CSS variable for scaling |
| `src/utils.js` | 270 | Pure helpers (ID helpers, formatters, Docker Compose generator) |
| `src/constants.js` | 12 | Tab IDs, timeout constants |

## How Data Flows

### Cell execution (Code cell example)

```
1. User clicks Run → CodeCell.onRun()
2. → App.jsx runCell(notebookId, cell)
3. → useKernelManager.runCell() creates Promise + prepareCellRun()
4. → window.electronAPI.sendToKernel(notebookId, { type: 'execute', id, code, ... })
5. → preload.js: ipcRenderer.send('kernel-send', { notebookId, message })
6. → main.js: ipcMain.on('kernel-send') → kernel-manager.sendToKernel()
7. → kernel stdin: JSON line written to child process
8. → kernel/Program.cs: message loop reads line, dispatches to ExecuteHandler
9. → ExecuteHandler: CSharpScript.RunAsync(), writes results to stdout
10. → stdout JSON lines: { type: 'stdout', id, content }, { type: 'complete', id, success }
11. → kernel-manager.js: readline parses, sends IPC to renderer
12. → useKernelManager: switch(msg.type) updates notebook state
13. → OutputBlock renders the result
```

### Mock server control from kernel (request-response)

```
1. User code: await Mock.StartAsync(apiDef)
2. → MockHelper writes { type: 'mock_request', requestId, action, payload } to stdout
3. → kernel-manager.js intercepts (not forwarded to renderer)
4. → Calls mock-server.js.startMockServer() directly
5. → Writes { type: 'mock_response', requestId, data } to kernel stdin
6. → MockHelper.ReceiveResponse() resolves the TaskCompletionSource
7. → User code gets the port number back
```

## How to Add Things

### New cell type

1. **`src/notebook-factory.js`** — Add fields to `makeCell()` spread
2. **`src/components/editor/NewCell.jsx`** — Create component (follow ShellCell pattern for simple, CodeCell for complex)
3. **`src/components/editor/AddBar.jsx`** — Add button with icon
4. **`src/components/NotebookView.jsx`** — Add branch in `renderCell()`, add to all 3 AddBar instances
5. **`src/hooks/useNotebookManager.js`** — Add to `buildNotebookData` cell serialization (line ~61)
6. **`src/hooks/useKernelManager.js`** — Add `runNewCell()` function if it needs kernel execution
7. **`src/app/App.jsx`** — Destructure from useKernelManager, pass to NotebookView
8. **`kernel/Handlers/NewHandler.cs`** — Create handler if kernel-side logic needed
9. **`kernel/Program.cs`** — Add dispatch case in message loop
10. **`src/styles.css`** — Add `.new-cell` styles

### New panel

1. **`src/components/panels/NewPanel.jsx`** — Create panel component
2. **`src/components/dock/renderPanelContent.jsx`** — Add render case
3. **`src/config/dock-layout.jsx`** — Add to default layout if it should dock
4. **`src/app/App.jsx`** — Add state, toolbar button, panel props
5. **`src/components/toolbar/ToolsMenu.jsx`** — Add toggle entry

### New setting (boolean toggle)

1. **`src/app/App.jsx`** — `useState` + `useRef` + sync `useEffect` (pattern at line ~63)
2. **`src/app/App.jsx`** — Add to `saveSettingsRef.current` object (line ~260)
3. **`src/app/App.jsx`** — Add `typeof s?.newSetting === 'boolean'` load check (line ~295)
4. **`src/app/App.jsx`** — Pass to SettingsDialog (line ~1330)
5. **`src/components/dialogs/SettingsDialog.jsx`** — Add to `AppearanceSection` params, add toggle in appropriate group, add to main function params, add to pass-through

### New kernel scripting API

1. **`kernel/NewHelper.cs`** — Create helper class (follow DockerHelper/MockHelper pattern)
2. **`kernel/Globals.cs`** — Add property to `ScriptGlobals`
3. **`kernel/Program.cs`** — Instantiate and wire into globals (line ~69)
4. If request-response needed (like Mock): use TaskCompletionSource pattern from MockHelper, intercept in kernel-manager.js

### New template

1. **`src/notebook-factory.js`** — Add to `NOTEBOOK_TEMPLATES` array, add case to `cellsForTemplate()`, create `makeNewCells()` function
2. Use helpers: `md()`, `cs()`, `docker()`, `http()` for cell creation
3. Set `columns: N` for side-by-side layout

## Testing

```bash
npm test              # Vitest — 1124 JS tests (renderer + main)
npm run test:kernel   # xUnit — 184 C# tests
npm run test:e2e      # Playwright (optional)
```

- **Renderer tests** (`tests/renderer/`): happy-dom environment, mock electronAPI in `tests/setup.js`
- **Main process tests** (`tests/main/`): node environment, mock electron module
- **Kernel tests** (`kernel/kernel.Tests/`): xUnit with process-based integration tests
- Global `afterEach` in setup.js flushes React async state — prevents flaky timeouts

### Test rules

- New features must include tests
- Pure refactors must not break existing tests
- Run both `npm test` and `npm run test:kernel` before committing

## CSS Architecture

- Single file: `src/styles.css` (8196 lines)
- CSS variables on `:root` for theming (8 themes defined)
- `--base-font-size` drives all text scaling via `calc()` expressions
- `--panel-zoom` scales dock/float panels
- Output areas use `calc((var(--base-font-size) ± offset) * 1px)`

## Common Gotchas

1. **preload.js wraps IPC** — renderer callbacks receive `(payload)` not `(_event, payload)`. The preload strips the event.

2. **Kernel messages are JSON lines on stdout** — one JSON object per line. `lock(realStdout)` is required for thread safety in handlers.

3. **DbContext namespace collisions** — each Db.Attach generates a unique namespace suffix. Without it, re-attaching causes CS0433.

4. **`using` directives in Roslyn scripts** — they persist across `ContinueWithAsync` calls. DB namespaces are injected as `using` so POCO types resolve unqualified.

5. **Mock server runs in main process** — not the kernel. The kernel communicates via request-response through stdout/stdin, intercepted by kernel-manager.js.

6. **CSS `rgba()` in backgrounds** — transparent backgrounds on sticky headers cause see-through. Use pre-mixed opaque colors.

7. **`act()` in tests** — components with async `useEffect` (e.g., `getAppPaths().then(setPaths)`) need the global afterEach flush in setup.js to prevent flaky timeouts.

8. **Canvas `getContext('2d')` returns null in happy-dom** — always guard with `if (!ctx) return`.

9. **Cell column layout** — consecutive cells with same `columns` value are grouped. The first cell in a group renders all; subsequent cells return `null`.

10. **Docker container ID truncation** — tracked as 12-char short IDs. Both tracking and untracking must use the same length.

## Architectural Recommendations

These aren't blocking issues but would improve maintainability:

### High value

- **Split App.jsx** (1432 lines) — Extract state into focused hooks: `useUIState` (settings, dialogs, panels), `useNotebookState` (notebooks, activeId). App.jsx should primarily compose hooks and render.

- **Break notebook-factory.js** (2520 lines) — Move each template into `src/templates/getting-started.js`, `src/templates/raytracer.js`, etc. Keep `makeCell()` and `NOTEBOOK_TEMPLATES` in the factory.

### Medium value

- **Decompose useKernelManager** (824 lines) — Split into `useKernelExecution` (cell run/stop), `useKernelLsp` (completions, lint, signatures), `useKernelDocker` (docker/mock handlers).

- **Split styles.css** (8196 lines) — Extract into `styles/base.css`, `styles/editor.css`, `styles/panels.css`, `styles/output.css`. Import in a single entry CSS file.

### Low priority

- **Standardize cell prop threading** — 8 cell types all receive the same `onMoveUp/onMoveDown/onDelete/onCopy/onNameChange/onColorChange` bundle. A shared `useCellActions(cell)` hook or a `<CellWrapper>` component could reduce boilerplate in `renderCell()`.

## Commit Conventions

- Semantic versioning in `package.json` (patch/minor/major)
- Version bump in the same commit as the change
- Author: `GIT_AUTHOR_NAME="Claude Sonnet 4.6"` (see CLAUDE.md)
- Update `src/config/changelog.js` + `CHANGELOG.md` for minor versions
- Update `src/config/docs-sections.js` + `README.md` for user-visible changes
- Update this file for architectural changes
