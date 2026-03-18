Perform a documentation pass across all three surfaces. For each surface, check whether it reflects the current state of the codebase and update anything that is stale, missing, or incorrect.

## 1. In-app documentation

File: `src/renderer.jsx`
Location: `DOCS_SECTIONS` array (search for `const DOCS_SECTIONS`)

Read the array and compare it against the actual features, keyboard shortcuts, IPC channels, panels, and file format present in the codebase. Add missing sections, update changed descriptions, and remove obsolete entries.

## 2. README.md

File: `README.md`

Read the current README and compare it against:
- `package.json` — scripts, dependencies, version
- `main.js` — IPC channels, multi-kernel map, file operations, recent files, library path
- `src/renderer.jsx` — components, state shape, panels, utility functions
- `kernel/Program.cs` — protocol messages, kernel capabilities
- `kernel/DbProvider.cs` / `kernel/DbCodeGen.cs` — DB providers, codegen

Update: Features list, Architecture tables, IPC protocol tables, Prerequisites, Testing section (file counts), and any other section that is out of date.

## 3. Application menu

File: `main.js`
Location: `buildMenu()` function (search for `function buildMenu`)

Read the current menu template and compare it against the actual features and panels. Add missing menu items, update labels/accelerators that have changed, and remove items for features that no longer exist.

## After updating

Summarise what changed across all three surfaces. Do not commit — let the user review first.
