# Task: DB entity types — singular aliases + copyable type name in schema tree

**Branch:** `fix/bugfixes-cleanup`

## Goal
1. Generate an **EF-style singular alias** for each table's POCO type (`Purchase` alongside
   `Purchases`), usable at runtime AND in IntelliSense/diagnostics. Same type identity, so
   `List<Purchase>` accepts a `List<Purchases>`.
2. In the DB panel schema tree, show the generated type name next to each table as a small
   **clipboard badge** that copies it on click — mirroring the existing `VarBadge` (DbContext
   var name).

## Design
- Alias = a `using <Singular> = <ns>.<Class>;` directive (NOT a subclass — must be the same
  type). Real class stays plural (`Purchases`); alias adds `Purchase`. Non-breaking.
- Single source of truth in `DbCodeGen`: `Singularize()` + `TableTypeInfo(schema)` →
  `(table, typeName, alias?)` with collision suppression (no alias if it clashes with another
  table's class name or an earlier alias).

## Kernel
- [ ] `kernel/Db/DbCodeGen.cs`: add `Singularize(string)` (best-effort English rules + guards
      for ss/us/is + a few irregulars) and `TableTypeInfo(DbSchema)`.
- [ ] `kernel/Handlers/DbHandler.cs`:
  - [ ] `BuildDbPreamble()` (LSP) — after each relational `using {ns};`, emit alias usings.
  - [ ] `InjectDbContextAsync()` (runtime) — emit alias usings in the relational branches,
        **only when `!isReconnect`** (a repeated `using Alias =` is a compile error; the LSP
        preamble is rebuilt wholesale so it's always correct).
  - [ ] Both `db_schema` payloads (attach + refresh) — add `typeName` + `singular` per table
        (relational only; null for Redis).
- [ ] Tests: `kernel/kernel.Tests/DbCodeGenTests.cs` — Singularize cases + TableTypeInfo
      collision suppression.

## Renderer
- [ ] `src/components/panels/db/DbPanel.jsx`: add a `TypeBadge` in the `db-table-header`
      (render only when `table.typeName`), showing `singular ?? typeName`, copying that string,
      using `useClipboard` + `e.stopPropagation()` + the same inline clipboard SVG as `VarBadge`.
- [ ] `src/styles.css`: `.db-type-badge` / `.db-type-copy` modeled on `.db-var-badge`/`.db-var-copy`.
- [ ] `useKernelManager.js` — no change (payload passes through verbatim).
- [ ] Tests: `tests/renderer/DbPanel.test.jsx` — extend SCHEMA fixture with `typeName`/`singular`,
      assert the badge renders and copies.

## Docs / version
- [ ] `src/config/docs-sections.js` — DB section: note plural class + singular alias + the copy badge.
- [ ] `README.md` — DB integration + Database panel bullet.
- [ ] `src/config/changelog.js` — new entry.
- [ ] `package.json` — minor bump 2.21.0 → 2.22.0 (new feature).
- [ ] Build renderer, `npm test`, `npm run test:kernel`; drive the kernel to confirm the
      singular alias compiles/resolves. Commit.

## Review

**Done.** Both features shipped.

1. **Singular aliases** — `DbCodeGen.Singularize()` + `TableTypeInfo()` (collision-safe) are the
   single source of truth. `DbHandler` emits `using <Singular> = <ns>.<Class>;` into the LSP
   preamble (always) and the runtime injection (first attach only — a repeated using-alias is a
   compile error; the LSP preamble is rebuilt wholesale so it stays correct after reconnect).
2. **Copy badge** — `TypeBadge` in `DbSchemaTree` shows `singular ?? typeName` with a clipboard
   icon (mirrors `VarBadge`, `stopPropagation` so it doesn't toggle the row). Fed by new
   `typeName`/`singular` fields added to both `db_schema` payloads (relational only; null for Redis).

Verified:
- Kernel suite 262 passed; JS suite 1301 passed (82 files).
- **End-to-end kernel drive** against a real SQLite `Purchases` table: `db_schema` carried
  `typeName=Purchases singular=Purchase`; the user's exact `List<Purchase>` function compiled and
  ran; `typeof(Purchase) == typeof(Purchases)` → `True` (passing `List<Purchases>` to a
  `List<Purchase>` param works).
- DbPanel tests assert the badge renders the singular, copies on click, doesn't expand the row,
  and is omitted for Redis.

Docs: docs-sections DB section (Schema Browser + new Generated Types), README (DB integration +
query-builder bullet), changelog (2.22.0 + backfilled 2.21.0 / 2.20.5). Version → 2.22.0.

Note: singularization is best-effort — ambiguous cases like `Statuses` are intentionally left
alone (the plural class name always works).
