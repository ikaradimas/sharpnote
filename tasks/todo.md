# Task: Rework cell interdependencies — run dependencies first; default "none"

**Branch:** `fix/bugfixes-cleanup`

## Behavior
- Running a **code cell** first navigates its dependency tree and runs its transitive
  **upstream** dependencies (topological order), then the cell itself.
- A dependency = a cell that **produces a variable this cell consumes** (data-flow,
  auto-detected) **or** an **explicitly-wired** prev/next link. Decision-branch edges included.
- **Default is "none":** a cell with no data-flow and no explicit links has NO dependencies
  and runs alone. The old "implicit / next-in-notebook-order" sequential fallback is removed.

## Changes
- [ ] `src/hooks/useCellDependencies.js` — delete the "implicit sequential edges" loop
      (adjacent-cell fallback). Edges now = variable-flow + decision paths + explicit next/prev.
- [ ] `src/components/editor/CellLinkPicker.jsx` — remove the "Next in notebook order"
      (implicit) option; `undefined`/`null`/`[]` all render as "None (default)"; normalize
      cleared selection to `null`.
- [ ] `src/hooks/useCellOrchestrator.js` — add `expandDecisions` option to `executeQueue`
      (default true); `runWithDeps` passes `false` (upstream runs must NOT expand a decision's
      downstream branch). `runDownstream`/`runSubgraph`/`runPipeline` keep expansion.
- [ ] `src/app/App.jsx` — wire `onRunCell` (code-cell Run) to run dependencies-first via
      `orchestrator.runWithDeps(nbId, cell.id)`. Leave `runCell` (scheduler) and `runAll`/
      `runFrom`/`runTo` unchanged.
- [ ] CSS: drop the now-unused `.cell-link-implicit` rule if present.

## Not touched (noted)
- Positional stale-cell banner (`useKernelManager.js`) — separate feature; left as-is.
- `runAll`/`runFrom`/`runTo` stay in document order.

## Tests
- [ ] `tests/renderer/useCellDependencies.test.js` (new) — no sequential edges; data-flow edge
      built from produces/consumes; explicit link edge; isolated cell has no incoming edge.
- [ ] `tests/renderer/CellLinkPicker.test.jsx` (new) — no "Next in notebook order"; default shows
      "None"; selecting/clearing calls onChange correctly.
- [ ] `tests/renderer/useCellOrchestrator.test.js` (new) — executeQueue runs in given order and
      awaits each; `runWithDeps` runs upstream-then-target and does NOT expand decision branches.

## Docs / version
- [ ] `docs-sections.js` (Reactive Cell Dependencies / Orchestration), `README.md` (features),
      `changelog.js`. Minor bump 2.22.1 → 2.23.0.
- [ ] Build renderer, `npm test`; drive the kernel to confirm running a downstream cell first
      runs its producer. Commit.

## Review

**Done.** Running a code cell now runs its dependency tree first; default is "none".

- `useCellDependencies.js` — removed the implicit sequential adjacent-cell edges. Edges =
  data-flow (produces→consumes) + decision paths + explicit next/prev.
- `CellLinkPicker.jsx` — removed the "Next in notebook order" option; empty/undefined = "None
  (default)"; cleared selection normalizes to null.
- `useCellOrchestrator.js` — `executeQueue` gained `expandDecisions` (default true);
  `runWithDeps` passes false so upstream runs don't drag in a decision's downstream branch.
- `App.jsx` — `onRunCell` now routes code-cell Run through `orchestrator.runWithDeps`
  (deps-first), falling back to a plain run for non-active notebooks.
- **Latent bug fixed:** the orchestrator was receiving `dispatchCellRun` under the wrong key,
  so `dispatchRun` was undefined — every dependency-ordered run (Run with Upstream/Downstream/
  Pipeline, panel node Run) had been silently broken. Fixed the prop key.
- Removed dead `.cell-link-implicit` CSS.

Tests (new): `useCellDependencies.test.js`, `CellLinkPicker.test.jsx`, `useCellOrchestrator.test.js`
(incl. a composition test: running a variable consumer runs its producer first, skips unrelated).
Full JS suite **1313 passed / 85 files**. Renderer builds; app smoke-launched cleanly (renderer
rendered, kernel reached ready, no runtime errors).

Docs: docs-sections Reactive Cell Dependencies (new "Running dependencies first" + "Default: none"),
README (new Dependency-first execution bullet), changelog 2.23.0. Version → 2.23.0.

Note (left for later): the stale-cell banner is still positional (cells below), not graph-based —
now somewhat redundant with dependency-first execution; a follow-up could make it graph-driven.
