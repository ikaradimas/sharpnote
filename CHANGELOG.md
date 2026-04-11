# Changelog

All notable changes to SharpNote are documented here. Complexity is rated 1–3 gears (⚙).

## [1.83.0] — 2026-04-11 ⚙⚙
- **Changelog tab** — in-app changelog panel (Help → Changelog) with search, sidebar index, complexity gears, and highlighted major releases
- CHANGELOG.md file maintained alongside changelog.js

## [1.82.2] — 2026-04-11 ⚙
- Raytracer performance: bounce depth 5→3, new `canvas.RenderRows()` API, flush every 50 rows
- BmpEncoder uses Span for faster row processing

## [1.82.1] — 2026-04-11 ⚙⚙
- Template enhancements: column layouts, stat cards, and sidebar notes across Getting Started, Data & Charts, Display & Rich Output, Scripting & Utilities, Databases, and Raytracer templates

## [1.82.0] — 2026-04-11 ⚙⚙⚙
- `Mock.StartAsync/StopAsync/StopAllAsync/ListAsync` — control mock servers from C# code
- `Docker.StopAndRemove()`, `Docker.StopAllTracked()` convenience methods
- Kernel ↔ main process request-response protocol for mock server bridge
- Service Mesh template fully automated — zero manual intervention

## [1.81.0] — 2026-04-11 ⚙⚙⚙
- **Cell column layout** — `columns: 2/3/4` property for side-by-side rendering
- `Display.StatCard()`, `Display.ProgressBar()`, `Display.Marquee()` infographic helpers
- Infographic Dashboard template showcasing all new features

## [1.80.2] — 2026-04-11 ⚙⚙
- Service Mesh template: Docker + mock APIs simulating a microservice topology

## [1.80.1] — 2026-04-11 ⚙
- Docker container count and mock server count in status bar (blue/teal badges)

## [1.80.0] — 2026-04-11 ⚙⚙
- Multiple concurrent mock servers keyed by API ID on random ports (9001–9999)
- Running Mocks list in API Editor with per-server stop controls

## [1.79.1] — 2026-04-11 ⚙⚙
- Docker container logs popup (ScrollText button, modal with refresh)

## [1.79.0] — 2026-04-11 ⚙⚙
- File → Export as Docker Compose… generates docker-compose.yml from Docker cells

## [1.78.0] — 2026-04-11 ⚙⚙⚙
- **Docker cell type** — visual container management with form fields
- Run on startup/shutdown lifecycle hooks, presentation mode dashboard
- Kernel DockerHandler with execute/stop/status/cleanup, tracked containers

## [1.77.2] — 2026-04-11 ⚙
- Settings toggles to show/hide status bar fish and breakout minigame

## [1.77.0] — 2026-04-11 ⚙⚙
- Breakout minigame in empty notebook view (canvas-based, 4×8 bricks)

## [1.76.4] — 2026-04-11 ⚙
- Animated teal fish in status bar with bob, wiggle, tail flap, and drift

## [1.76.3] — 2026-04-11 ⚙
- Opaque sticky cell headers, orange active accent, bigger font, wider cell names

## [1.76.2] — 2026-04-11 ⚙
- Fix flaky test timeouts from leaked async useEffect microtasks

## [1.76.1] — 2026-04-11 ⚙
- DB POCO types resolve unqualified (inject using directive for generated namespace)

## [1.76.0] — 2026-04-11 ⚙⚙
- Canvas shape primitives: DrawLine, DrawRect, FillRect, DrawCircle, FillCircle
- ParallelRender for multi-core pixel rendering

## [1.75.0] — 2026-04-11 ⚙⚙⚙
- Display.ImageBytes, Display.Canvas, Display.NewImage — pixel rendering API
- BmpEncoder: minimal BMP encoding without System.Drawing

## [1.74.0] — 2026-04-11 ⚙⚙
- Raytracer notebook template (Vec3, Ray, Sphere, Scene, Trace, live preview)

