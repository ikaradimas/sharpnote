# Changelog

All notable changes to SharpNote, consolidated by minor version. Complexity: ⚙ fix, ⚙⚙ feature, ⚙⚙⚙ major.

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
