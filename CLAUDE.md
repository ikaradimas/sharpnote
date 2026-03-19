# SharpNote — Claude Instructions

## Committing changes

After completing any task that modifies files, commit all changed files before finishing.
Do not leave work uncommitted at the end of a session.

## Documentation maintenance

Whenever you make a change that affects user-visible behaviour, public APIs, keyboard
shortcuts, IPC channels, panels, or the file format, you **must** also update all three
documentation surfaces in the same commit:

| Surface | Location | What to update |
|---|---|---|
| In-app docs | `src/config/docs-sections.js` — `DOCS_SECTIONS` array | Add/edit/remove the relevant section object(s) |
| README | `README.md` | Update the Features list, Architecture tables, or any other affected section |
| Application menu | `src/main/menu.js` — `buildMenu()` function | Add/update menu items, labels, accelerators, or tooltips |

**Scope rule:** only update what actually changed. A bug fix that has no user-visible effect
does not require a docs update. A new panel, command, keyboard shortcut, output type,
IPC handler, or file-format field always does. UX behaviour changes (e.g. new visual
feedback, changed interaction flow) also qualify and must be documented.

**Pre-commit checklist:** before every commit that touches behaviour, verify that
`src/config/docs-sections.js` has an appropriate section for any affected feature,
and that `README.md` reflects the change in its Features list and/or Architecture section.

## Key file locations

### Electron main process (`src/main/`)

| File | Purpose |
|---|---|
| `main.js` | Entry point — wires IPC handlers, creates BrowserWindow |
| `src/main/kernel-manager.js` | Kernel lifecycle: spawn, kill, queue, ready state |
| `src/main/notebook-io.js` | Notebook save / load / recent-files persistence |
| `src/main/file-ops.js` | Generic file read/write, path-traversal guard |
| `src/main/db-connections.js` | DB connection list persistence |
| `src/main/library.js` | Code library directory operations |
| `src/main/log-ops.js` | Log file read/write |
| `src/main/settings.js` | App settings persistence (dock layout, theme, …) |
| `src/main/menu.js` | `buildMenu()` — application menu and accelerators |

### React renderer (`src/`)

| File | Purpose |
|---|---|
| `src/renderer.jsx` | Bundle entry + re-exports for tests; no component code |
| `src/app/App.jsx` | Root component — all global state, IPC listeners |
| `src/app/StatusBar.jsx` | Bottom status bar (memory sparkline, cursor position) |
| `src/components/NotebookView.jsx` | Toolbar + cell list for one notebook |
| `src/components/toolbar/` | TabBar, Tab, Toolbar, ThemePicker, ToolsMenu, Icons, … |
| `src/components/editor/` | CodeEditor (CodeMirror), CodeCell, MarkdownCell, AddBar |
| `src/components/output/` | OutputBlock, CellOutput, DataTable, GraphOutput |
| `src/components/panels/` | LogPanel, NugetPanel, DbPanel, DocsPanel, ConfigPanel, VarsPanel, TocPanel, FilesPanel, LibraryPanel, LibraryEditorPane |
| `src/components/dock/` | DockZone, FloatPanel, DockDropOverlay, LayoutManager, renderPanelContent |
| `src/components/dialogs/` | QuitDialog |
| `src/config/` | DOCS_SECTIONS, THEMES, TAB_COLORS, dock-layout defaults, DB providers, C# keywords |
| `src/constants.js` | Shared string constants (DOCS_TAB_ID, LIB_EDITOR_ID_PREFIX, …) |
| `src/utils.js` | Pure helper functions (formatters, parsers, ID helpers) |
| `src/hooks/` | Custom React hooks (useResize, …) |
| `src/styles.css` | Urban dark theme |

### Kernel (`kernel/`)

| File | Purpose |
|---|---|
| `kernel/Program.cs` | Entry point + message dispatch loop (partial class Program) |
| `kernel/Globals.cs` | ScriptGlobals, DisplayContext, LogContext, ConfigHelper |
| `kernel/Display.cs` | DisplayHandle + DisplayHelper |
| `kernel/Extensions.cs` | `.Display()`, `.Log()`, `.AutoDisplay()` extension methods |
| `kernel/SyntaxRewriter.cs` | Roslyn CancellationCheckInjector |
| `kernel/Handlers/` | `partial class Program` handlers: Execute, Nuget, Lint, Autocomplete, Db, Reset |
| `kernel/Db/` | IDbProvider, DbProviders registry, DbCodeGen, per-provider classes (SQLite, SQL Server, PostgreSQL, Redis), Models |

### Tests & docs

| Path | Purpose |
|---|---|
| `tests/` | Vitest JS tests (`npm test`) |
| `kernel/kernel.Tests/` | xUnit .NET tests (`npm run test:kernel`) |
| `README.md` | External documentation |

## Testing

Run both suites before committing non-trivial changes:

```bash
npm test                  # JS tests (Vitest)
npm run test:kernel       # .NET tests (xUnit)
```

**Test coverage rule:** every new feature or behaviour change must be accompanied by
tests in the same commit. Match the test type to the code being changed:

| Change | Where to add tests |
|---|---|
| New/modified React component or utility | `tests/renderer/` — Vitest + happy-dom |
| New/modified IPC handler or main-process logic | `tests/main/` — Vitest + node env |
| New/modified kernel provider, codegen, or protocol | `kernel/kernel.Tests/` — xUnit |

**Scope rule:** a pure refactor with no behaviour change does not require new tests,
but must not break existing ones. A new panel, IPC channel, kernel message type,
DB provider, or scripting API always needs tests.

## Code organisation conventions

### One component (or module) per file

Every React component, custom hook, config constant group, and main-process module lives
in its own file. Do **not** add new exported components or hooks to an existing file that
already exports a different primary component or hook.

**Naming rules:**
- React components: `PascalCase.jsx` (e.g. `LogPanel.jsx`, `CodeCell.jsx`)
- Custom hooks: `camelCase.js` starting with `use` inside `src/hooks/` (e.g. `useResize.js`)
- Config constants: `kebab-case.js` inside `src/config/` (e.g. `docs-sections.js`)
- Main-process modules: `kebab-case.js` inside `src/main/` (e.g. `kernel-manager.js`)

**Import direction rules (no circular deps):**
- `src/app/` may import from `src/components/**`, `src/config/`, `src/utils.js`, `src/constants.js`, `src/hooks/`
- `src/components/**` may import from sibling component files, `src/config/`, `src/utils.js`, `src/constants.js`, `src/hooks/`
- `src/config/`, `src/utils.js`, `src/constants.js`, `src/hooks/` must not import from `src/components/**` or `src/app/`
- `src/renderer.jsx` only re-exports; it must not contain component definitions
- `src/main/*.js` modules must not import from `src/components/**` (renderer-only code)

**Small helper components** that are only ever used by a single parent component (e.g.
`CellControls` inside `CodeCell.jsx`) may be defined in the same file as that parent,
but must **not** be exported. If a helper is needed by two or more components, extract it
to its own file.
