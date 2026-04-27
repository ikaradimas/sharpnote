# SharpNote — Expansions roadmap (post-2.9.0)

Branch: `feature/expansions`. All eight planned milestones are shipped
on this branch (2.10.0 → 2.17.0); the only deferred item is M1.5
(Choropleth) which is captured as a follow-up below.

| # | Version | Milestone                                              | Status   |
|---|---------|--------------------------------------------------------|----------|
| 1 | 2.10.0  | Geo follow-up (cache, cluster, PNG, distance/cluster)  | shipped  |
| 1.5 | —     | Choropleth + world-countries GeoJSON                   | deferred |
| 2 | 2.11.0  | `Stats.*` + `TimeSeries.*`                             | shipped  |
| 3 | 2.12.0  | `Display.Sankey` + `Display.TreeMap`                   | shipped  |
| 4 | 2.13.0  | `Display.CalendarHeat` + `Display.Network`             | shipped  |
| 5 | 2.14.0  | Parameterised notebooks                                | shipped  |
| 6 | 2.15.0  | Output snapshots / golden tests                        | shipped  |
| 7 | 2.16.0  | Profile panel                                          | shipped  |
| 8 | 2.17.0  | Notebook → PDF export (print stylesheet)               | shipped  |

---

## Milestone 1 — Geography follow-up (shipped 2.10.0)

Four of five planned items shipped: pure helpers (`Distance`, `Cluster`),
geocoding cache, marker clustering, and PNG export from the toolbar.

**Choropleth was carved out into its own milestone** (M1.5 below) — the
GeoJSON sourcing question (no good public ISO-2-keyed simplified-world
file exists; either bundle ~250KB Natural Earth + an ISO map, or convert
TopoJSON at build time) deserves a focused effort instead of being
rushed in alongside the rest.

## Milestone 1.5 — Choropleth (target: 2.10.x or fold into M3)

**Scope:**
- `Geo.Choropleth(values, level = "country", colorScale = null)` —
  values keyed by ISO-2 country code.
- Bundle a small simplified world-countries dataset (likely TopoJSON
  countries-110m, ~110KB) with a build-step conversion to GeoJSON +
  numeric-id ↔ ISO-2 mapping.
- Renderer: `L.geoJSON` layer with per-feature `style` callback.
- Replace the Sales-by-Region infographic cell with a real choropleth.

**Open questions to resolve before starting:**
- Source the dataset (Natural Earth via `world-atlas` package?).
- Where to store the ISO-2 mapping table (small enough to inline).
- Whether to ship a second admin-1 (states/provinces) dataset later.

---

## Milestone 2 — Stats & time-series helpers (target: 2.11.0)

**Why second.** Almost every analytics notebook reaches for these the
moment it has data. Removing the LINQ ceremony is the highest leverage
*per LOC* in the whole roadmap, with zero UI risk and trivial test
surface.

**Scope:**
1. **`Stats.*` global** — `Mean`, `Median`, `StdDev`, `Variance`,
   `Quantile(p)`, `Min`, `Max`, `Sum`, `Range`, `Histogram(bins)`,
   `Correlation(xs, ys)`, `LinearFit(xs, ys)` returning `(slope, intercept, r²)`.
2. **`TimeSeries.*` global** — `Rolling(values, window, fn = Mean)`,
   `EMA(values, alpha)`, `FillGaps(timestamped, intervalMs)`,
   `Resample(timestamped, intervalMs, agg)`.

**Implementation outline:**
- [ ] `kernel/StatsHelper.cs`, `kernel/TimeSeriesHelper.cs`
- [ ] Wire into `ScriptGlobals` as `Stats` and `TimeSeries`
- [ ] xUnit suites covering edge cases (empty, single, NaN-handling,
      odd vs even median, ties in correlation)
- [ ] Docs: new "Stats & Time-Series" section with copy-paste recipes
      (rolling window over CSV, histogram + Display.Graph, correlation
      matrix as a Display.Table)
- [ ] Bump 2.11.0; auto-push

---

## Milestone 3 — Sankey & TreeMap output (target: 2.12.0)

**Why now.** Sankey ↔ flow/cost analysis, TreeMap ↔ hierarchical sales /
storage / dependency size. Today users have no idiomatic way to express
either. Both libraries are small enough to bundle.

**Scope:**
1. **`Display.Sankey({ nodes, links })`** — d3-sankey under the hood.
2. **`Display.TreeMap({ name, value, children })`** — d3-hierarchy.

**Implementation outline:**
- [ ] `npm i d3-sankey d3-hierarchy d3-shape`
- [ ] `src/components/output/SankeyOutput.jsx`,
      `src/components/output/TreeMapOutput.jsx`
- [ ] Wire `format: "sankey"` and `format: "treemap"` in `OutputBlock` +
      `FormatContent`
- [ ] Kernel-side helpers in `Display.cs` that emit the spec
- [ ] Renderer tests + kernel test for spec emission
- [ ] Docs section "Flow & Hierarchy Charts" + an Infographic-template
      cell showing both
- [ ] Bump 2.12.0; auto-push

---

## Milestone 4 — Calendar heatmap & Network graph (target: 2.13.0)

**Why grouped.** Both are visualisations that don't fit Chart.js, both
take ~250 LOC, and shipping them together amortises the docs/test
overhead.

**Scope:**
1. **`Display.CalendarHeat(dailyValues)`** — GitHub-style day grid;
   useful for activity, error counts, cron run history.