## [1.73.0] — 2026-04-11 ⚙⚙
- Inline error diagnostics: wavy underlines + hover tooltips instead of output errors
- Filterable error badge in output (hidden by default)

## [1.72.0] — 2026-04-11 ⚙⚙
- Rainbow bracket colorization (7-color palette) and bracket matching
- Auto-close brackets, indent on closing bracket, 4-space tabs

## [1.71.0] — 2026-04-11 ⚙⚙⚙
- Per-cell presentation mode with auto-refresh intervals
- Double-shift command palette with tabbed Search/Commands/Tools
- Full-text search across cell content

## [1.70.0] — 2026-04-11 ⚙⚙
- Cell presentation mode toggle, auto-execute presenting cells on kernel ready

## [1.69.0] — 2026-04-11 ⚙⚙
- Format and check code on save (Roslyn Formatter, settings toggle)
- Cross-cell type resolution via workspace preamble

## [1.68.0] — 2026-04-11 ⚙
- PostgreSQL json/jsonb support, unique DbContext namespace suffix

## [1.67.0] — 2026-04-11 ⚙⚙⚙
- Debugger: breakpoints, pause/resume/step, variable inspection
- DebugCheckInjector Roslyn rewriter, ManualResetEventSlim blocking

## [1.66.0] — 2026-04-11 ⚙⚙
- Custom JavaScript handlers for mock server endpoints

## [1.65.0] — 2026-04-11 ⚙⚙
- Lucide icons throughout UI, stronger visual cues, Google Docs export

## [1.64.0] — 2026-04-11 ⚙⚙⚙
- Display.Form() — interactive forms with submit-to-cell execution

## [1.63.0] — 2026-04-11 ⚙⚙⚙
- Git integration: status, staging, commit, branch switching, visual diff

## [1.62.0] — 2026-04-11 ⚙⚙⚙
- API Editor with OpenAPI export and one-click mock server

## [1.61.0] — 2026-04-11 ⚙⚙
- Export notebook as standalone .NET executable

## [1.60.0] — 2026-04-11 ⚙⚙
- Decision cells with switch mode for multi-path branching

## [1.59.0] — 2026-04-11 ⚙⚙⚙
- Cell orchestration: naming, colors, decision cells, pipelines

## [1.58.0] — 2026-04-11 ⚙⚙
- Scheduled notebook execution, collapsible data tables

## [1.57.0] — 2026-04-11 ⚙⚙
- Cell dependency graph and notebook versioning

## [1.55.0] — 2026-04-11 ⚙⚙
- CLI headless execution with config overrides and file output

## [1.54.0] — 2026-04-11 ⚙⚙
- Health check cells with boolean assertions and pass/fail badges

## [1.53.0] — 2026-04-11 ⚙⚙
- Docker global: Run/Stop/Remove/Exec/IsRunning/List from code cells

## [1.52.0] — 2026-04-11 ⚙⚙
- Dashboard mode: presentation view showing only outputs

## [1.50.0] — 2026-04-11 ⚙⚙
- Shell cell type with live-streaming stdout

## [1.49.0] — 2026-04-11 ⚙⚙
- HTTP cell type with .http syntax and variable substitution

## [1.48.0] — 2026-04-11 ⚙
- Parameterized SQL from Config panel values

## [1.47.0] — 2026-04-11 ⚙
- Test Connection button, schema search/filter

## [1.46.0] — 2026-04-11 ⚙
- Tabbed SQL results, SQL autocomplete from schema

## [1.44.0] — 2026-04-11 ⚙
- Data table export: Copy, CSV, TSV buttons

## [1.43.0] — 2026-04-11 ⚙
- Mixed chart types in Graph panel, PlotAxis/ChartType enums

## [1.42.0] — 2026-04-11 ⚙⚙
- UI polish: icons, status bar, theme preview, shortcuts overlay

## [1.41.0] — 2026-04-11 ⚙⚙
- Command palette with categorized actions and icons
