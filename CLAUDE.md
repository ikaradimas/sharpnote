# SharpNote — Claude Instructions

## Workflow Orchestration

### 1. Plan Node Default
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

**Authorship:** Every commit must be authored and committed by Claude. Always set both
the author and committer identity by prefixing the `git commit` call with the environment
variables below. Never rely on the ambient git config for identity.

```bash
GIT_AUTHOR_NAME="Claude Sonnet 4.6" \
GIT_AUTHOR_EMAIL="noreply@anthropic.com" \
GIT_COMMITTER_NAME="Claude Sonnet 4.6" \
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
