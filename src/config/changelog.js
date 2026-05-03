// ── Changelog data ───────────────────────────────────────────────────────────
// Each entry: { version, date, title, gears (1-3), items[] }
// Consolidated by minor version. Gears = highest complexity in the release.
// gears: 1 = minor fix/tweak, 2 = notable feature, 3 = major feature/architecture

export const CHANGELOG = [
  { version: '2.20.4', date: '2026-05-03', title: 'Windows build: disable signing AND exe editing', gears: 1, items: [
    'build.win.signAndEditExecutable: false — turns off both the signtool pass and the rcedit pass that runs after it',
    'Root cause of the earlier 2.20.x attempts: a no-op sign hook only short-circuits signing; electron-builder still downloads winCodeSign-2.6.0.7z upfront for rcedit (which it uses to embed the icon and version metadata into the .exe), and that download\'s macOS dylib symlinks fail to extract on Windows without admin / Developer Mode',
    'Trade-off: the SharpNote.exe file itself loses its embedded icon and version metadata. The NSIS installer icon and the Start Menu / Desktop shortcuts still use assets/icon.png, so end-user-visible UI is unaffected',
    'sign-noop.js script removed — no longer referenced',
  ]},
  { version: '2.20.3', date: '2026-05-03', title: 'Windows build: no-op signer (correct nesting, but insufficient)', gears: 1, items: [
    'Tried build.win.signtoolOptions.sign — schema validates, no-op hook is called, but the winCodeSign download still runs because rcedit needs it; superseded by 2.20.4',
  ]},
  { version: '2.20.2', date: '2026-05-03', title: 'Windows build: no-op signer (wrong location, superseded)', gears: 1, items: [
    'Tried top-level build.win.sign — rejected by electron-builder 26.x as an unknown property; superseded by 2.20.3',
  ]},
  { version: '2.20.1', date: '2026-05-03', title: 'Windows build: skip code-signing without a certificate (initial attempt)', gears: 1, items: [
    'Tried build.win.signtoolOptions: null — did not actually skip the signtool pass; superseded by 2.20.2',
  ]},
  { version: '2.20.0', date: '2026-04-30', title: 'Bugfix sweep: embedded files, error UI, detached panel-tabs', gears: 1, items: [
    'Embedded file deletion now syncs to the kernel — previously Files.Contains/Exists/[name] kept reporting deleted files as still present',
    'New Files.Exists(name) method on the kernel Files global (Files.Contains kept as alias) — matches File.Exists / Directory.Exists naming',
    'Error UI clears on successful re-run — inline diagnostic squiggles and the error pane no longer linger after a previously-erroring cell runs cleanly',
    'Detached panel-tabs remember the notebook they were popped out of (panelTabs is now Map<panelId, notebookId>); popped-out panels stay pinned to the right notebook when you switch tabs',
    'Pop-back path returns the panel to its origin notebook, not the first available one',
    'Panel-tab labels show the bound notebook (e.g. "Logs · report.cnb") to disambiguate when multiple notebooks have detached panels',
    'Closing a notebook drops every panel-tab bound to it',
    'A panel popped out for notebook A no longer hides the dock-attached version when notebook B is active',
  ]},
  { version: '2.19.0', date: '2026-04-28', title: 'Marp slide deck polish', gears: 1, items: [
    'Slide deck toolbar repositioned to bottom-center (was top-right)',
    'Marp slides now fill the stage — sized the <svg data-marpit-svg> wrapper at width:100% against the viewBox aspect ratio',
    'Slide visibility fixed: toggle the SVG wrapper instead of the inner <section> so hidden slides do not leave empty boxes',
    'Marp markdown cells excluded from the Table of Contents (slide titles are not document structure)',
    'Display & Rich Output template ships with a working Marp sample deck plus a Display.Markdown deck-from-C# example',
  ]},
  { version: '2.18.0', date: '2026-04-27', title: 'Marp slide decks + 8-milestone expansion (M1–M8)', gears: 3, items: [
    'Marp slide decks in markdown cells via @marp-team/marp-core (lazy-loaded ~200 KB), triggered by marp: true YAML frontmatter; paginated viewer with prev / next / fullscreen and arrow-key navigation',
    'M8 — PDF export via Electron printToPDF; @media print stylesheet hides chrome and neutralises the dark theme',
    'M7 — Profile panel with sortable per-cell timing (last / avg / total / runs) and a 20-run sparkline',
    'M6 — Output snapshots (<notebook-dir>/.snapshots/<cell-id>.snap.json); CLI --check-snapshots exits 3 on drift',
    'M5 — Parameterised notebooks: typed params array in .cnb injected as locals; CLI --param Name=Value',
    'M4 — Display.CalendarHeat (GitHub-style daily grid, pure SVG) and Display.Network (cytoscape, lazy)',
    'M3 — Display.Sankey (d3-sankey) and Display.TreeMap (d3-hierarchy)',
    'M2 — Stats (Mean, Median, Variance, StdDev, Quantile, Histogram, Correlation, LinearFit) and TimeSeries (Rolling, EMA, FillGaps, Resample) pure helpers',
    'M1 — Geo expansions: on-disk geocoding cache, marker clustering (cluster: true), PNG export, Geo.Distance/Geo.Cluster helpers; map toolbar (fit / reset / day-night / fullscreen); Carto basemap tiles',
    'Canvas pipeline fixes: PNG IHDR encoding, CSP img-src self data: https:, interactive EnableMouse',
  ]},
  { version: '2.5.0', date: '2026-04-24', title: 'Floci Cell, Cloud Architecture Patterns, Docker Lifecycle', gears: 3, items: [
    'Floci cell type: visual form-based cell for running floci (local AWS emulator) containers with per-service toggles for 24 AWS services, region/storage configuration, init scripts, and lifecycle management',
    'SDK Snippet generator: one-click C# code generation with NuGet references and pre-configured AWS SDK clients for all enabled services, with Insert as Code Cell option',
    'Cloud Architecture Patterns template: 6 patterns (Event Fan-Out, CQRS, Saga, Circuit Breaker, Cache-Aside, API Gateway Aggregation) running locally via Floci, Redis, and Mock APIs',
    'Service Mesh template updated with Floci cell replacing Redis, plus AWS SDK integration section',
    'Docker/Floci Starting… and Stopping… intermediate states with pulsing amber badge',
    'Already-running container detection: kernel reuses existing containers instead of failing with name conflicts',
    'Run All now executes all cell types (SQL, HTTP, Shell, Docker, Floci, Check, Decision) — previously only ran code cells',
    'Run All button disabled with Running… label and pulse animation while executing',
    'Run From / Run To now dispatch all cell types consistently with Run All',
    'Shared Docker sub-components extracted (StatusBadge, StatsRow, LogsPopup, ExecSection) — used by both Docker and Floci cells',
    'Dispatch logic deduplicated: single dispatchCellRun exported from useKernelManager, consumed by orchestrator',
    'Fix: format-on-save no longer eats characters from cell start (Roslyn formatter scoped to user code span only)',
    'Fix: CodeMirror empty mark decoration crash when diagnostic spans to end of document',
  ]},
  { version: '2.3.0', date: '2026-04-21', title: 'Export as App, Kafka Enhancements, Notebook Backgrounds, Orchestration Redesign', gears: 3, items: [
    'Export as App (Beta): export any notebook as a standalone macOS/Windows application that opens directly in viewer mode with full fidelity — same renderer, kernel, and interactive experience',
    'Viewer mode: exported apps open in a locked-down mode — no file open/import, no tools menu, no panel toggles; only Run, Edit, View, and Help menus',
    'Embedded settings: exported apps bundle the exporter\'s theme, background, DB connections, API configs, shortcuts, and favorites — all encrypted with AES-256-GCM keyed to the notebook content',
    'Export passphrase protection: optional PBKDF2 (100K iterations, SHA-512) key derivation with AES-256-GCM encryption — viewer prompts for passphrase on launch with retry on failure',
    'Export credential stripping: optional removal of DB connection strings and API auth tokens — viewer prompts for missing credentials on launch with per-field inputs and skip option',
    'Notebook backgrounds: 8 decorative SVG patterns (Tribal, Cyber, FPS, Relaxing, Glitch, Topology, Waveform, Blueprint) that fade from left to center; configurable in Settings with opacity slider',
    'Kafka: pin messages to top of feed, compare two messages side-by-side with LCS diff highlighting, Ctrl+F search focus shortcut',
    'Orchestration panel redesign: depth-based layout replacing layers, icon + name + collapsible inbox/outbox per node, implicit Start/End nodes, design/execution mode toggle, port-based drag-to-connect wiring, Add Node button, Auto Layout, critical path always visible',
    'Database example revamp: Docker PostgreSQL container with SQL seed scripts, live queries replacing commented-out code, in-memory SQLite kept as alternative',
    'API Editor: controllers moved above models in the panel layout',
    'Variable peek: collection/list/array preview showing first 5 items with count, improved visual hierarchy with header band and distinct type/name/value styling',
    'npm audit: all vulnerabilities fixed — Electron 35→41, xmldom, dompurify, lodash, vite, happy-dom, brace-expansion patched',
  ]},
  { version: '2.2.0', date: '2026-04-17', title: '45 UI Improvements Across All Tools', gears: 3, items: [
    'Code Cells: diff view when stale, output pinning with comparison, inline variable peek on hover (collection preview), execution cost badge on folded cells, cell bookmarks',
    'SQL Cell: schema sidebar with table/column browser, query history with recall',
    'HTTP Cell: environment switcher for named request profiles, response timeline visualization',
    'Shell Cell: working directory indicator in header, streaming dot animation during output',
    'Docker Cell: resource meter (CPU/memory gauges), health check badge, quick shell via docker exec',
    'Decision/Check Cells: branch preview on hover showing downstream paths, decision history timeline',
    'Orchestration Panel: minimap overview, critical path highlighting, parallel execution groups, run animation',
    'Config Panel: prefix-based entry groups, import/export (.env and JSON formats)',
    'Variables Panel: watch expressions pinned to top, variable diff highlights (new/modified/removed), copy as C# literal',
    'Files Panel: drag-and-drop file embed into code cells, file preview tooltip on hover, git status badges per file',
    'Git Panel: blame view per file, stash support (save/pop/list), merge conflict resolver with accept-theirs/ours/both',
    'History Panel: snapshot diff between two selected versions, auto-snapshot before destructive operations',
    'Database Panel: visual query builder for SELECT queries, connection health pulse indicator',
    'API Editor: try-it endpoint button for live requests, model relationship diagram (ERD), field validation rules editor',
    'API Browser: request history with one-click replay',
    'Graph Panel: click-to-annotate data points, export chart as PNG or data as CSV',
    'Regex Panel: replace mode with live preview, named group labels in match list',
    'Kernel: HTTP cookie jar persistence, shell cwd tracking, docker stats/exec/health APIs, watch expression evaluation',
    'Bug Fixes: menu flicker prevention on rapid rebuild, hooks order fix in orchestration panel',
  ]},
  { version: '1.89', date: '2026-04-11', title: 'Notebook v2: embedded files & retained results', gears: 3, items: [
    'File format bumped to v2 (backward compatible with v1)',
    'Embedded files: store files inline in .cnb with variables; Files API in kernel',
    'Files["name"].ContentAsText, .OpenRead(), .SetVariable(), .Embed() from code',
    'Retainable results: pin cell outputs to persist across sessions with timestamp',
    'Embedded files UI section with add/delete/variables management',
  ]},
  { version: '1.88', date: '2026-04-11', title: 'Copy/paste cells & scaled output', gears: 2, items: [
    'Copy button on all cell types; paste in AddBar inserts clone below',
    'Output results scale with notebook font size setting',
    'MAINTAINER-INSTRUCTIONS.md with architecture guide',
  ]},
  { version: '1.87', date: '2026-04-11', title: 'Ambient skyline & circuit board', gears: 2, items: [
    'Idle skyline: ambient day-night cycle, layered depth, billboards, screens',
    'Circuit board animation replaces breakout minigame on empty notebooks',
    'Sun/moon at fixed horizon, higher contrast layers',
    'DB connection dialog: connection and command timeout fields',
  ]},
  { version: '1.86', date: '2026-04-11', title: 'Moon/sun arcs & ghost symbols', gears: 2, items: [
    'Moon arcs right-to-left, sun left-to-right over the skyline, cycling',
    'Ghost drops glowing symbols instead of Pac-Man chase',
    'Fish swarm: waves, bubbles, steeper size progression',
  ]},
  { version: '1.85', date: '2026-04-11', title: 'Idle skyline', gears: 2, items: [
    'Futuristic city skyline builds slowly from right to left when idle for 20s',
    'Three layered skylines in progressively lighter shades stack on top of each other',
    'Sun rises after all layers complete, warming the buildings with golden light',
    'Fades out over 3s when you return; toggle in Settings → Fun',
  ]},
  { version: '1.84', date: '2026-04-11', title: 'Ghost companion & game fixes', gears: 2, items: [
    'Friendly ghost that flickers near your cursor — cyan when active, orange when idle',
    'Chases Pac-Man with bead trail when deeply idle (20s); slower pursuit',
    'Breakout game: hover to play, pause on mouse leave, Play Again fixed',
    'Fish swarm: up to 3 extra fish spawn and despawn in cycles; taller status bar',
    'Toggle in Settings → Appearance → Fun (on by default)',
  ]},
  { version: '1.83', date: '2026-04-11', title: 'Changelog tab', gears: 2, items: [
    'In-app changelog panel (Help → Changelog) with search, sidebar index, and complexity gears',
    'Major releases (3 gears) highlighted with gold accent',
    'CHANGELOG.md maintained alongside in-app data',
  ]},
  { version: '1.82', date: '2026-04-11', title: 'Mock & Docker scripting APIs', gears: 3, items: [
    'Mock.StartAsync / StopAsync / StopAllAsync / ListAsync — control mock servers from C# code',
    'Docker.StopAndRemove and Docker.StopAllTracked convenience methods',
    'Kernel ↔ main process request-response protocol for mock server bridge',
    'All templates enriched with column layouts, stat cards, and sidebar notes',
    'Raytracer optimized: depth 5→3, RenderRows API, fewer flush roundtrips',
  ]},
  { version: '1.81', date: '2026-04-11', title: 'Cell column layout & infographic helpers', gears: 3, items: [
    'Cell columns property (2/3/4) for side-by-side layout via CSS grid',
    'Display.StatCard, Display.ProgressBar, Display.Marquee helpers',
    'Infographic Dashboard template showcasing all new layout features',
  ]},
  { version: '1.80', date: '2026-04-11', title: 'Multiple mock servers & Service Mesh', gears: 2, items: [
    'Run multiple mock servers simultaneously on random ports (9001–9999)',
    'Running Mocks list in API Editor with per-server stop controls',
    'Docker and mock server count badges in status bar',
    'Service Mesh template: Docker + mock APIs simulating a microservice topology',
  ]},
  { version: '1.79', date: '2026-04-11', title: 'Docker Compose export & container logs', gears: 2, items: [
    'File → Export as Docker Compose… generates YAML from Docker cells',
    'Container logs popup with refresh (ScrollText button on Docker cells)',
  ]},
  { version: '1.78', date: '2026-04-11', title: 'Docker cell type', gears: 3, items: [
    'New Docker cell with visual form-based container management',
    'Image, ports, env, volume, command configuration fields',
    'Run-on-startup/shutdown lifecycle hooks and presentation mode dashboard',
    'Containers tracked and cleaned up on kernel exit',
  ]},
  { version: '1.77', date: '2026-04-11', title: 'Fun: fish & minigame', gears: 2, items: [
    'Animated teal fish in status bar with swim and drift animations',
    'Breakout minigame in empty notebook view (4×8 bricks, mouse paddle)',
    'Settings toggles to show/hide both',
  ]},
  { version: '1.76', date: '2026-04-11', title: 'Canvas primitives & visual polish', gears: 2, items: [
    'Canvas shape drawing: DrawLine, DrawRect, FillRect, DrawCircle, FillCircle',
    'ParallelRender for multi-core pixel rendering',
    'Opaque sticky cell headers, orange active accent, bigger fonts',
    'DB POCO types resolve unqualified (no DynDb_ prefix needed)',
    'Flaky test fix via global React async flush',
  ]},
  { version: '1.75', date: '2026-04-11', title: 'Pixel rendering API', gears: 3, items: [
    'Display.ImageBytes — one-shot raw RGB pixel rendering',
    'Display.Canvas — pixel buffer with live Flush and progressive preview',
    'Display.NewImage — live-updating image handle',
    'BmpEncoder: minimal BMP encoding without System.Drawing',
  ]},
  { version: '1.74', date: '2026-04-11', title: 'Raytracer template', gears: 2, items: [
    'Step-by-step raytracer: Vec3, Ray, Sphere, Scene, Trace, live render',
  ]},
  { version: '1.73', date: '2026-04-11', title: 'Inline error diagnostics', gears: 2, items: [
    'Wavy underlines for errors with hover tooltips (replaces output errors)',
    'Filterable error badge in output, hidden by default',
  ]},
  { version: '1.72', date: '2026-04-11', title: 'Rainbow brackets & editor improvements', gears: 2, items: [
    '7-color rainbow bracket colorization with matching highlight',
    'Auto-close brackets, indent on closing bracket, 4-space tabs',
  ]},
  { version: '1.71', date: '2026-04-11', title: 'Presentation mode & command palette', gears: 3, items: [
    'Per-cell presentation mode with auto-refresh intervals',
    'Double-shift command palette with tabbed Search/Commands/Tools',
    'Full-text search across notebook content',
  ]},
  { version: '1.70', date: '2026-04-11', title: 'Cell presentation basics', gears: 2, items: [
    'Presentation view toggle (hide code, show output only)',
    'Auto-execute presenting cells on kernel ready',
  ]},
  { version: '1.69', date: '2026-04-11', title: 'Format on save & cross-cell types', gears: 2, items: [
    'Format and check C# cells on save via Roslyn Formatter',
    'Cross-cell type resolution via accumulated workspace preamble',
  ]},
  { version: '1.68', date: '2026-04-11', title: 'JSONB & DB context fixes', gears: 1, items: [
    'PostgreSQL json/jsonb mapped to JsonDocument',
    'Unique namespace suffix for DbContext recompilation (no CS0433)',
  ]},
  { version: '1.67', date: '2026-04-11', title: 'Debugger', gears: 3, items: [
    'Breakpoints with click-to-toggle gutter markers',
    'Pause, resume, and step-through execution',
    'Variable inspection at breakpoints',
  ]},
  { version: '1.66', date: '2026-04-11', title: 'Custom mock handlers', gears: 2, items: [
    'User-defined JavaScript handler functions for mock endpoints',
  ]},
  { version: '1.65', date: '2026-04-11', title: 'UI overhaul with lucide icons', gears: 2, items: [
    'All UI icons replaced with lucide-react',
    'Stronger visual cues setting, log filter, Google Docs export',
  ]},
  { version: '1.64', date: '2026-04-11', title: 'Interactive forms', gears: 3, items: [
    'Display.Form() with auto-inferred and custom field types',
    'Submit-to-cell execution for form-driven workflows',
  ]},
  { version: '1.63', date: '2026-04-11', title: 'Git integration', gears: 3, items: [
    'Git panel: status, staging, commit, branch switching, history',
    'Visual diff viewer with unified and split modes',
  ]},
  { version: '1.62', date: '2026-04-11', title: 'API Editor & mock server', gears: 3, items: [
    'Visual API editor with models, controllers, and endpoints',
    'OpenAPI 3.x export (JSON/YAML) and one-click mock server',
  ]},
  { version: '1.61', date: '2026-04-11', title: 'Export as executable', gears: 2, items: [
    'Export notebook code cells as standalone .NET console app',
  ]},
  { version: '1.60', date: '2026-04-11', title: 'Decision cells', gears: 2, items: [
    'Switch mode for decision cells with multi-path branching',
  ]},
  { version: '1.59', date: '2026-04-11', title: 'Cell orchestration', gears: 3, items: [
    'Cell naming, color coding, decision cells, and pipeline execution',
    'Orchestration panel with cell graph visualization',
  ]},
  { version: '1.58', date: '2026-04-11', title: 'Scheduled execution', gears: 2, items: [
    'Scheduled notebook execution with preset intervals',
    'Collapsible data tables',
  ]},
  { version: '1.57', date: '2026-04-11', title: 'Cell dependencies', gears: 2, items: [
    'Cell dependency graph visualization and notebook versioning',
  ]},
  { version: '1.55', date: '2026-04-11', title: 'CLI headless execution', gears: 2, items: [
    'Run notebooks from command line with config overrides and file output',
  ]},
  { version: '1.54', date: '2026-04-11', title: 'Health check cells', gears: 2, items: [
    'Boolean assertion cells with pass/fail badges and labels',
  ]},
  { version: '1.53', date: '2026-04-11', title: 'Docker global', gears: 2, items: [
    'Docker.Run/Stop/Remove/Exec/IsRunning/List from code cells',
  ]},
  { version: '1.52', date: '2026-04-11', title: 'Dashboard mode', gears: 2, items: [
    'Presentation view showing only cell outputs, hiding code',
  ]},
  { version: '1.50', date: '2026-04-11', title: 'Shell cells', gears: 2, items: [
    'Shell cell type with live-streaming stdout (cross-platform)',
  ]},
  { version: '1.49', date: '2026-04-11', title: 'HTTP cells', gears: 2, items: [
    'HTTP cell type with .http syntax and {{variable}} substitution',
  ]},
  { version: '1.48', date: '2026-04-11', title: 'Parameterized SQL', gears: 1, items: [
    'SQL cells bind @ParamName from Config panel values',
  ]},
  { version: '1.47', date: '2026-04-11', title: 'DB improvements', gears: 1, items: [
    'Test Connection button and schema search/filter',
  ]},
  { version: '1.46', date: '2026-04-11', title: 'SQL enhancements', gears: 1, items: [
    'Tabbed SQL result sets and autocomplete from schema',
  ]},
  { version: '1.44', date: '2026-04-11', title: 'Data table export', gears: 1, items: [
    'Copy, CSV, and TSV export buttons on data tables',
  ]},
  { version: '1.43', date: '2026-04-11', title: 'Mixed chart types', gears: 1, items: [
    'Per-series chart types in Graph panel (line + bar mixing)',
  ]},
  { version: '1.42', date: '2026-04-11', title: 'UI polish & command palette', gears: 2, items: [
    'Icons, status bar, theme preview, shortcuts overlay, DataTable resize',
    'Command palette with categorized actions',
  ]},
];
