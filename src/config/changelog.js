// ── Changelog data ───────────────────────────────────────────────────────────
// Each entry: { version, date, title, gears (1-3), items[] }
// gears: 1 = minor fix/tweak, 2 = notable feature, 3 = major feature/architecture

export const CHANGELOG = [
  { version: '1.82.2', date: '2026-04-11', title: 'Raytracer performance optimization', gears: 1, items: [
    'Reduced bounce depth from 5 to 3 for ~40% fewer ray intersections',
    'New canvas.RenderRows() API with automatic flush interval',
    'BmpEncoder uses Span<byte> for faster row processing',
    'Flush frequency reduced from every 25 to every 50 rows',
  ]},
  { version: '1.82.1', date: '2026-04-11', title: 'Template enhancements with new layout features', gears: 2, items: [
    'Getting Started: 2-column StatCard header',
    'Data & Charts: 3-column charts, StatCard summary row',
    'Display & Rich Output: new Infographic Helpers section',
    'Scripting & Utilities: Mock API demo with sidebar notes',
    'Databases: 2-column CRUD with EF Core reference sidebar',
    'Raytracer: 4-column StatCard header',
  ]},
  { version: '1.82.0', date: '2026-04-11', title: 'Mock & Docker scripting APIs', gears: 3, items: [
    'Mock.StartAsync(apiDef, port?) — start mock servers from C# code',
    'Mock.StopAsync(id), Mock.StopAllAsync(), Mock.ListAsync()',
    'Docker.StopAndRemove(id), Docker.StopAllTracked()',
    'Request-response protocol: kernel ↔ main process via stdout/stdin',
    'Service Mesh template fully automated — zero manual intervention',
  ]},
  { version: '1.81.0', date: '2026-04-11', title: 'Cell column layout & infographic helpers', gears: 3, items: [
    'Cell columns property (2/3/4) for side-by-side layout',
    'Display.StatCard(label, value, color?, icon?)',
    'Display.ProgressBar(percent, label?, color?)',
    'Display.Marquee(text, speed?, color?, background?)',
    'New Infographic Dashboard template showcasing all features',
    'Extracted renderCell() in NotebookView for reuse',
  ]},
  { version: '1.80.2', date: '2026-04-11', title: 'Service Mesh template', gears: 2, items: [
    'New template: Docker containers + mock APIs simulating a microservice mesh',
    'Nginx gateway, Redis cache, Postgres DB as Docker cells',
    'Health checks, cross-service communication, traffic dashboard',
  ]},
  { version: '1.80.1', date: '2026-04-11', title: 'Docker & mock counts in status bar', gears: 1, items: [
    'Blue Docker container icon + count in status bar',
    'Teal Server icon + mock server count (polled every 5s)',
  ]},
  { version: '1.80.0', date: '2026-04-11', title: 'Multiple concurrent mock servers', gears: 2, items: [
    'Mock servers keyed by API ID — run multiple simultaneously',
    'Random port assignment in 9001–9999 range',
    'Running Mocks list in API Editor with per-server stop controls',
    'New IPC: mock-server-list, mock-server-stop-all',
    'All mocks cleaned up on app shutdown',
  ]},
  { version: '1.79.1', date: '2026-04-11', title: 'Docker container logs popup', gears: 2, items: [
    'ScrollText icon button on Docker cells (edit + presentation modes)',
    'Modal popup with last 200 log lines via docker logs',
    'Refresh button and Escape-to-close',
  ]},
  { version: '1.79.0', date: '2026-04-11', title: 'Export as Docker Compose', gears: 2, items: [
    'File → Export as Docker Compose… menu item',
    'Generates docker-compose.yml from Docker cells',
    'Maps image, ports, env, volumes, command, restart policy',
  ]},
  { version: '1.78.0', date: '2026-04-11', title: 'Docker cell type', gears: 3, items: [
    'New Docker cell with visual form-based container management',
    'Config fields: image, name, ports, env, volume, command',
    'Run on startup / shutdown lifecycle hooks',
    'Presentation mode dashboard with status, ports, controls',
    'All containers tracked and cleaned up on kernel exit',
    'Kernel DockerHandler: execute, stop, status messages',
  ]},
  { version: '1.77.2', date: '2026-04-11', title: 'Fish & minigame settings', gears: 1, items: [
    'Settings toggles to show/hide status bar fish and breakout minigame',
  ]},
  { version: '1.77.0', date: '2026-04-11', title: 'Breakout minigame', gears: 2, items: [
    'Canvas-based breakout game in empty notebook view',
    '4×8 colored bricks, mouse paddle, collision physics',
    'Score tracking, game over/win overlays',
  ]},
  { version: '1.76.4', date: '2026-04-11', title: 'Status bar fish', gears: 1, items: [
    'Animated teal fish in status bar with bob, wiggle, and tail flap',
    'Back-and-forth drift animation',
  ]},
  { version: '1.76.3', date: '2026-04-11', title: 'Cell header visual improvements', gears: 1, items: [
    'Opaque sticky headers (pre-mixed colors instead of rgba)',
    'Orange accent for active cell (focus-within)',
    'Font 15% bigger, cell names 30% wider',
  ]},
  { version: '1.76.2', date: '2026-04-11', title: 'Flaky test fix', gears: 1, items: [
    'Global afterEach flush for React async useEffect microtasks',
    'Eliminates intermittent 5s timeout in SettingsDialog/ApiPanel tests',
  ]},
  { version: '1.76.1', date: '2026-04-11', title: 'DB POCO types resolve unqualified', gears: 1, items: [
    'Inject using directive for generated DB namespace',
    'Types like Contacts, Users accessible without DynDb_ prefix',
  ]},
  { version: '1.76.0', date: '2026-04-11', title: 'Canvas shape primitives & ParallelRender', gears: 2, items: [
    'DrawLine, DrawRect, FillRect, DrawCircle, FillCircle on CanvasHandle',
    'ParallelRender((x, y) => (r, g, b)) for multi-core pixel rendering',
    'Raytracer template updated with parallel render cell',
  ]},
  { version: '1.75.0', date: '2026-04-11', title: 'Pixel rendering API', gears: 3, items: [
    'Display.ImageBytes(rgb, w, h) — one-shot raw pixel render',
    'Display.Canvas(w, h) — pixel buffer with live Flush()',
    'Display.NewImage(src) — live-updating image handle',
    'BmpEncoder: minimal BMP encoding without System.Drawing',
  ]},
  { version: '1.74.0', date: '2026-04-11', title: 'Raytracer template', gears: 2, items: [
    'Build a raytracer step-by-step in the notebook',
    'Vec3, Ray, Sphere, Scene, Trace, live progressive render',
  ]},
  { version: '1.73.0', date: '2026-04-11', title: 'Inline error diagnostics', gears: 2, items: [
    'Wavy underlines for compilation errors instead of output display',
    'Hover tooltips with error message and code',
    'Filterable error badge in output (hidden by default)',
  ]},
  { version: '1.72.0', date: '2026-04-11', title: 'Rainbow brackets & bracket matching', gears: 2, items: [
    'ViewPlugin with 7-color rotating palette for nested brackets',
    'Bracket matching highlight (gold match, red mismatch)',
    'Auto-close brackets, indent on closing bracket, 4-space tabs',
  ]},
  { version: '1.71.0', date: '2026-04-11', title: 'Presentation mode & command palette', gears: 3, items: [
    'Per-cell presentation mode with auto-refresh intervals',
    'Double-shift to open command palette',
    'Tabbed command palette: Search, Commands, Tools',
    'Full-text search across cell content with chapter context',
  ]},
  { version: '1.70.0', date: '2026-04-11', title: 'Cell presentation mode', gears: 2, items: [
    'Toggle cells to presentation view (hide code, show output)',
    'Auto-execute presenting cells on kernel ready',
  ]},
  { version: '1.69.0', date: '2026-04-11', title: 'Format on save', gears: 2, items: [
    'Setting to format and check C# code cells on save',
    'Roslyn Formatter with #r directive handling',
    'Cross-cell type resolution via workspace preamble',
  ]},
  { version: '1.68.0', date: '2026-04-11', title: 'JSONB support & DB improvements', gears: 1, items: [
    'PostgreSQL json/jsonb mapped to JsonDocument',
    'Primary key json columns stay as string (IComparable)',
    'Unique namespace suffix for DbContext recompilation',
  ]},
  { version: '1.67.0', date: '2026-04-11', title: 'Debugger', gears: 3, items: [
    'Breakpoint gutter with click-to-toggle',
    'Pause/resume/step debugging via DebugContext + ManualResetEventSlim',
    'DebugCheckInjector: Roslyn rewriter inserting __dbg__.Check(line)',
    'Variable inspection at breakpoints',
  ]},
  { version: '1.66.0', date: '2026-04-11', title: 'Custom mock handlers', gears: 2, items: [
    'User-defined JavaScript handler functions for mock endpoints',
    'Handler receives req object with params, query, body, headers',
  ]},
  { version: '1.65.0', date: '2026-04-11', title: 'UI polish & lucide icons', gears: 2, items: [
    'All Unicode symbols replaced with lucide-react icons',
    'Stronger visual cues setting, log filter, Google Docs export',
    'API Editor semantic coloring',
  ]},
  { version: '1.64.0', date: '2026-04-11', title: 'Interactive forms', gears: 3, items: [
    'Display.Form() with auto-inferred field types',
    'FormField descriptors for custom layouts',
    'Submit-to-cell execution via targetCell',
    'Forms template with search, order entry, and survey examples',
  ]},
  { version: '1.63.0', date: '2026-04-11', title: 'Git integration', gears: 3, items: [
    'Git panel with status, staging, commit, branch switching',
    'Commit history with visual diff viewer (unified + split)',
    'Branch creation, diff-vs-HEAD toggle',
  ]},
  { version: '1.62.0', date: '2026-04-11', title: 'API Editor & mock server', gears: 3, items: [
    'Visual API editor: models, controllers, endpoints',
    'OpenAPI 3.x export (JSON/YAML)',
    'One-click mock server from API definition',
    'Built-in Bookstore example API',
  ]},
  { version: '1.61.0', date: '2026-04-11', title: 'Export as executable', gears: 2, items: [
    'Export notebook code cells as standalone .NET console app',
    'Includes NuGet references and config values',
  ]},
  { version: '1.60.0', date: '2026-04-11', title: 'Decision cells with switch mode', gears: 2, items: [
    'Switch mode for decision cells with multi-path branching',
    'Cell orchestration with named cells, colors, and pipelines',
  ]},
  { version: '1.59.0', date: '2026-04-11', title: 'Cell orchestration', gears: 3, items: [
    'Cell naming and color coding',
    'Decision cells (bool and switch modes)',
    'Pipeline execution (sequential, parallel, race)',
    'Dependencies panel with cell graph',
  ]},
  { version: '1.58.0', date: '2026-04-11', title: 'Scheduled execution', gears: 2, items: [
    'Scheduled notebook execution with preset intervals',
    'Collapsible data tables (show first 5 rows)',
  ]},
  { version: '1.57.0', date: '2026-04-11', title: 'Cell dependencies & versioning', gears: 2, items: [
    'Cell dependency graph visualization',
    'Notebook versioning metadata',
  ]},
  { version: '1.55.0', date: '2026-04-11', title: 'CLI headless execution', gears: 2, items: [
    'Run notebooks from command line without GUI',
    'Config overrides via --config flag',
    'Output to file (text or JSON)',
  ]},
  { version: '1.54.0', date: '2026-04-11', title: 'Health check cells', gears: 2, items: [
    'Boolean assertion cells with pass/fail badges',
    'Configurable labels and threshold expressions',
  ]},
  { version: '1.53.0', date: '2026-04-11', title: 'Docker global', gears: 2, items: [
    'Docker.Run/Stop/Remove/Exec/IsRunning/List from code cells',
    'Requires Docker Desktop or Docker Engine',
  ]},
  { version: '1.52.0', date: '2026-04-11', title: 'Dashboard mode', gears: 2, items: [
    'Presentation view hiding code, showing only outputs',
    'Toggle from toolbar or Panels API',
  ]},
  { version: '1.50.0', date: '2026-04-11', title: 'Shell cell type', gears: 2, items: [
    'Execute shell commands with live-streaming stdout',
    'Cross-platform (sh on macOS/Linux, cmd on Windows)',
  ]},
  { version: '1.49.0', date: '2026-04-11', title: 'HTTP cell type', gears: 2, items: [
    '.http syntax with variable substitution from Config',
    'Headers, body, and {{variable}} placeholders',
  ]},
  { version: '1.48.0', date: '2026-04-11', title: 'Parameterized SQL', gears: 1, items: [
    'SQL cells bind @ParamName from Config panel values',
    'Safe parameterized queries — no string concatenation',
  ]},
  { version: '1.47.0', date: '2026-04-11', title: 'DB test connection', gears: 1, items: [
    'Test Connection button in DB connection dialog',
    'Schema search/filter for all database providers',
  ]},
  { version: '1.46.0', date: '2026-04-11', title: 'Tabbed SQL results', gears: 1, items: [
    'Tabbed view for multiple SQL result sets',
    'SQL cell autocomplete from attached database schema',
  ]},
  { version: '1.44.0', date: '2026-04-11', title: 'Data table export', gears: 1, items: [
    'Copy, CSV, and TSV export buttons on data tables',
  ]},
  { version: '1.43.0', date: '2026-04-11', title: 'Mixed chart types', gears: 1, items: [
    'Per-series chart type in Graph panel (line + bar mixing)',
    'PlotAxis and ChartType enums for Display.Plot()',
  ]},
  { version: '1.42.0', date: '2026-04-11', title: 'UI polish', gears: 2, items: [
    'Icons, status bar, theme preview, shortcuts overlay',
    'Command palette with categories and icons',
    'DataTable column resize, output chrome',
  ]},
  { version: '1.41.0', date: '2026-04-11', title: 'Command palette', gears: 2, items: [
    'Command palette with categorized actions and icons',
  ]},
];
