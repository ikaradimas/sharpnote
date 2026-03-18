# Polyglot Notebook — Claude Instructions

## Documentation maintenance

Whenever you make a change that affects user-visible behaviour, public APIs, keyboard
shortcuts, IPC channels, panels, or the file format, you **must** also update all three
documentation surfaces in the same commit:

| Surface | Location | What to update |
|---|---|---|
| In-app docs | `src/renderer.jsx` — `DOCS_SECTIONS` array (line ~77) | Add/edit/remove the relevant section object(s) |
| README | `README.md` | Update the Features list, Architecture tables, or any other affected section |
| Application menu | `main.js` — `buildMenu()` function (line ~94) | Add/update menu items, labels, accelerators, or tooltips |

**Scope rule:** only update what actually changed. A bug fix that has no user-visible effect
does not require a docs update. A new panel, command, keyboard shortcut, output type,
IPC handler, or file-format field always does.

## Key file locations

| File | Purpose |
|---|---|
| `main.js` | Electron main process — IPC handlers, kernel manager, menus |
| `src/renderer.jsx` | All React UI — components, `DOCS_SECTIONS`, utility exports |
| `src/styles.css` | Urban dark theme |
| `kernel/Program.cs` | C# kernel — protocol loop, execution, display, lint, autocomplete |
| `kernel/DbProvider.cs` | Database provider interface + SQLite/SQL Server/PostgreSQL/Redis |
| `kernel/DbCodeGen.cs` | POCO + DbContext code generation |
| `README.md` | External documentation |
| `tests/` | Vitest JS tests (`npm test`) |
| `kernel/kernel.Tests/` | xUnit .NET tests (`npm run test:kernel`) |

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