2. **`Display.Network({ nodes, edges, layout? })`** — cytoscape.js;
   useful for dep graphs, social/citation networks, orchestration
   visualisation. Replaces the hand-rolled SVG in `DependencyPanel`
   long-term.

**Implementation outline:**
- [ ] `npm i cal-heatmap cytoscape`
- [ ] `CalendarHeatOutput.jsx`, `NetworkOutput.jsx`
- [ ] Wire dispatch
- [ ] Tests + docs
- [ ] Bump 2.13.0; auto-push

---

## Milestone 5 — Notebook parameters (target: 2.14.0)

**Why mid-roadmap.** Real architectural addition (touches notebook
schema), but unlocks "notebook as parameterised app". After this, a
notebook can be a tool other people use, not just code you run yourself.

**Scope:**
- New cell type or a header block recognised by the renderer:
  `#param double Threshold = 0.5;` / `#param string Region = "EU";`
- Parameter values rendered as a small form at the top of the notebook
  (slider / dropdown / text), reusing existing `Form` widgets.
- Values injected as locals into every code cell at run time.
- Persisted in the `.cnb` JSON next to `cells`, and editable through
  the CLI (`--param Threshold=0.7`) for headless runs.

**Implementation outline:**
- [ ] `.cnb` schema bump — new `params: [{ name, type, default, ui }]`
      array; CLAUDE.md notes "changed file format" → major if old
      notebooks won't open. Keep backwards-compatible (missing array =
      no params), so this is still minor.
- [ ] Renderer: top-of-notebook `<NotebookParams>` form
- [ ] Kernel: inject params into the script globals (`Params["Threshold"]`)
- [ ] CLI flag in `headless.js`
- [ ] Tests: param round-trip in `notebook-io.test`, override via CLI
- [ ] Docs: new "Parameterised Notebooks" section with an end-to-end
      example
- [ ] Bump 2.14.0; auto-push

---

## Milestone 6 — Output snapshots / golden tests (target: 2.15.0)

**Why.** Long analysis notebooks silently regress. Providing a built-in
snapshot mechanism (similar to Jest snapshots) catches it.

**Scope:**
- Cell annotation `[Snapshot("name")]` / `// snapshot` comment marks
  the next output for capture.
- First run saves the output (text/JSON/image hash) under
  `<notebook-dir>/.snapshots/<cell-id>.snap`.
- Subsequent runs compare; the renderer shows a green ✓ / red ✗ badge
  on the cell with a "diff" affordance.
- Notebook-level "Run all & verify snapshots" command that returns a
  pass/fail count (usable in CI via `headless.js`).

**Implementation outline:**
- [ ] Snapshot capture in `kernel-manager.js` after a cell completes
- [ ] Cell badge component + diff dialog
- [ ] `headless.js --check-snapshots` exit code
- [ ] Reuse existing export plumbing for hashing image outputs
- [ ] Bump 2.15.0; auto-push

---

## Milestone 7 — Profiling panel (target: 2.16.0)

**Why.** `durationMs` is already collected per cell. Surfacing it as a
visualisation is mostly UI work, not new data plumbing.

**Scope:**
- New "Profile" panel listing cells by duration, with sparkline of
  recent runs and a flame-bar timeline for the most recent "Run all".
- Click a row → jump to the cell.
- Optional: per-cell memory delta (sample heap before/after).

**Implementation outline:**
- [ ] `src/components/panels/ProfilePanel.jsx` + dock entry
- [ ] Subscribe to `complete` messages from `kernel-manager.js`
- [ ] Reuse Chart.js for the timeline
- [ ] Bump 2.16.0; auto-push

---

## Milestone 8 — Notebook → PDF report (target: 2.17.0)

**Why last.** Highest value per "real user" but the most polish-sensitive
(layout, page breaks, image fidelity). Worth doing after maps, snapshots,
and params land so the rendered output is complete.

**Scope:**
- Menu item "File → Export as PDF…" using `webContents.printToPDF`
  against a `dashboard-mode`-style stripped layout.
- Print stylesheet handles cell page breaks, hides toolbars/run buttons,
  uses light theme for tiles + chart backgrounds.

**Implementation outline:**
- [ ] `print.css` (loaded via `<link rel="stylesheet" media="print">`)
- [ ] Menu wire-up in `src/main/menu.js`, IPC channel
      `export-notebook-pdf`
- [ ] Force MapOutput to `light` theme during print (better B&W
      fidelity)
- [ ] Bump 2.17.0; auto-push

---

## Deferred / not on the immediate path

These survived the brainstorm but didn't make the cut for the next
several minor releases. Listed here so we can revisit later:

- **HTTP request log panel** — useful but lower leverage than profiling.
- **Multi-language kernel** (Python / JS) — large architectural change;
  better as its own multi-month track.
- **Notebook-as-app publishing** — depends on Milestone 5 (params)
  landing first; then becomes natural.
- **Mermaid / KaTeX already covered** in Markdown — no work needed.

---

## Cross-cutting follow-ups

These are not their own milestones but should be picked up opportunistically:

- Centralise `escHtml` usage; audit other components for local copies.
- Audit toolbar button styles — `.orch-toolbar-btn` vs `.output-map-btn`
  could be unified into a shared `.app-toolbar-btn` once a third caller
  appears.
- Move heat-layer defaults in `MapOutput.jsx` to named constants if a
  second visualisation lands that needs similar tuning.
