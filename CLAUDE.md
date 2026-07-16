# SharpNote — Claude Instructions

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Committing changes

After completing any task that modifies files, commit all changed files before finishing.
Do not leave work uncommitted at the end of a session.

**Authorship:** Every commit must be authored and committed by Claude, never the ambient
git config. Set both the author and committer identity by prefixing the `git commit` call
with the environment variables below. Use the stable name `Claude` — do **not** hardcode a
model version here (it goes stale); record the specific model in the commit-message trailer
instead (e.g. `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

```bash
GIT_AUTHOR_NAME="Claude" \
GIT_AUTHOR_EMAIL="noreply@anthropic.com" \
GIT_COMMITTER_NAME="Claude" \
GIT_COMMITTER_EMAIL="noreply@anthropic.com" \
git commit -m "..."
```

## Semantic versioning

Every commit must bump the version in `package.json` according to these rules:

| Change type | Version segment | Examples |
|---|---|---|
| Bug fix, chore, refactor, tooling, docs-only | **patch** — `1.0.0 → 1.0.1` | fix a crash, update README, add npm script |
| New backwards-compatible feature | **minor** — `1.0.1 → 1.1.0` | new panel, new IPC channel, new output type |
| Breaking change | **major** — `1.1.0 → 2.0.0` | removed/renamed IPC channel, changed file format, removed public API |

**Rules:**
- Read the current version from `package.json` before every commit and write the bumped value back.
- A single commit may only bump one segment; choose the highest-priority one that applies (major > minor > patch).
- The version bump must be included in the same commit as the change — never in a separate commit.

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

### Electron main process

`main.js`, `preload.js`, and `index.html` live at the repo root; the rest of the
main-process code lives in `src/main/`. Curated, not exhaustive:

| File | Purpose |
|---|---|
| `main.js` (repo root) | Entry point — creates the BrowserWindow, wires the IPC handlers |
| `preload.js` (repo root) | contextBridge — exposes `window.electronAPI` to the renderer |
| `src/main/kernel-manager.js` | Kernel lifecycle: spawn, kill, queue, ready state |
| `src/main/notebook-io.js` | Notebook save / load persistence |
| `src/main/notebook-history.js` | Sidecar `.cnb.history` snapshot store |
| `src/main/recent-files.js` | Recent-files persistence |
| `src/main/file-ops.js` | Generic file read/write, path-traversal guard |
| `src/main/db-connections.js` | DB connection list persistence |
| `src/main/library.js` | Code library directory operations |
| `src/main/log-ops.js` | Log file read/write |
| `src/main/settings.js` | App settings persistence (dock layout, theme, …) |
| `src/main/menu.js` | `buildMenu()` — application menu and accelerators |
| `src/main/headless.js` | CLI / headless notebook execution |
| `src/main/git-ops.js` | Git panel operations |
| `src/main/kafka.js` | Kafka broker connections + consumers |
| `src/main/export-exe.js`, `export-app.js` | Export as Executable / as App |
| `src/main/api-editor-export.js`, `api-csharp-export.js`, `api-saved.js`, `mock-server.js` | API Editor / Browser support + mock server |
| `src/main/snapshots.js` | Output-snapshot capture / compare |
| `src/main/polyglot-import.js` | Excel / Parquet data-file import |

### React renderer (`src/`)

| File | Purpose |
|---|---|
| `src/renderer.jsx` | Bundle entry + re-exports for tests; no component code |
| `src/app/App.jsx` | Root component — all global state, IPC listeners |
| `src/app/StatusBar.jsx` | Bottom status bar (memory sparkline, cursor position) |
| `src/app/panel-tabs.js` | Panel tab metadata (ids, labels, ordering) |
| `src/components/NotebookView.jsx` | Toolbar + cell list for one notebook |
| `src/components/` (top level) | Misc renderer widgets: NotebookParams, FindBar, ErrorBoundary, and decorative art (CircuitBoard, Ghost, IdleSkyline) |
| `src/components/toolbar/` | TabBar, Tab, Toolbar, ThemePicker, ToolsMenu, Icons, … |
| `src/components/editor/` | CodeEditor (CodeMirror), CodeCell, MarkdownCell, AddBar, and specialised cells: SqlCell, HttpCell, ShellCell, DockerCell, FlociCell, DecisionCell, CheckCell |
| `src/components/output/` | OutputBlock (defines CellOutput), DataTable, GraphOutput, plus per-type renderers: Map, Sankey, TreeMap, Network, CalendarHeat, ObjectTree, Form, Layout, Image, Markdown, Marp, Progress, Widget |
| `src/components/panels/` | Feature panels: ConfigPanel, VarsPanel, TocPanel, TodoPanel, GraphPanel, HistoryPanel, ProfilePanel, RegexPanel, DependencyPanel, EmbedPanel, FilesPanel, GitPanel, ApiPanel, ApiEditorPanel, ChangelogPanel; grouped subfolders `log/`, `nuget/`, `db/`, `docs/`, `library/`, `kafka/`, `git/`, `api-editor/`, `dep/` |
| `src/components/dock/` | DockZone, FloatPanel, DockDropOverlay, LayoutManager, renderPanelContent |
| `src/components/dialogs/` | AboutDialog, SettingsDialog, CommandPalette, QuitDialog, NewNotebookDialog, DbConnectionDialog, VarInspectDialog, ExportAppDialog, PassphraseDialog, CredentialsDialog, KeyboardShortcutsOverlay |
| `src/config/` | docs-sections, themes, tab-colors, dock-layout, db-providers, notebook-backgrounds, changelog, table-page-size-context |
| `src/constants.js` | Shared string constants (DOCS_TAB_ID, LIB_EDITOR_ID_PREFIX, …) |
| `src/utils.js` | Pure helper functions (formatters, parsers, ID helpers) |
| `src/notebook-factory.js` | Default per-notebook state shape (`createNotebook`) |
| `src/hooks/` | Custom React hooks: useKernelManager, useNotebookManager, useDockLayout, useCellDependencies, useCellOrchestrator, useCellScheduler, usePipelineManager, useClipboard, useResize, useOutsideClick |
| `src/styles.css` | Urban dark theme |

### Kernel (`kernel/`)

| File | Purpose |
|---|---|
| `kernel/Program.cs` | Entry point + message dispatch loop (partial class Program) |
| `kernel/Globals.cs` | ScriptGlobals, DisplayContext, LogContext, ConfigHelper |
| `kernel/Display.cs` | DisplayHandle + DisplayHelper |
| `kernel/Extensions.cs` | `.Display()`, `.Log()`, `.AutoDisplay()` extension methods |
| `kernel/SyntaxRewriter.cs` | Roslyn CancellationCheckInjector |
| `kernel/DebugContext.cs`, `DebugCheckInjector.cs` | Breakpoint/debugger support |
| `kernel/LspServer.cs`, `WorkspaceManager.cs` | LSP server (completions, hover, diagnostics) over the named pipe |
| `kernel/*.cs` scripting helpers | Stats, TimeSeries, GeoHelper (+GeoCache), DockerHelper, Panels, UtilHelper, DataHelper, FilesHelper, MockHelper, DbApi |
| `kernel/BitmapFont.cs`, `BmpEncoder.cs`, `PngEncoder.cs` | Canvas / image-output encoding |
| `kernel/Handlers/` | `partial class Program` handlers: Execute, Nuget, Lint, Autocomplete, Signature, Check, Format, Db, Sql, Http, Shell, Docker, Decision, VarInspect, Reset |
| `kernel/Db/` | IDbProvider, DbProviders registry, DbCodeGen, Models, AssemblyLoader, per-provider classes (SQLite, SQLite-InMemory, SQL Server, PostgreSQL, Redis) |

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
the local `Sparkline` inside `ProfilePanel.jsx`) may be defined in the same file as that
parent, but must **not** be exported. If a helper is needed by two or more components,
extract it to its own file.
