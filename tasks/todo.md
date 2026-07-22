# Dependency-execution safety (#1 manual-only + #2 ambiguity/run-plan)

Two small changes that came straight from incidents this session: side-effect cells
silently re-firing via dependency auto-run, and the B2B/B2C ambiguous-producer confusion.

## #1 — "Manual only" cells (never auto-run)
- [ ] `graph-traversal`: extract `computeRunPlan(cellId, cells, edges, {staleCellIds, cellResults})`
      — single source of truth for "what previous stale deps run when I run this cell". Skips
      `manualOnly` producers (and does not traverse through them).
- [ ] `useCellOrchestrator.runWithDeps`: use `computeRunPlan` instead of its inline collection.
- [ ] `useKernelManager.runAll / runFrom / runTo`: skip `cell.manualOnly`.
- [ ] UI: header toggle on runnable cells (code/sql/http/shell/docker) + a "manual only" badge;
      mirror the existing `locked`/`codeFolded` toggle wiring.
- [ ] Persist `manualOnly` in `buildNotebookData` (field whitelist).

## #2 — Ambiguous-producer lint + run-plan preview
- [ ] `buildCellGraph`: track ALL producers per var; add `node.ambiguous` (vars this cell produces
      that are also produced elsewhere) + return `ambiguousVars` map. "last writer wins" unchanged.
- [ ] UI: warning badge on ambiguous-producer cells; tooltip names the var + the other producers +
      which one wins.
- [ ] Run button: hover tooltip showing `computeRunPlan` result — "Also runs: X, Y" and any
      manual-only producers skipped.

## Verify
- [ ] Unit tests: computeRunPlan (manual-only skip, stale filter, previous-only), buildCellGraph
      ambiguity, orchestrator skip, runAll skip.
- [ ] Full JS + kernel suites green. Docs (docs-sections + README) + changelog + version bump.

## Review

**Done (2.30.0).** Both features shipped.

- `computeRunPlan` (graph-traversal) is the shared source of truth: `runWithDeps` and the
  run-button tooltip both use it; manual-only producers are excluded and not traversed through.
- `buildCellGraph` tracks all producers → `node.ambiguous` + `ambiguousVars` map (last-writer-wins
  edge behaviour unchanged). `node.manualOnly` surfaced too.
- `runAll`/`runFrom`/`runTo` skip `manualOnly`. `manualOnly` persisted in `buildNotebookData`.
- UI: shared `CellManualToggle` (hand icon, highlighted when on) + `CellAmbiguityBadge` (amber
  triangle) added to code/sql/http/shell/docker headers; `cell-manual-only` root cue (amber left
  rule); `CellRunGroup` gained `runTitle`. NotebookView computes the ambiguity + run-plan tooltips
  (it has graph + labels) and threads them + `onToggleManualOnly` down; App passes `depGraph` to
  the active pane only.
- Tests: 8 `computeRunPlan` + 3 ambiguity/manualOnly graph cases + 2 orchestrator manual-only
  cases + `CellManualToggle`/`CellAmbiguityBadge` + ShellCell cell-side wiring. Full JS 1389 pass.
  Docs: reactive-deps section (manual-only + ambiguity/run-plan), README, changelog 2.30.0.
- Note: live Electron smoke not possible here (electron binary not installed in this env); verified
  via full renderer bundle compile + unit/component/cell-render tests.
