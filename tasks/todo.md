# Task: Cell outputs & Variables panel — latest-only

**Branch:** `fix/bugfixes-cleanup`
**Goal:** A code cell keeps only its latest execution's outputs (remove the automatic
"last 5 runs" history navigator + compare-pin). The Variables panel shows only the latest
snapshot (remove the per-variable sparkline column).

**Out of scope (confirmed):** `retainedResults` (user-initiated persistent 📌 pin) stays.
`Display.Plot()` / `varHistory` / Graph panel stay. The green/blue/red diff-flash stays.

---

## A. Cell output history removal

- [ ] `src/hooks/useKernelManager.js` — `prepareCellRun`: drop the `outputHistory` snapshot
      push + cap (`.slice(-4)`); stop returning `outputHistory` in the patch. Keep the
      `outputs[cellId] = []` clear.
- [ ] `src/hooks/useKernelManager.js` — remove `outputHistory: {}` from the kernel-reset patch.
- [ ] `src/notebook-factory.js` — remove `outputHistory: {}` from the factory.
- [ ] `src/components/editor/CodeCell.jsx` — remove `outputHistory` prop, `histIdx` +
      `pinnedHistIdx` state, the reset effect, `histLen`, history-vs-current selection,
      the `‹ ›` navigator JSX, and the `output-compare` comparison block. Displayed
      outputs become simply `outputs`.
- [ ] `src/components/NotebookView.jsx` — stop passing `outputHistory` to CodeCell.
- [ ] `src/styles.css` — remove dead classes: `.output-history-nav`, `.hist-nav-btn`,
      `.hist-nav-label`, `.hist-pin-btn`, `.hist-unpin-btn`, `.output-compare*`.
- [ ] `tests/renderer/prepareCellRun.test.js` — remove the "snapshots previous outputs"
      test; keep the others.

## B. Variables panel sparkline removal

- [ ] `src/components/panels/VarsPanel.jsx` — remove the `Sparkline` component, the
      `varHistory` prop, the sparkline `<th>` header and `<td>` cell. Latest `vars`
      snapshot + diff-flash + watches + inspect all remain.
- [ ] `src/app/App.jsx` — stop passing `varHistory` to `VarsPanel` (keep it going to GraphPanel).
- [ ] `src/styles.css` — remove `.var-sparkline`, `.vars-sparkline-col`, `.vars-sparkline-cell` if unused elsewhere.

## C. Docs / version / tests (per CLAUDE.md)

- [ ] `src/config/docs-sections.js` — remove the "last 5 runs" / compare-pin copy and the
      "Variable Sparklines" copy.
- [ ] `README.md` — remove the "Cell Output History", "Output Pinning", and
      "Variable Sparklines" feature bullets.
- [ ] `package.json` — version bump (patch: feature removal / cleanup, no new capability).
- [ ] Run `npm test` (Vitest). Kernel unaffected → `npm run test:kernel` not required.
- [ ] Verify in-app (build + drive) that a re-run replaces output and the nav/sparkline are gone.
- [ ] Commit (Claude identity) on `fix/bugfixes-cleanup`.

## Suggested extra improvements (raised for approval)

1. **Docs accuracy bug:** README/docs claim variable sparklines update "after every
   execution", but they were actually only fed by `Display.Plot()`. Removing the column
   makes this moot; docs corrected in the same pass.
2. **`clear-output`** already clears only `outputs` — becomes fully consistent once history
   is gone (no orphaned history left behind). No code change needed beyond the removal.

## Review

**Done.** Both features removed; a cell now keeps only its latest run's outputs and the
Variables panel shows only the latest snapshot.

Files changed:
- `src/hooks/useKernelManager.js` — `prepareCellRun` no longer archives previous outputs;
  removed `outputHistory` from the reset patch.
- `src/components/editor/CodeCell.jsx` — removed `histIdx`/`pinnedHistIdx` state, the reset
  effect, the `‹ ›` navigator, and the side-by-side compare block. Displayed outputs = `outputs`.
- `src/components/panels/VarsPanel.jsx` — removed `Sparkline` + the sparkline column.
- `src/components/NotebookView.jsx`, `src/app/App.jsx`, `src/notebook-factory.js` — dropped
  the now-unused `outputHistory` / `varHistory`-to-VarsPanel wiring.
- `src/styles.css` — removed dead `.output-history-nav`, `.hist-*`, `.output-compare*`,
  `.var-sparkline`, `.vars-sparkline-*` rules.
- Docs: `src/config/docs-sections.js` (removed 3 sections), `README.md` (removed 3 bullets,
  fixed the VarsPanel row + the "updated after every execution" false claim).
- Test: `tests/renderer/prepareCellRun.test.js` — snapshot test replaced with a regression
  guard that no history is accumulated.
- `package.json` — 2.20.4 → 2.20.5.

Kept intact (confirmed): `retainedResults` persistent pin, `Display.Plot`/`varHistory`/Graph
panel, the green/blue/red diff-flash, watches, inspect.

Verification: `npm run build:renderer` compiles clean (no dangling refs); `npm test` →
**1294 passed / 81 files**. Kernel untouched (no `test:kernel` needed). Full Electron
drive not run — no built kernel binary in this env; behavior is covered by the unit test +
clean bundle.
