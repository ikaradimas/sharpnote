# Changelog

All notable changes to SharpNote, consolidated by minor version. Complexity: ⚙ fix, ⚙⚙ feature, ⚙⚙⚙ major.

## 2.20 ⚙
- Windows build no longer attempts to code-sign without a certificate — `build.win.sign` now points at `scripts/sign-noop.js`, a no-op signer that short-circuits the signtool pass and avoids the `winCodeSign-2.6.0.7z` download/extraction that fails on Windows without admin / Developer Mode (the archive contains macOS dylib symlinks Windows can't create). `signtoolOptions: null` was tried first and electron-builder treated it as "use defaults" rather than "skip" — the explicit no-op script is the version that actually works
- **Embedded file deletion** now syncs to the kernel — previously `Files.Contains/Exists/[name]` kept reporting deleted files as still present
- New `Files.Exists(name)` method on the kernel `Files` global (`Files.Contains` kept as alias) — matches `File.Exists` / `Directory.Exists` naming
- **Error UI clears on successful re-run** — the inline diagnostic squiggles and the toggled-on error pane no longer linger after a previously-erroring cell runs cleanly; `prepareCellRun` now clears `inlineDiagnostics[cellId]` and `CodeCell` resets its local `showErrors` toggle when `errorCount` drops to 0
- **Detached panel-tabs remember their notebook** — `panelTabs` is now `Map<panelId, notebookId>` instead of `Set<panelId>`; popped-out panels stay pinned to the notebook they came from when you switch tabs and pop back into the same notebook's dock zone
- Panel-tab labels show the bound notebook (e.g. `Logs · report.cnb`) so multiple popped-out panels for different files are distinguishable
- Closing a notebook also drops every panel-tab bound to it
- `effectiveOpenFlags` correction: a panel popped out for notebook A no longer hides the dock-attached version when notebook B is active
- Pop-back path no longer races on `setActiveId` — writes the open flag directly to the bound notebook via a centralised `PANEL_NB_FLAG` lookup

## 2.19 ⚙
- Slide deck toolbar repositioned to bottom-center (was top-right)
- Marp slides now fill the stage — sized the `<svg data-marpit-svg>` wrapper at `width: 100%` against the viewBox aspect ratio
- Slide visibility fixed: toggle the SVG wrapper instead of the inner `<section>` so hidden slides don't leave empty boxes
- Marp markdown cells excluded from the Table of Contents (slide titles are not document structure)
- Display & Rich Output template ships a working Marp sample deck plus a `Display.Markdown` deck-from-C# example

## 2.18 ⚙⚙⚙
- **Marp slide decks** in markdown cells via `@marp-team/marp-core` (lazy-loaded ~200 KB), triggered by `marp: true` YAML frontmatter; paginated viewer with prev / next / fullscreen and arrow-key navigation
- **M8 — PDF export** via Electron `printToPDF`; `@media print` stylesheet hides chrome and neutralises the dark theme
- **M7 — Profile panel** with sortable per-cell timing (last / avg / total / runs) and a 20-run sparkline
- **M6 — Output snapshots** (`<notebook-dir>/.snapshots/<cell-id>.snap.json`); CLI `--check-snapshots` exits 3 on drift
- **M5 — Parameterised notebooks**: typed `params` array in `.cnb` injected as locals; CLI `--param Name=Value`
- **M4 — `Display.CalendarHeat`** (GitHub-style daily grid, pure SVG) and **`Display.Network`** (cytoscape, lazy)
- **M3 — `Display.Sankey`** (d3-sankey) and **`Display.TreeMap`** (d3-hierarchy)
- **M2 — `Stats`** (Mean, Median, Variance, StdDev, Quantile, Histogram, Correlation, LinearFit) and **`TimeSeries`** (Rolling, EMA, FillGaps, Resample) pure helpers
- **M1 — Geo expansions**: on-disk geocoding cache, marker clustering (`cluster: true`), PNG export, `Geo.Distance`/`Geo.Cluster` helpers; map toolbar (fit / reset / day-night / fullscreen); Carto basemap tiles
- Canvas pipeline fixes: PNG IHDR encoding, CSP `img-src 'self' data: https:`, interactive `EnableMouse`

## 1.89 ⚙⚙⚙
- Notebook v2 format: embedded files and retained results
- Files API: Files["name"].ContentAsText, .Embed(), .SetVariable() from C#
- Pin button on cell outputs to persist results across sessions
- Embedded files UI with add/delete/variables management

## 1.88 ⚙⚙
- Copy/paste cells; output font size scales with setting
- MAINTAINER-INSTRUCTIONS.md architecture guide

## 1.87 ⚙⚙
- Ambient day-night skyline cycle, circuit board animation, DB timeout fields

## 1.86 ⚙⚙
- Moon/sun arcs, ghost symbols, fish waves and bubbles

## 1.85 ⚙⚙
- Idle skyline: futuristic city builds from right to left when idle 20s
- Three layered skylines stack progressively; sun rises after completion
- 3s fade-out on return; toggle in Settings → Fun

## 1.84 ⚙⚙
- Ghost companion with mood-reactive colors, Pac-Man chase with bead trail
- Breakout game: hover-to-play with pause; fish swarm cycles; taller status bar
- All toggleable in Settings → Fun

## 1.83 ⚙⚙
- In-app changelog panel (Help → Changelog) with search, sidebar index, and complexity gears
- Major releases highlighted with gold accent; CHANGELOG.md maintained alongside

## 1.82 ⚙⚙⚙
- Mock.StartAsync / StopAsync / StopAllAsync / ListAsync — control mock servers from C#
- Docker.StopAndRemove and Docker.StopAllTracked convenience methods
- Kernel ↔ main process request-response protocol for mock bridge
- All templates enriched with column layouts, stat cards, and sidebar notes
- Raytracer optimized: depth 5→3, RenderRows API, fewer flush roundtrips

## 1.81 ⚙⚙⚙
- Cell columns property (2/3/4) for side-by-side layout via CSS grid
- Display.StatCard, Display.ProgressBar, Display.Marquee helpers
- Infographic Dashboard template

## 1.80 ⚙⚙
- Multiple concurrent mock servers on random ports (9001–9999)
- Running Mocks list in API Editor with per-server stop controls
- Docker and mock count badges in status bar
- Service Mesh template: Docker + mock APIs as a microservice topology

## 1.79 ⚙⚙
- File → Export as Docker Compose… generates YAML from Docker cells
- Container logs popup with refresh

## 1.78 ⚙⚙⚙
- Docker cell type with visual form-based container management
- Image, ports, env, volume, command fields; lifecycle hooks; presentation dashboard
- Containers tracked and cleaned up on kernel exit

## 1.77 ⚙⚙
- Animated status bar fish with swim and drift animations
- Breakout minigame in empty notebook view; settings toggles

## 1.76 ⚙⚙
- Canvas shape primitives: DrawLine, DrawRect, FillRect, DrawCircle, FillCircle
- ParallelRender for multi-core pixel rendering
- Opaque sticky headers, orange active accent, bigger fonts, wider cell names
- DB POCO types resolve unqualified

## 1.75 ⚙⚙⚙
- Display.ImageBytes, Display.Canvas, Display.NewImage — pixel rendering API
- BmpEncoder: minimal BMP encoding without System.Drawing

## 1.74 ⚙⚙
- Raytracer template: Vec3, Ray, Sphere, Scene, Trace, live render

## 1.73 ⚙⚙
- Inline error diagnostics with wavy underlines and hover tooltips
- Filterable error badge in output

## 1.72 ⚙⚙
- Rainbow bracket colorization and bracket matching
- Auto-close brackets, 4-space tabs

## 1.71 ⚙⚙⚙
- Per-cell presentation mode with auto-refresh
- Double-shift command palette with Search/Commands/Tools tabs

## 1.70 ⚙⚙
- Cell presentation view and auto-execute on kernel ready

## 1.69 ⚙⚙
- Format on save via Roslyn Formatter; cross-cell type resolution

## 1.68 ⚙
- PostgreSQL json/jsonb support; unique DbContext namespace

## 1.67 ⚙⚙⚙
- Debugger: breakpoints, pause/resume/step, variable inspection

## 1.66 ⚙⚙
- Custom JavaScript handlers for mock endpoints

## 1.65 ⚙⚙
- Lucide icons throughout UI; visual cues setting; Google Docs export

## 1.64 ⚙⚙⚙
- Display.Form() with auto-inferred fields and submit-to-cell execution

## 1.63 ⚙⚙⚙
- Git panel: status, staging, commit, branches, visual diff

## 1.62 ⚙⚙⚙
- API Editor with OpenAPI export and one-click mock server

## 1.61 ⚙⚙
- Export notebook as standalone .NET executable

## 1.60 ⚙⚙
- Decision cells with switch mode for multi-path branching

## 1.59 ⚙⚙⚙
- Cell orchestration: naming, colors, decision cells, pipelines

## 1.58 ⚙⚙
- Scheduled notebook execution; collapsible data tables

## 1.57 ⚙⚙
- Cell dependency graph and notebook versioning

## 1.55 ⚙⚙
- CLI headless execution with config overrides and file output

## 1.54 ⚙⚙
- Health check cells with pass/fail badges

## 1.53 ⚙⚙
- Docker global: Run/Stop/Remove/Exec/IsRunning/List

## 1.52 ⚙⚙
- Dashboard mode: outputs-only presentation view

## 1.50 ⚙⚙
- Shell cell type with live-streaming stdout

## 1.49 ⚙⚙
- HTTP cell type with .http syntax and variable substitution

## 1.48 ⚙
- Parameterized SQL from Config panel values

## 1.47 ⚙
- Test Connection button and schema search/filter

## 1.46 ⚙
- Tabbed SQL results and autocomplete from schema

## 1.44 ⚙
- Data table Copy, CSV, TSV export

## 1.43 ⚙
- Mixed chart types in Graph panel

## 1.42 ⚙⚙
- UI polish, icons, status bar, command palette
