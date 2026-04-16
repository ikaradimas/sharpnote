import { v4 as uuidv4 } from 'uuid';

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId() {
  return Math.random().toString(36).slice(2, 10); // 8-char base-36
}

export const CELL_COLORS = [
  { id: 'blue',   value: '#569cd6' },
  { id: 'teal',   value: '#4ec9b0' },
  { id: 'green',  value: '#6a9955' },
  { id: 'orange', value: '#e0a040' },
  { id: 'red',    value: '#d16969' },
  { id: 'purple', value: '#c586c0' },
  { id: 'pink',   value: '#d2658e' },
  { id: 'gray',   value: '#808080' },
];

export function makeCell(type = 'code', content = '') {
  return {
    id: shortId(),
    type,
    content,
    ...(type === 'code'     ? { outputMode: 'auto', locked: false, scheduleInterval: null } : {}),
    ...(type === 'sql'      ? { db: '' } : {}),
    ...(type === 'check'    ? { label: '' } : {}),
    ...(type === 'decision' ? { label: '', mode: 'bool', truePath: [], falsePath: [], switchPaths: {} } : {}),
    ...(type === 'docker'   ? { image: '', containerName: '', ports: '', env: '', volume: '', command: '', runOnStartup: false, runOnShutdown: false, presenting: false } : {}),
  };
}

// ── NuGet default sources ─────────────────────────────────────────────────────

export const DEFAULT_NUGET_SOURCES = [
  { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
];

// ── Cell builder helpers ─────────────────────────────────────────────────────

const md = (content) => makeCell('markdown', content);
const cs = (content, outputMode = 'auto') =>
  ({ ...makeCell('code', content), outputMode });
const http = (content) => makeCell('http', content);
const docker = (image, opts = {}) => ({ ...makeCell('docker', ''), image, ...opts });

// ── Template registry ────────────────────────────────────────────────────────

export const NOTEBOOK_TEMPLATES = [
  { key: 'getting-started',  label: 'Getting Started',          description: 'Variables, LINQ, HTML, tables, extensions' },
  { key: 'data-charts',      label: 'Data & Charts',            description: 'CSV import, Chart.js, dashboards' },
  { key: 'databases',        label: 'Databases',                description: 'SQLite, EF Core, NuGet packages' },
  { key: 'display-output',   label: 'Display & Rich Output',   description: 'Live updates, Mermaid, KaTeX, widgets' },
  { key: 'scripting-utils',  label: 'Scripting & Utilities',   description: 'Logging, config, async, Util helpers' },
  { key: 'workspace-panels', label: 'Workspace & Panels',      description: 'Panels API, dock/float, layout scripting' },
  { key: 'orchestration',    label: 'Cell Orchestration',      description: 'Decision cells, naming, colors, pipelines' },
  { key: 'forms',            label: 'Forms',                   description: 'Interactive forms, submit-to-cell, dashboard mode' },
  { key: 'raytracer',        label: 'Raytracer',               description: 'Build a raytracer with live preview using Display.Image' },
  { key: 'service-mesh',    label: 'Service Mesh',            description: 'Docker containers, mock APIs, health checks, traffic routing' },
  { key: 'infographic',     label: 'Infographic Dashboard',   description: 'Column layouts, stat cards, marquees, progress bars, CSS animations' },
];

function cellsForTemplate(key) {
  switch (key) {
    case 'getting-started':  return makeGettingStartedCells();
    case 'data-charts':      return makeDataChartsCells();
    case 'databases':        return makeDatabasesCells();
    case 'display-output':   return makeDisplayOutputCells();
    case 'scripting-utils':  return makeScriptingUtilsCells();
    case 'workspace-panels': return makeWorkspacePanelsCells();
    case 'orchestration':    return makeOrchestrationCells();
    case 'forms':            return makeFormsCells();
    case 'raytracer':        return makeRaytracerCells();
    case 'service-mesh':    return makeServiceMeshCells();
    case 'infographic':     return makeInfographicCells();
    default:                 return [];
  }
}

function configForTemplate(key) {
  if (key === 'scripting-utils') {
    return [
      { key: 'Environment', value: 'development', type: 'string' },
      { key: 'ApiBaseUrl',  value: 'https://api.example.com', type: 'string', envVar: 'API_BASE_URL' },
      { key: 'MaxRetries',  value: '5', type: 'number' },
      { key: 'Verbose',     value: 'true', type: 'boolean' },
      { key: 'ApiKey',      value: '', type: 'secret', envVar: 'API_KEY' },
    ];
  }
  if (key === 'orchestration') {
    return [
      { key: 'Environment', value: 'production', type: 'string' },
      { key: 'Threshold',   value: '100',        type: 'number' },
    ];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 1 — Getting Started
// ═══════════════════════════════════════════════════════════════════════════════

function makeGettingStartedCells() {
  return [
    md(`# Getting Started

An interactive C# notebook. Press **Ctrl+Enter** to run a cell, or click **▶ Run**.

| Feature | Syntax |
|---------|--------|
| Console output | \`Console.WriteLine("hello")\` |
| HTML | \`Display.Html("<b>bold</b>")\` |
| Table | \`Display.Table(rows)\` · \`.DisplayTable()\` · click headers to **sort** |
| Chart | \`Display.Graph(chartJsConfig)\` |
| NuGet | \`#r "nuget: Package, Version"\` |
| Logging | \`value.Log()\` · \`value.Log("label")\` |
| Config | \`Config["Key"]\` · \`Config.Set("Key","val")\` · \`Config.Remove("Key")\` |
| Data Import | \`Data.LoadCsv(path)\` · File → Import Data File (⇧⌘I) for Excel/Parquet |
| HTTP Cell | \`GET url\` · headers · body — inline HTTP requests with \`{{Config}}\` + \`{{variable}}\` placeholders |
| Database | Attach via **DB** panel or \`Db.Add\` / \`Db.Attach\` → \`mydb.Users.ToList()\` |
| Panels | \`Panels.Open/Close/CloseAll(PanelId.*)\` · \`Panels.Dock/Float\` |
| Util | \`obj.Dump()\` · \`Util.Time()\` · \`Util.Dif()\` · \`Util.HorizontalRun()\` · \`Util.Cache()\` · \`Util.ConfirmAsync()\` |
| Auto-render | Return a value — type is detected automatically |

> **More examples:** File → New Notebook → choose a template topic.`),

    { ...cs(`Display.StatCard("Cell Types", "Code · Markdown · SQL · HTTP · Shell · Docker", color: "#569cd6", icon: "📝");`), columns: 2 },
    { ...cs(`Display.StatCard("Output Modes", "Auto · Table · HTML · Graph · Text", color: "#4ec9b0", icon: "📊");`), columns: 2 },

    md('## Variables, LINQ, and Auto-render'),

    cs(`// Variables, interpolation, LINQ
var name = "SharpNote";
var version = 1.0;
Console.WriteLine($"Hello from {name} v{version}!");

var numbers = Enumerable.Range(1, 10).ToList();
var evens   = numbers.Where(n => n % 2 == 0).ToList();
Console.WriteLine($"Evens: {string.Join(", ", evens)}");

// Returning a value auto-renders it
DateTime.Now`),

    md('## HTML & Tables'),

    cs(`Display.Html(@"
  <h3 style='color:#4ec9b0;margin:0 0 6px'>Rich HTML output</h3>
  <p>Render <strong>any HTML</strong> — styled text, lists, badges, whatever you need.</p>
");

var products = new[] {
  new { Product = "Widget A", Price = 9.99,  Units = 142 },
  new { Product = "Widget B", Price = 24.99, Units = 87  },
  new { Product = "Widget C", Price = 4.99,  Units = 321 },
};
Display.Table(products);`),

    md('## Extension Methods'),

    cs(`// .Display() auto-detects type
"Extension methods work directly on any object!".Display();

// Array of objects → table via extension method
var cities = new[] {
  new { City = "Athens",  Country = "Greece",  Pop = 3_153_000 },
  new { City = "Berlin",  Country = "Germany", Pop = 3_645_000 },
  new { City = "Paris",   Country = "France",  Pop = 2_161_000 },
  new { City = "Lisbon",  Country = "Portugal",Pop = 2_957_000 },
};
cities.DisplayTable();`),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 2 — Data & Charts
// ═══════════════════════════════════════════════════════════════════════════════

function makeDataChartsCells() {
  return [
    md(`# Data & Charts

Load data from files, render tables, and build interactive charts.`),

    { ...cs(`Display.StatCard("Chart Types", "Line · Doughnut · Scatter · Bar", color: "#569cd6", icon: "📊");`), columns: 3 },
    { ...cs(`Display.StatCard("Data Sources", "CSV · TSV · Excel · Parquet", color: "#4ec9b0", icon: "📁");`), columns: 3 },
    { ...cs(`Display.StatCard("Layouts", "Tables · Grids · Dashboards", color: "#e0a040", icon: "📐");`), columns: 3 },

    // ── CSV & Data Import ──────────────────────────────────────────────────

    md('## CSV & Data Import'),

    md('### Inline CSV'),

    cs(`// Parse and render CSV inline
Display.Csv("Name,Score,Grade\\nAlice,95,A\\nBob,82,B\\nCharlie,78,C+\\nDiana,91,A-");`),

    md(`### Data.LoadCsv — Load CSV files

\`Data.LoadCsv(path)\` parses a CSV file and returns a \`List<Dictionary<string, object>>\`.
Values are type-inferred (integers, doubles, booleans, strings). The result auto-displays as a table.

Use **File → Import Data File** (⇧⌘I) to pick a file and generate the code automatically.
Excel (.xlsx) and Parquet files are also supported via code-generated NuGet directives.`),

    cs(`// Write a sample CSV, then load and display it
var csvPath = Path.Combine(Path.GetTempPath(), "sample.csv");
File.WriteAllText(csvPath, "Name,Age,Score,Active\\nAlice,30,95.5,true\\nBob,25,82.0,true\\nCharlie,35,78.3,false\\nDiana,28,91.1,true\\n");

var data = Data.LoadCsv(csvPath);
data  // auto-displayed as a sortable table`),

    cs(`// LINQ on imported data — filter, project, aggregate
var csvPath = Path.Combine(Path.GetTempPath(), "sample.csv");
var data = Data.LoadCsv(csvPath);

// Filter: only active people with score > 80
var highScorers = data
    .Where(r => (bool)r["Active"] && (double)r["Score"] > 80)
    .Select(r => new { Name = r["Name"], Score = r["Score"] })
    .ToList();
highScorers.DisplayTable();

// Aggregate
var avgScore = data.Average(r => (double)r["Score"]);
Console.WriteLine($"Average score: {avgScore:F1}");`),

    cs(`// Tab-delimited and headerless files
var tsvPath = Path.Combine(Path.GetTempPath(), "data.tsv");
File.WriteAllText(tsvPath, "Alice\\t30\\nBob\\t25\\n");

var tsv = Data.LoadCsv(tsvPath, hasHeader: false, delimiter: '\\t');
tsv  // columns are named Col1, Col2, …`),

    // ── Charts ─────────────────────────────────────────────────────────────

    md('## Charts'),

    md('### Charts — Side by Side'),

    { ...cs(`// Return a Chart.js config object — set output mode to "graph"
new {
  type = "line",
  data = new {
    labels   = new[] { "Jan","Feb","Mar","Apr","May","Jun" },
    datasets = new[] {
      new {
        label           = "Revenue ($k)",
        data            = new[] { 42, 58, 51, 74, 83, 91 },
        borderColor     = "rgba(78,201,176,1)",
        backgroundColor = "rgba(78,201,176,0.1)",
        tension         = 0.3,
        fill            = true,
      },
      new {
        label           = "Costs ($k)",
        data            = new[] { 31, 35, 38, 40, 45, 48 },
        borderColor     = "rgba(244,71,71,0.8)",
        backgroundColor = "rgba(244,71,71,0.05)",
        tension         = 0.3,
        fill            = true,
      },
    },
  },
  options = new {
    responsive = true,
    plugins    = new {
      title = new { display = true, text = "Revenue vs Costs 2024" },
    },
  },
}`, 'graph'), columns: 3 },

    { ...cs(`// Doughnut — category share
new {
    type = "doughnut",
    data = new {
        labels = new[] { "Hardware", "Software", "Services", "Support" },
        datasets = new[] { new {
            data            = new[] { 42, 29, 18, 11 },
            backgroundColor = new[] {
                "rgba(78,201,176,0.82)",
                "rgba(86,156,214,0.82)",
                "rgba(244,182,71,0.82)",
                "rgba(197,134,192,0.82)",
            },
            borderWidth = 0,
        }},
    },
    options = new {
        responsive = true,
        plugins = new {
            title  = new { display = true, text = "Revenue Share by Category (%)" },
            legend = new { position = "right" },
        },
    },
}`, 'graph'), columns: 3 },

    { ...cs(`// Scatter — correlation between two variables
var rng = new Random(12);
var points = Enumerable.Range(0, 45).Select(_ => {
    var x = Math.Round(rng.NextDouble() * 100, 1);
    return new { x, y = Math.Round(x * 0.55 + rng.NextDouble() * 35, 1) };
}).ToList();

new {
    type = "scatter",
    data = new {
        datasets = new[] { new {
            label           = "Samples",
            data            = points,
            backgroundColor = "rgba(86,156,214,0.65)",
            pointRadius     = 5,
        }},
    },
    options = new {
        responsive = true,
        plugins = new { title = new { display = true, text = "Scatter: X vs Y" } },
        scales  = new {
            x = new { title = new { display = true, text = "X" } },
            y = new { title = new { display = true, text = "Y" } },
        },
    },
}`, 'graph'), columns: 3 },

    md(`> **Tip:** The three charts above use the \`columns: 3\` layout to render side-by-side. Any cell type supports column layout.`),

    // ── Display.Layout dashboards ──────────────────────────────────────────

    md(`## Display.Layout — Dashboard Grid

\`Display.Layout(columns, items...)\` arranges multiple outputs side-by-side in a grid.
Wrap items with \`Display.Cell(title, content)\` to add per-cell titles.`),

    md('### Two-Column Dashboard'),

    cs(`// Two-column dashboard — tables and summary stats side by side
var sales = new[] {
    new { Region = "North", Q1 = 42, Q2 = 58, Q3 = 51, Q4 = 74 },
    new { Region = "South", Q1 = 35, Q2 = 47, Q3 = 62, Q4 = 88 },
    new { Region = "East",  Q1 = 29, Q2 = 41, Q3 = 55, Q4 = 63 },
    new { Region = "West",  Q1 = 51, Q2 = 60, Q3 = 70, Q4 = 95 },
};

var summary = new {
    TotalRegions = sales.Length,
    BestRegion   = sales.OrderByDescending(s => s.Q1 + s.Q2 + s.Q3 + s.Q4).First().Region,
    BestQ4       = sales.Max(s => s.Q4),
    AverageQ1    = sales.Average(s => s.Q1),
};

Display.Layout(2,
    Display.Cell("Sales by Region", (object)sales),
    Display.Cell("Summary", summary)
);`),

    md('### Three-Column Chart Grid'),

    cs(`// Three charts side by side — great for comparing distributions
var labels = new[] { "Jan", "Feb", "Mar", "Apr", "May", "Jun" };

object MakeChart(string label, int[] data, string color) => new {
    type = "bar",
    data = new {
        labels,
        datasets = new[] { new {
            label,
            data,
            backgroundColor = color,
        }},
    },
    options = new { responsive = true, plugins = new { legend = new { display = false } } },
};

Display.Layout(3,
    Display.Cell("Revenue",  MakeChart("Revenue",  new[] { 42, 58, 51, 74, 83, 91 }, "rgba(78,201,176,0.8)"), "graph"),
    Display.Cell("Costs",    MakeChart("Costs",    new[] { 31, 35, 38, 40, 45, 48 }, "rgba(244,71,71,0.8)"), "graph"),
    Display.Cell("Profit",   MakeChart("Profit",   new[] { 11, 23, 13, 34, 38, 43 }, "rgba(196,150,74,0.8)"), "graph")
);`),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 3 — Databases
// ═══════════════════════════════════════════════════════════════════════════════

function makeDatabasesCells() {
  return [
    md(`# Databases

Connect to SQLite, SQL Server, PostgreSQL, or Redis. The kernel introspects the schema and injects a typed \`DbContext\`.

## NuGet Packages

Use \`#r "nuget: PackageName, Version"\` to load any NuGet package inline.
The first run downloads and caches it; subsequent runs are instant.`),

    cs(`#r "nuget: Newtonsoft.Json, 13.0.3"
using Newtonsoft.Json;

var payload = new {
  name         = "Ada Lovelace",
  born         = 1815,
  contributions = new[] { "First algorithm", "Analytical Engine notes" },
};

var json = JsonConvert.SerializeObject(payload, Formatting.Indented);
Display.Html($"<pre style='color:#9cdcfe;margin:0'>{json}</pre>");`),

    md(`## Database Connections

There are two ways to connect a database to a notebook:

**Via the DB panel** — click **+ Add** to register a connection, then **Attach** to connect it. The kernel introspects the schema and injects a typed \`DbContext\` variable. The variable name is derived from the connection name (e.g. *"My CRM"* → \`myCrm\`).

**From code** — use the \`Db\` global to register and attach connections programmatically:

\`\`\`
Db.Add(name, DbProvider.Sqlite, connectionString)  // register
Db.Attach(name)                                     // attach → injects DbContext
Db.Detach(name) / Db.Remove(name)                   // clean up
var conns = await Db.ListAsync()                    // DbEntry[] with IsAttached flag
\`\`\`

| Task | Expression |
|------|------------|
| Fetch all rows | \`mydb.Users.ToList()\` |
| Filter | \`mydb.Orders.Where(o => o.Total > 100).ToList()\` |
| Project | \`mydb.Products.Select(p => new { p.Name, p.Price }).ToList()\` |
| Raw SQL | \`mydb.Database.SqlQueryRaw<T>("SELECT …").ToList()\` |
| Add connection | \`await Db.AddAsync(name, provider, connStr)\` |
| Async | \`await mydb.Orders.ToListAsync()\` |`),

    md(`### In-memory SQLite from code

\`Db.Add\` + \`Db.Attach\` register and connect a database without touching the DB panel.
\`Db.Attach\` triggers schema introspection via a round-trip to the renderer, so the injected
variable (\`scratch\`) is available to the **next** cell, not the one that called \`Attach\`.

**Run the setup cell first, then run the query cell.**`),

    md(`### Step 1 — Register and Attach

Registers an in-memory SQLite database and attaches it. The \`scratch\` DbContext
is available in the **next** cell.`),

    cs(`// ── Step 1: register and attach ──────────────────────────────────────────────
// Safe to re-run: removes any previous "scratch" connection first.

var existing = await Db.ListAsync();
if (existing.Any(c => c.Name == "scratch")) {
    Db.Detach("scratch");
    Db.Remove("scratch");
    await Task.Delay(300);
}
await Db.AddAsync("scratch", DbProvider.SqliteMemory, "");
Db.Attach("scratch");

Display.Html("<p style='color:#4ec9b0'>Attached — run the next cell to create tables.</p>");`),

    md(`### Step 2 — Create Tables and Re-attach

Creates \`Orders\` and \`Products\` tables, then detaches and re-attaches so the
schema introspection picks up the new tables as typed \`DbSet\` properties.`),

    cs(`// ── Step 2: create tables and refresh schema ────────────────────────────────
// The 'scratch' context exists but has no DbSets yet (empty schema).
// Create the tables, then re-attach to get typed DbSets.

scratch.Database.ExecuteSqlRaw(@"
    CREATE TABLE IF NOT EXISTS Orders (
        Id      INTEGER PRIMARY KEY,
        Product TEXT    NOT NULL,
        Qty     INTEGER NOT NULL,
        Price   REAL    NOT NULL
    )");
scratch.Database.ExecuteSqlRaw(@"
    CREATE TABLE IF NOT EXISTS Products (
        Id    INTEGER PRIMARY KEY AUTOINCREMENT,
        Name  TEXT    NOT NULL,
        Price REAL    NOT NULL,
        Stock INTEGER NOT NULL DEFAULT 0
    )");

// Re-attach to refresh the typed context with the new tables
Db.Detach("scratch");
Db.Attach("scratch");

Display.Html("<p style='color:#4ec9b0'>Tables created — run the cells below.</p>");`),

    md('### Step 3 — Query with LINQ'),

    cs(`// ── Step 3: seed data and query ──────────────────────────────────────────────
// Now scratch.Orders and scratch.Products are typed DbSets.

// Seed orders
scratch.Orders.Add(new() { Id = 1, Product = "Widget A", Qty = 3, Price = 9.99 });
scratch.Orders.Add(new() { Id = 2, Product = "Widget B", Qty = 1, Price = 24.99 });
scratch.Orders.Add(new() { Id = 3, Product = "Widget A", Qty = 7, Price = 9.99 });
scratch.Orders.Add(new() { Id = 4, Product = "Gadget",   Qty = 2, Price = 49.99 });
scratch.SaveChanges();

// Query using the typed DbSet
scratch.Orders.OrderBy(o => o.Id).ToList().DisplayTable();

// LINQ aggregation
scratch.Orders.ToList()
    .GroupBy(o => o.Product)
    .Select(g => new {
        Product = g.Key,
        Units   = g.Sum(o => o.Qty),
        Revenue = Math.Round(g.Sum(o => (double)(o.Qty * o.Price)), 2),
    })
    .OrderByDescending(s => s.Revenue)
    .DisplayTable();`),

    md(`### LINQ to SQL — Full CRUD

Complete Create → Read → Update → Delete workflow using the typed DbContext.
All operations use the \`DbSet\` properties and EF Core change tracking — **no raw SQL**.

**Run the setup cell above first.**`),

    { ...cs(`// ── LINQ to SQL CRUD — no raw SQL ───────────────────────────────────────────
// Uses the 'scratch' DbContext with its typed Products DbSet.

// ── CREATE ───────────────────────────────────────────────────────────────────
// Add entities via the DbSet and SaveChanges
scratch.Products.Add(new() { Name = "Keyboard", Price = 79.99, Stock = 25 });
scratch.Products.Add(new() { Name = "Mouse",    Price = 29.99, Stock = 50 });
scratch.Products.Add(new() { Name = "Monitor",  Price = 349.99, Stock = 10 });
scratch.Products.Add(new() { Name = "Webcam",   Price = 59.99, Stock = 0 });
scratch.Products.Add(new() { Name = "Headset",  Price = 99.99, Stock = 15 });
scratch.SaveChanges();

Display.Html("<h4 style='color:#4ec9b0;margin:4px 0'>CREATE — 5 products added via DbSet</h4>");

// ── READ ─────────────────────────────────────────────────────────────────────
// All products via LINQ
var all = scratch.Products.OrderBy(p => p.Id).ToList();
Display.Html("<h4 style='color:#61afef;margin:8px 0 4px'>READ — All products</h4>");
all.DisplayTable();

// Filtered: in-stock items over $50
var expensive = scratch.Products
    .Where(p => p.Price > 50 && p.Stock > 0)
    .OrderByDescending(p => p.Price)
    .ToList();
Display.Html("<h4 style='color:#61afef;margin:8px 0 4px'>READ — In stock & over $50</h4>");
expensive.DisplayTable();

// Aggregation
var summary = new {
    TotalProducts = scratch.Products.Count(),
    InStock       = scratch.Products.Count(p => p.Stock > 0),
    OutOfStock    = scratch.Products.Count(p => p.Stock == 0),
    AvgPrice      = Math.Round(scratch.Products.Average(p => (double)p.Price), 2),
    TotalValue    = Math.Round(scratch.Products.Sum(p => (double)(p.Price * p.Stock)), 2),
};
Display.Html("<h4 style='color:#61afef;margin:8px 0 4px'>READ — Inventory summary</h4>");
summary.Display();

// ── UPDATE ───────────────────────────────────────────────────────────────────
// Find and modify entities, then SaveChanges
var webcam = scratch.Products.First(p => p.Name == "Webcam");
webcam.Stock = 20;

var keyboard = scratch.Products.First(p => p.Name == "Keyboard");
keyboard.Price = 89.99;

scratch.SaveChanges();

Display.Html("<h4 style='color:#e5c07b;margin:8px 0 4px'>UPDATE — Webcam restocked, Keyboard repriced</h4>");
scratch.Products
    .Where(p => p.Name == "Webcam" || p.Name == "Keyboard")
    .ToList()
    .DisplayTable();

// ── DELETE ───────────────────────────────────────────────────────────────────
// Remove entities matching a condition
var outOfStock = scratch.Products.Where(p => p.Stock == 0).ToList();
scratch.Products.RemoveRange(outOfStock);
scratch.SaveChanges();

Display.Html("<h4 style='color:#e06c75;margin:8px 0 4px'>DELETE — Removed out-of-stock items</h4>");
scratch.Products.OrderBy(p => p.Id).ToList().DisplayTable();`), columns: 2 },

    { ...cs(`Display.Html(@"<div style='background:#111118;border:1px solid #333;border-radius:6px;padding:14px;font-size:12px;color:#aaa;line-height:1.7'>
<div style='color:#569cd6;font-weight:600;margin-bottom:8px'>📋 EF Core CRUD Reference</div>
<div><strong style='color:#4ec9b0'>CREATE</strong> — <code>dbSet.Add(entity)</code> + <code>SaveChanges()</code></div>
<div><strong style='color:#61afef'>READ</strong> — <code>dbSet.Where(...).ToList()</code>, <code>.First()</code>, <code>.Count()</code></div>
<div><strong style='color:#e5c07b'>UPDATE</strong> — modify properties on tracked entity + <code>SaveChanges()</code></div>
<div><strong style='color:#e06c75'>DELETE</strong> — <code>dbSet.Remove(entity)</code> or <code>RemoveRange()</code></div>
<div style='margin-top:8px;border-top:1px solid #333;padding-top:8px'>
<div>• All POCO types are auto-generated from the schema</div>
<div>• Types are available unqualified: <code>new Orders { ... }</code></div>
<div>• Use <code>await dbSet.ToListAsync()</code> for async queries</div>
<div>• <code>SaveChanges()</code> persists all tracked changes in one transaction</div>
</div>
</div>");`, 'html'), columns: 2 },

    md('### Querying an External Database'),

    cs(`// ── Querying an externally-registered database ───────────────────────────────
// Replace "mydb" with the variable name shown in the DB panel (derived from
// the connection name you entered when registering it).

// 1. List all rows as a table
// mydb.Users.ToList().DisplayTable();

// 2. Filter and project
// mydb.Orders
//     .Where(o => o.Total > 100)
//     .Select(o => new { o.Id, o.CustomerName, o.Total, o.CreatedAt })
//     .OrderByDescending(o => o.Total)
//     .Take(20)
//     .ToList()
//     .DisplayTable();

// 3. Aggregate stats
// var stats = new {
//     Total   = mydb.Orders.Count(),
//     Revenue = mydb.Orders.Sum(o => (decimal?)o.Total) ?? 0,
//     Avg     = mydb.Orders.Average(o => (decimal?)o.Total) ?? 0,
// };
// stats.Display();

// ── Connection string reference ───────────────────────────────────────────────
// SQLite:      Data Source=/path/to/database.db
// SQL Server:  Server=localhost;Database=MyDb;User Id=sa;Password=…;TrustServerCertificate=True
// PostgreSQL:  Host=localhost;Database=mydb;Username=postgres;Password=…
// Redis:       localhost:6379

Display.Html(@"
<p style='color:#5a7080;font-style:italic;font-size:12px'>
  Attach a database in the <strong style='color:#c4964a'>DB panel</strong> (or run the in-memory
  example above) to query it here.
</p>");`),

    md(`### Parameterized SQL from Config

SQL cells can use \`@ParamName\` placeholders that are automatically bound from the **Config** panel.
Any \`@ParamName\` matching a Config key is injected as a safe, parameterized query argument.

Open the **Config** panel, add entries like \`Region = North\` and \`MinTotal = 100\`, then
use them in a SQL cell:

\`\`\`sql
SELECT * FROM Orders
WHERE Region = @Region AND Total > @MinTotal
ORDER BY Total DESC
\`\`\`

Config values can also be overridden by environment variables — useful for switching between dev/prod.`),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 4 — Display & Rich Output
// ═══════════════════════════════════════════════════════════════════════════════

function makeDisplayOutputCells() {
  return [
    md(`# Display & Rich Output

Live updates, progress bars, Mermaid diagrams, KaTeX math, interactive widgets, and real-time graphs.`),

    // ── Live updates ───────────────────────────────────────────────────────

    md(`## Live Updates

\`Display.NewHtml()\`, \`NewTable()\`, and \`NewGraph()\` return a **handle** whose \`Update*\` methods
replace the output in-place while the cell is still running — useful for progress indicators,
streaming results, and live charts.`),

    md('### Progress Bar'),

    cs(`// Display.Progress — live-updating progress bar
var progress = Display.Progress("Processing", total: 20);
for (int i = 1; i <= 20; i++) {
    await Task.Delay(80);
    progress.Report(i);
}
progress.Complete();`),

    md('### Live Updating Chart'),

    cs(`// Live chart — data updates in-place without flicker
var rng = new Random(42);
int[] vals = { 30, 50, 40, 60, 45 };
var labels = new[] { "A", "B", "C", "D", "E" };

var chart = Display.NewGraph(new {
    type = "bar",
    data = new {
        labels,
        datasets = new[] { new {
            label = "Live data",
            data = vals,
            backgroundColor = "rgba(86,156,214,0.7)",
        }},
    },
    options = new { responsive = true, animation = new { duration = 150 } },
});

for (int frame = 0; frame < 15; frame++) {
    await Task.Delay(250);
    for (int j = 0; j < vals.Length; j++)
        vals[j] = Math.Clamp(vals[j] + rng.Next(-15, 16), 5, 100);
    chart.UpdateGraph(new {
        type = "bar",
        data = new {
            labels,
            datasets = new[] { new {
                label = "Live data",
                data = (int[])vals.Clone(),
                backgroundColor = "rgba(86,156,214,0.7)",
            }},
        },
        options = new { responsive = true, animation = new { duration = 150 } },
    });
}`, 'graph'),

    // ── Mermaid + KaTeX ────────────────────────────────────────────────────

    md(`## Diagrams (Mermaid)

Use a fenced code block with the \`mermaid\` language tag to render diagrams inline.
Flowcharts, sequence diagrams, class diagrams, state machines, Gantt charts, and more are all supported.

\`\`\`mermaid
flowchart TD
    A([Start]) --> B{Input valid?}
    B -- Yes --> C[Process data]
    B -- No  --> D[Return error]
    C --> E[Save to DB]
    E --> F([Done])
    D --> F
\`\`\`

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant A as App
    participant K as Kernel
    participant N as NuGet

    U->>A: Run cell (#r nuget: Pkg)
    A->>K: execute message
    K->>N: resolve & download
    N-->>K: DLLs loaded
    K-->>A: output stream
    A-->>U: rendered output
\`\`\`

\`\`\`mermaid
pie title Revenue by Category
    "Hardware" : 42
    "Software" : 29
    "Services" : 18
    "Support"  : 11
\`\`\`

\`\`\`mermaid
mindmap
  root((SharpNote))
    Cells
      Code C#
      SQL
      HTTP
      Shell
      Docker
      Decision
    Output
      Tables
      Charts
      Mermaid
      KaTeX
      Images
    Tools
      Orchestration
      Git
      API Editor
      Kafka
    Features
      Embedded Files
      Retained Results
      Column Layout
      Presentation Mode
\`\`\``),

    md(`## Math Formulas (KaTeX)

Use \`$...$\` for **inline math** and \`$$...$$\` for **display (block) math**.

---

**Euler's identity** — considered the most beautiful equation in mathematics:

$$e^{i\\pi} + 1 = 0$$

**Quadratic formula** — roots of $ax^2 + bx + c = 0$:

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

**Fundamental theorem of calculus:**

$$\\int_a^b f(x)\\, dx = F(b) - F(a)$$

**Gaussian (normal) distribution** PDF:

$$f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$$

**Triangular number** — inline example: the sum $\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$ gives $\\frac{n(n+1)}{2}$ for the $n$-th triangular number.

**Matrix multiplication** (element notation):

$$(AB)_{ij} = \\sum_{k=1}^{p} A_{ik}\\, B_{kj}$$`),

    // ── Widgets ────────────────────────────────────────────────────────────

    md(`## Interactive Widgets

Widgets are live UI controls rendered inline in cell output. Their values **persist across re-runs** — changing a slider and pressing Run reads the new position.

| Widget | Kernel API |
|--------|-----------|
| Slider | \`Display.Slider(label, min, max, step, defaultValue)\` |
| Dropdown | \`Display.Dropdown(label, options[], defaultValue)\` |
| Date Picker | \`Display.DatePicker(label, defaultValue)\` |

All three return a \`WidgetHandle\` with implicit conversions to \`double\`, \`int\`, \`float\`, and \`string\`.`),

    md('### Slider, Dropdown, and Date Picker'),

    cs(`// ── Slider + Dropdown + DatePicker demonstration ────────────────────────────

// Slider: numeric range
var temperature = Display.Slider("Temperature (°C)", min: -20, max: 50, step: 0.5, defaultValue: 22);

// Dropdown: enumerated choice
var unit = Display.Dropdown("Unit", new[] { "Celsius", "Fahrenheit", "Kelvin" });

// Date Picker: calendar date
var reportDate = Display.DatePicker("Report Date", defaultValue: "2025-01-01");

// Use the values in code
double converted = unit.StringValue switch {
    "Fahrenheit" => temperature * 9.0 / 5.0 + 32,
    "Kelvin"     => temperature + 273.15,
    _            => (double)temperature,
};

string unitSymbol = unit.StringValue switch {
    "Fahrenheit" => "°F", "Kelvin" => "K", _ => "°C"
};

Display.Html($@"
<div style='font-family:sans-serif;padding:6px 0'>
  <p style='color:#cdd6e0'>
    <strong>{temperature:F1} °C</strong> =
    <span style='color:#4ec9b0'>{converted:F2} {unitSymbol}</span>
    &nbsp;·&nbsp; Report date: <span style='color:#c4964a'>{reportDate}</span>
  </p>
</div>");`),

    md('### Multi-Step Progress'),

    cs(`// Display.Progress with multiple stages — simulates a data pipeline

var stages = new[] { "Downloading", "Parsing", "Validating", "Indexing", "Finalising" };

foreach (var stage in stages) {
    var p = Display.Progress(stage, total: 10);
    for (int i = 1; i <= 10; i++) {
        await Task.Delay(60);
        p.Report(i);
    }
    p.Complete();
}

Display.Html("<p style='color:#4ec9b0'>Pipeline complete — all 5 stages finished.</p>");`),

    md(`### Live HTML Updates

\`Display.NewHtml()\` returns a **handle** whose \`UpdateHtml()\` method replaces the output in-place.
Useful for custom progress indicators, streaming results, or dynamic status displays.`),

    cs(`// Display.NewHtml — live-updating HTML content
var status = Display.NewHtml("<p style='color:#5a7080'>Starting…</p>");

var steps = new[] { "Connecting", "Authenticating", "Fetching data", "Processing", "Done" };
for (int i = 0; i < steps.Length; i++) {
    await Task.Delay(400);
    var pct = (int)((i + 1.0) / steps.Length * 100);
    status.UpdateHtml($@"
        <div style='font-family:sans-serif'>
            <p style='color:#cdd6e0;margin:0 0 4px'><strong>{steps[i]}</strong> ({pct}%)</p>
            <div style='background:#282830;border-radius:4px;height:8px;overflow:hidden'>
                <div style='width:{pct}%;height:100%;background:linear-gradient(90deg,#c4964a,#e5c07b);
                             border-radius:4px;transition:width 0.3s'></div>
            </div>
        </div>");
}`),

    md(`### Live Table Updates

\`Display.NewTable()\` renders a table that can be updated in-place via \`UpdateTable()\`.`),

    cs(`// Display.NewTable — live-updating table
record Metric(string Name, int Value, string Status);

var data = new List<Metric> {
    new("CPU",     0, "…"),
    new("Memory",  0, "…"),
    new("Disk",    0, "…"),
    new("Network", 0, "…"),
};
var table = Display.NewTable(data, "System Metrics");

var rng = new Random(99);
for (int tick = 0; tick < 8; tick++) {
    await Task.Delay(300);
    data = data.Select(m => m with {
        Value  = Math.Clamp(m.Value + rng.Next(-10, 20), 0, 100),
        Status = m.Value > 80 ? "⚠ High" : m.Value > 50 ? "Normal" : "Low",
    }).ToList();
    table.UpdateTable(data);
}`),

    md(`### Images

\`Display.Image(source, alt?, width?, height?)\` renders an image from a URL, file path, or base64 data URI.`),

    cs(`// Display.Image — render images from URLs
Display.Image(
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/C_Sharp_wordmark.svg/240px-C_Sharp_wordmark.svg.png",
    alt: "C# Logo",
    width: 120
);`),

    md(`### Confirm Dialog

\`Util.ConfirmAsync(message, title?)\` renders an **OK / Cancel** dialog inline in the cell output
and **pauses execution** until the user clicks. Returns \`true\` (OK) or \`false\` (Cancel).`),

    cs(`// Util.ConfirmAsync — pause the cell and wait for user confirmation.
// Click OK to proceed, or Cancel to skip the action.

if (await Util.ConfirmAsync("Proceed with the operation?", "Confirm"))
{
    "✓ Confirmed — running operation.".Display();
}
else
{
    "✕ Cancelled by user.".Display();
}`),

    md(`### Text Prompt

\`Util.PromptAsync(message, title?, defaultValue?)\` renders a text input inline and pauses execution
until the user submits. Returns the entered string, or \`null\` if cancelled.`),

    cs(`// Util.PromptAsync — ask for text input inline
var name = await Util.PromptAsync("What is your name?", "Greeting", "World");

if (name != null)
    Display.Html($"<h3 style='color:#4ec9b0;margin:4px 0'>Hello, {name}!</h3>");
else
    Display.Html("<p style='color:#e06c75'>Prompt cancelled.</p>");`),

    // ── Display.Markdown ───────────────────────────────────────────────────

    md(`## Display.Markdown

\`Display.Markdown(text)\` renders rich markdown from C# code — including **Mermaid diagrams** and **KaTeX math**.
Useful for generating dynamic documentation, reports, or structured output.`),

    md('### Dynamic Markdown Report'),

    cs(`// Generate a markdown report from computed data
var items = new[] {
    new { Name = "Alpha",   Score = 92, Grade = "A"  },
    new { Name = "Beta",    Score = 78, Grade = "B+"  },
    new { Name = "Gamma",   Score = 85, Grade = "A-" },
};

var rows = string.Join("\\n", items.Select(i =>
    $"| {i.Name} | {i.Score} | {i.Grade} |"));

Display.Markdown($@"
### Results Summary

| Name | Score | Grade |
|------|-------|-------|
{rows}

> Best score: **{items.Max(i => i.Score)}** by *{items.OrderByDescending(i => i.Score).First().Name}*

$$\\bar{{x}} = \\frac{{1}}{{n}} \\sum_{{i=1}}^{{n}} x_i = {items.Average(i => i.Score):F1}$$
");`),

    md('### Mermaid Diagram from Code'),

    cs(`// Mermaid diagram generated from C# data
var steps = new[] { "Fetch", "Parse", "Transform", "Validate", "Save" };
var arrows = string.Join("\\n    ", steps.Zip(steps.Skip(1), (a, b) => $"{a} --> {b}"));

Display.Markdown($@"
### Pipeline Flow

\`\`\`mermaid
flowchart LR
    {arrows}
\`\`\`
");`),

    // ── Display.Plot ───────────────────────────────────────────────────────

    md(`## Live Graph with Display.Plot

\`Display.Plot(name, value)\` pushes a data point to the **Graph panel** immediately — no need to wait for the cell to finish.

| Parameter | Description |
|-----------|-------------|
| \`mode: PlotMode.Value\` | Plot the raw value *(default)* |
| \`mode: PlotMode.RateOfChange\` | Plot the delta since the previous call |
| \`axis: "y2"\` | Assign the series to the right y-axis |
| \`type: "line" \\| "area" \\| "bar"\` | Set the chart type for this series (default: use panel setting) |

Open the **Graph panel** (Ctrl+Shift+R), then run the cells below.`),

    md('### Display.Plot — Raw Value and Rate of Change'),

    cs(`// ── Display.Plot: raw value vs. rate of change ───────────────────────────────
// Open the Graph panel (Ctrl+Shift+R) before running.

var rng = new Random(42);
double position = 0;

for (int step = 0; step < 200; step++)
{
    double velocity = Math.Sin(step * 0.15) * 5 + rng.NextDouble() - 0.5;
    position += velocity;

    Display.Plot("position", position);                             // raw value
    Display.Plot("velocity", velocity, PlotMode.RateOfChange);     // Δ per tick

    await Task.Delay(30);
}`),

    md('### Mixed Chart Types — Line + Bars'),

    cs(`// ── Per-series chart types: line for signal, bars for events ─────────────────
// Open the Graph panel (Ctrl+Shift+R) before running.
Display.ClearGraph();

var rng = new Random(7);
for (int i = 0; i < 60; i++)
{
    Display.Plot("signal", Math.Sin(i * 0.15) * 10 + 20);          // line (default)
    Display.Plot("events", rng.Next(0, 5), type: ChartType.Bar);    // bars
    await Task.Delay(40);
}`),

    // ── Infographic helpers ───────────────────────────────────────────────

    md(`## Infographic Helpers

Quick one-liners for dashboard-style visuals. Combine with \`columns\` layout for side-by-side cards.`),

    { ...cs(`Display.StatCard("Users", "12,847", color: "#569cd6", icon: "👥");`), columns: 3 },
    { ...cs(`Display.StatCard("Revenue", "$1.2M", color: "#4ec9b0", icon: "💰");`), columns: 3 },
    { ...cs(`Display.StatCard("Uptime", "99.97%", color: "#b48ead", icon: "⏱");`), columns: 3 },

    { ...cs(`Display.ProgressBar(78, "CPU — 78%", color: "#569cd6");`), columns: 2 },
    { ...cs(`Display.ProgressBar(42, "Memory — 42%", color: "#4ec9b0");`), columns: 2 },

    cs(`Display.Marquee("  ●  SYSTEM STATUS: ALL SERVICES OPERATIONAL  ●  LAST DEPLOY: 2 hours ago  ●  ", speed: 30, color: "#4ec9b0", background: "#0a0a12");`),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 5 — Scripting & Utilities
// ═══════════════════════════════════════════════════════════════════════════════

function makeScriptingUtilsCells() {
  return [
    md(`# Scripting & Utilities

Logging, configuration, shared state, async HTTP, modern C# patterns, and LinqPAD-compatible helpers.`),

    // ── Logging ────────────────────────────────────────────────────────────

    md(`## Logging

\`.Log()\` writes an entry to the **Logs panel** (open it with the **Logs** button in the toolbar)
and to a daily rotating file in \`logs/YYYY-MM-DD.log\` beside the app.

- \`value.Log()\` — logs the value and returns it, so it can be chained inline
- \`value.Log("label")\` — prefixes the entry with a label
- Entries tagged **USER** appear in teal; notebook activity tagged **NOTEBOOK** appears in blue`),

    cs(`// Plain string
"Starting data pipeline".Log();

// Label + value (returns the value, so chaining works)
var threshold = 0.75.Log("threshold");

// Log inside a LINQ chain without breaking it
var scores = new[] { 0.42, 0.81, 0.67, 0.91, 0.55 };
var passing = scores
    .Where(s => s >= threshold)
    .Select(s => s.Log("pass"))   // logs each passing score
    .ToList();

// Log a complex object — serialised to JSON automatically
var summary = new { Total = scores.Length, Passing = passing.Count, Threshold = threshold };
summary.Log("summary");

// Display the result too
Display.Html($@"<p style='color:#4ec9b0'>
  {passing.Count} of {scores.Length} scores passed (threshold {threshold:P0})
</p>");`),

    md('### Async Loop with Logging'),

    cs(`// Logging inside an async loop — useful for tracking long-running work
var results = new List<(int Step, double Value)>();
var rng2 = new Random(7);

for (int i = 1; i <= 8; i++) {
    await Task.Delay(120);
    var v = Math.Round(rng2.NextDouble() * 100, 1);
    results.Add((i, v));
    $"step {i}: {v}".Log("loop");
}

results.DisplayTable();`),

    // ── Configuration ──────────────────────────────────────────────────────

    md(`## Notebook Configuration

Use the **Config** panel (toolbar) to define key/value pairs that become available to all scripts in the notebook via the \`Config\` global.

This is useful for environment-specific settings (URLs, feature flags, credentials) without hard-coding them in cells.

Each entry has a **type** (string, number, boolean, secret) and an optional **environment variable** override. When an env var is set, its value takes precedence over the panel value at execution time.

| Expression | Result |
|------------|--------|
| \`Config["Key"]\` | Value string, or \`""\` if missing |
| \`Config.Get("Key", "default")\` | Value with fallback |
| \`Config.GetInt("Key", 0)\` | Parsed int with fallback |
| \`Config.GetDouble("Key", 0.0)\` | Parsed double with fallback |
| \`Config.GetBool("Key", false)\` | Parsed bool (\`true\`/\`1\`/\`yes\`) |
| \`Config.Has("Key")\` | \`true\` if key exists and non-empty |
| \`Config.All\` | \`IReadOnlyDictionary<string,string>\` |

Config is persisted in the \`.cnb\` file alongside packages and sources.`),

    md('### Reading Config Values'),

    cs(`// Read config values — the example notebook pre-populates these
// in the Config panel (open it with ⌘⇧, to see and edit them)
var env     = Config.Get("Environment", "development");  // string
var baseUrl = Config.Get("ApiBaseUrl", "(not set)");      // string — overridden by $API_BASE_URL if set
var retries = Config.GetInt("MaxRetries", 3);             // number → int
var verbose = Config.GetBool("Verbose", false);           // boolean → bool
var apiKey  = Config.Get("ApiKey", "(not set)");           // secret — overridden by $API_KEY if set

Display.Html($@"
<table style='border-collapse:collapse;font-size:12px'>
  <tr><th style='padding:4px 12px;text-align:left;color:#4fc3f7'>Key</th>
      <th style='padding:4px 12px;text-align:left;color:#4fc3f7'>Value</th>
      <th style='padding:4px 12px;text-align:left;color:#4fc3f7'>Type</th></tr>
  <tr><td style='padding:3px 12px'>Environment</td><td style='padding:3px 12px;color:#00e5cc'>{env}</td><td style='padding:3px 12px;color:#555'>string</td></tr>
  <tr><td style='padding:3px 12px'>ApiBaseUrl</td><td style='padding:3px 12px;color:#00e5cc'>{baseUrl}</td><td style='padding:3px 12px;color:#555'>string (env: $API_BASE_URL)</td></tr>
  <tr><td style='padding:3px 12px'>MaxRetries</td><td style='padding:3px 12px;color:#f9a826'>{retries}</td><td style='padding:3px 12px;color:#555'>int</td></tr>
  <tr><td style='padding:3px 12px'>Verbose</td><td style='padding:3px 12px;color:#f9a826'>{verbose}</td><td style='padding:3px 12px;color:#555'>bool</td></tr>
  <tr><td style='padding:3px 12px'>ApiKey</td><td style='padding:3px 12px;color:#f9a826'>{(Config.Has("ApiKey") ? "****" : "(not set)")}</td><td style='padding:3px 12px;color:#555'>secret (env: $API_KEY)</td></tr>
  <tr><td style='padding:3px 12px;color:#555'>All entries</td><td style='padding:3px 12px;color:#555'>{Config.All.Count} defined</td><td></td></tr>
</table>");`),

    // ── Shared state ───────────────────────────────────────────────────────

    md(`## Shared State & Records

All cells in a notebook share a single execution context — types, variables, and \`using\`
directives defined in one cell are available in every cell that runs afterwards.`),

    md('### Dataset Setup'),

    cs(`// Define a record type and build a dataset — both persist for the cells below.
public record Sale(string Region, string Product, int Qty, decimal Revenue);

var sales = new List<Sale> {
    new("North", "Widget Pro",  42, 1259.58m),
    new("North", "DataSync",    18,  882.00m),
    new("South", "Widget Pro",  67, 2009.33m),
    new("South", "Connector",  201, 1002.99m),
    new("East",  "DataSync",    31, 1519.00m),
    new("East",  "Widget Pro",  29,  869.71m),
    new("West",  "Connector",  145,  723.55m),
    new("West",  "DataSync",    24,  936.00m),
};

$"Dataset ready: {sales.Count} sales records across {sales.Select(s => s.Region).Distinct().Count()} regions".Display();`),

    md('### Aggregation'),

    cs(`// 'sales' and the Sale record are still in scope — no redefinition needed.
var byRegion = sales
    .GroupBy(s => s.Region)
    .Select(g => new {
        Region  = g.Key,
        Orders  = g.Count(),
        Units   = g.Sum(s => s.Qty),
        Revenue = g.Sum(s => s.Revenue),
        Avg     = Math.Round(g.Average(s => s.Revenue), 2),
    })
    .OrderByDescending(r => r.Revenue);

byRegion.DisplayTable();`),

    // ── Async & HTTP ───────────────────────────────────────────────────────

    md(`## Async & HTTP

\`await\` works at the top level in any cell — no wrapper needed.
The example below calls a public test API; it requires an internet connection.`),

    cs(`using System.Net.Http;
using System.Text.Json;

var http = new HttpClient();
http.DefaultRequestHeaders.Add("User-Agent", "SharpNote/1.0");

var json = await http.GetStringAsync("https://jsonplaceholder.typicode.com/posts?_limit=8");
var posts = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(json);

var rows = posts.EnumerateArray().Select(p => {
    var firstLine = (p.GetProperty("body").GetString() ?? "").Split('\\n')[0];
    return new {
        Id      = p.GetProperty("id").GetInt32(),
        Title   = p.GetProperty("title").GetString(),
        Excerpt = firstLine.Length > 50 ? firstLine[..50] + "…" : firstLine,
    };
});

rows.DisplayTable();`),

    md(`## HTTP Cells

HTTP cells use **.http file syntax** — method + URL, headers, blank line, body.
Use \`{{key}}\` to substitute Config values or C# variables from the session.
Click **+ HTTP** in the toolbar or between cells to add one.`),

    http(`GET https://jsonplaceholder.typicode.com/posts/1
Accept: application/json`),

    // ── Modern C# ──────────────────────────────────────────────────────────

    md(`## Modern C#

Pattern matching, switch expressions, list patterns, and the range operator all work
out of the box — Roslyn scripting targets C# 12.`),

    md('### Records and Pattern Matching'),

    cs(`// Records + switch expression + pattern matching
public record Shape;
public record Circle(double Radius) : Shape;
public record Rectangle(double W, double H) : Shape;
public record Triangle(double Base, double Height) : Shape;

static double Area(Shape s) => s switch {
    Circle    { Radius: var r }           => Math.PI * r * r,
    Rectangle { W: var w, H: var h }     => w * h,
    Triangle  { Base: var b, Height: var h } => 0.5 * b * h,
    _                                     => 0,
};

static string Describe(Shape s) => s switch {
    Circle c when c.Radius > 10  => "large circle",
    Circle                       => "small circle",
    Rectangle { W: var w, H: var h } when w == h => "square",
    Rectangle                    => "rectangle",
    Triangle                     => "triangle",
    _                            => "unknown",
};

var shapes = new Shape[] {
    new Circle(5), new Circle(12), new Rectangle(4, 4),
    new Rectangle(4, 7), new Triangle(6, 3),
};

shapes
    .Select(s => new {
        Type    = Describe(s),
        Details = s switch {
            Circle    c => $"r = {c.Radius}",
            Rectangle r => $"{r.W} × {r.H}",
            Triangle  t => $"b = {t.Base}, h = {t.Height}",
            _           => "",
        },
        Area = Math.Round(Area(s), 3),
    })
    .DisplayTable();`),

    md('### List Patterns and Ranges'),

    cs(`// List patterns, ranges, and collection expressions
int[] data = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5];

// List pattern matching
string Classify(int[] arr) => arr switch {
    []                     => "empty",
    [var x]                => $"single element: {x}",
    [var first, .., var last] => $"first={first}, last={last}, length={arr.Length}",
};

Display.Html($"<code style='color:#9cdcfe'>{Classify(data)}</code>");

// Range slicing
var middle = data[2..^2];
$"Middle slice [2..^2]: [{string.Join(", ", middle)}]".Display();

// Top 3 by value, with index
data.Select((v, i) => new { Index = i, Value = v })
    .OrderByDescending(x => x.Value)
    .Take(3)
    .DisplayTable();`),

    // ── Util helpers ───────────────────────────────────────────────────────

    md(`## Util — LinqPAD Utilities

SharpNote includes a \`Util\` global with LinqPAD-compatible helpers.
\`.Dump()\` is a direct alias for \`.Display()\` — LinqPAD notebooks work as-is.

| Method | Description |
|--------|-------------|
| \`obj.Dump(title?)\` | Alias for \`.Display()\` — auto-renders the value |
| \`list.DumpTable(title?)\` | Alias for \`.DisplayTable()\` — renders as a table |
| \`Util.Cmd(cmd, args?)\` | Run a shell command; capture and display stdout/stderr |
| \`Util.Time(action, label?)\` | Benchmark an Action; display elapsed time |
| \`Util.Time<T>(fn, label?)\` | Benchmark a Func<T>; display timing and return the value |
| \`Util.Dif(a, b, labelA?, labelB?)\` | Line-by-line diff between two values |
| \`Util.HorizontalRun(gap, items…)\` | Render multiple items side by side |
| \`Util.Metatext(text)\` | Dimmed metadata annotation |
| \`Util.Highlight(obj, color?)\` | Wrap output in a colored highlight box |
| \`Util.Cache<T>(key, fn)\` | Memoize a computation; cached until kernel reset |
| \`Util.ClearCache()\` | Clear all memoized entries |
| \`await Util.ConfirmAsync(msg, title?)\` | Show OK / Cancel dialog; pauses cell until user responds |

**Table sorting** — click any column header to sort ascending.
Click again to reverse; click a third time to restore the original order.`),

    md('### .Dump() and .DumpTable()'),

    cs(`// .Dump() — LinqPAD-compatible alias for .Display()
"LinqPAD users feel right at home!".Dump();

// Arrays auto-render as tables
new[] {
  new { Name = "Alice", Score = 95, Grade = "A"  },
  new { Name = "Bob",   Score = 82, Grade = "B+" },
  new { Name = "Carol", Score = 78, Grade = "C+" },
}.Dump("exam results");     // try clicking the column headers to sort`),

    md('### Util.Time — Benchmarking'),

    cs(`// Util.Time — benchmark a block of code
Util.Time(() => {
    var _ = Enumerable.Range(1, 1_000_000).Sum(x => (long)x);
}, "sum 1 million integers");

// Util.Time<T> — benchmark and capture the return value
var primes = Util.Time(
    () => Enumerable.Range(2, 998)
            .Where(n => !Enumerable.Range(2, (int)Math.Sqrt(n)).Any(d => n % d == 0))
            .ToList(),
    "find primes < 1000");

$"Found {primes.Count} primes below 1000".Display();`),

    md('### Util.Dif — Line Diff'),

    cs(`// Util.Dif — line-by-line diff between two values
// Great for comparing config snapshots, JSON payloads, or any two objects.

var before = new { Name = "Alice", Score = 85, Status = "pending",  Tags = new[] { "new" } };
var after  = new { Name = "Alice", Score = 92, Status = "approved", Tags = new[] { "new", "verified" } };

Util.Dif(before, after, "before", "after");`),

    md('### Util.HorizontalRun — Side-by-Side Layout'),

    cs(`// Util.HorizontalRun — display multiple outputs side by side
var q1 = new[] {
    new { Month = "Jan", Revenue = 42 },
    new { Month = "Feb", Revenue = 58 },
    new { Month = "Mar", Revenue = 51 },
};
var q2 = new[] {
    new { Month = "Apr", Revenue = 74 },
    new { Month = "May", Revenue = 83 },
    new { Month = "Jun", Revenue = 91 },
};

Util.Metatext("H1 vs H2 revenue (click column headers to sort each table)");
Util.HorizontalRun("24px", q1, q2);`),

    md('### Util.Highlight — Colored Boxes'),

    cs(`// Util.Highlight — draw attention to important output
var health = new { Status = "Healthy", Latency = "12ms", Uptime = "99.9%", Errors = 0 };
Util.Highlight(health, "#4ec9b0");         // teal — all good

var warning = new { Status = "Degraded", Latency = "340ms", Uptime = "97.2%", Errors = 14 };
Util.Highlight(warning, "#f4b246");        // amber — attention needed`),

    md('### Util.Cache — Memoization'),

    cs(`// Util.Cache — memoize expensive computations across cell runs.
// Run this cell multiple times — the log entry only appears on the first run.
// Reset the kernel to clear cached values.

var dataset = Util.Cache("heavy-dataset", () => {
    "cache miss — computing...".Log("Util.Cache");
    return Enumerable.Range(1, 10_000)
        .Select(i => new { Id = i, Value = Math.Round(Math.Sin(i * 0.1) * 100, 2) })
        .ToList();
});

$"Loaded {dataset.Count:N0} rows (cached after first run)".Display();`),

    md('### Util.Cmd — Shell Commands'),

    cs(`// Util.Cmd — run a shell command and display the output
// The result is also returned as a string for further processing.

Util.Cmd("dotnet", "--version");`),

    // ── Docker ────────────────────────────────────────────────────────────

    md(`## Docker Integration

The \`Docker\` global lets you manage containers from code cells. Requires Docker Desktop or Docker Engine to be installed.

| Method | Description |
|--------|-------------|
| \`Docker.Run(image, name?, ports?, env?)\` | Start a container; returns container ID |
| \`Docker.Stop(nameOrId)\` / \`Docker.Remove(nameOrId)\` | Stop / remove a container |
| \`Docker.StopAndRemove(nameOrId)\` | Stop + remove in one call (ignores errors) |
| \`Docker.StopAllTracked()\` | Stop all containers started by Docker cells |
| \`Docker.Exec(nameOrId, cmd)\` | Run a command inside a container |
| \`Docker.IsRunning(nameOrId)\` | Check if running |
| \`Docker.List()\` | List all containers |`),

    cs(`// ── Docker example (uncomment if Docker is available) ────────────────────────
// var id = Docker.Run("redis:7", name: "demo-redis",
//     ports: new() { ["6379"] = "6379" });
// Console.WriteLine($"Started: {id[..12]}");
// Docker.IsRunning("demo-redis").Display();
// Docker.StopAndRemove("demo-redis");  // clean up in one call

Docker.List().DisplayTable();  // List running containers`),

    // ── Mock API ──────────────────────────────────────────────────────────

    md(`## Mock API Servers

The \`Mock\` global starts mock HTTP servers from code. Servers run on random ports above 9000.

| Method | Description |
|--------|-------------|
| \`await Mock.StartAsync(apiDef, port?)\` | Start a mock, returns the assigned port |
| \`await Mock.StopAsync(id)\` | Stop a mock by its ID |
| \`await Mock.StopAllAsync()\` | Stop all running mocks |
| \`await Mock.ListAsync()\` | List running mocks (\`Id\`, \`Port\`, \`Title\`) |`),

    { ...cs(`// Start a mock API and call it
var port = await Mock.StartAsync(new {
    id = "demo-api",
    title = "Demo API",
    controllers = new[] { new {
        basePath = "/api/items",
        endpoints = new object[] {
            new { method = "GET", path = "",
                  mockResponse = new { status = 200, body = @"[{""id"":1,""name"":""Widget""},{""id"":2,""name"":""Gadget""}]" } },
            new { method = "GET", path = "/{id}",
                  mockResponse = new { status = 200, body = @"{""id"":{{id}},""name"":""Widget""}" } },
        }
    } }
});

// Call the mock from C#
using var http = new HttpClient();
var items = await http.GetStringAsync($"http://localhost:{port}/api/items");
Display.Html($"<div style='color:#4ec9b0'>Mock on :{port}</div>");
items.Display();`), columns: 2 },

    { ...cs(`Display.Html(@"<div style='background:#111118;border:1px solid #333;border-radius:6px;padding:14px;font-size:12px;color:#aaa;line-height:1.7'>
<div style='color:#4ec9b0;font-weight:600;margin-bottom:8px'>📋 Mock API Notes</div>
<div>• Mocks run in the Electron main process — no external dependencies</div>
<div>• Port 0 assigns a random port above 9000</div>
<div>• Use <code>{{paramName}}</code> in response bodies for path param substitution</div>
<div>• Add <code>mockHandler</code> for dynamic JS logic (instead of static <code>mockResponse</code>)</div>
<div>• The API Editor panel provides a visual interface for designing mocks</div>
<div style='margin-top:8px;color:#569cd6'>💡 See the <strong>Service Mesh</strong> template for a full multi-service example</div>
</div>");`, 'html'), columns: 2 },

    cs(`// List and clean up
var mocks = await Mock.ListAsync();
mocks.DisplayTable();
await Mock.StopAllAsync();
Display.Html("<div style='color:#4ec9b0'>✓ All mocks stopped</div>");`),

    // ── Embedded Files ────────────────────────────────────────────────────

    md(`## Embedded Files

Files can be stored inline in the notebook and accessed from code. Use the **Embedded Files** panel (dock it from the Tools menu) to add files, or embed programmatically:

| Method | Description |
|--------|-------------|
| \`Files["name"]\` | Access an embedded file by name |
| \`Files["name"].ContentAsText\` | Get file content as a UTF-8 string |
| \`Files["name"].Content\` | Get raw byte array |
| \`Files["name"].OpenRead()\` | Get a readable Stream |
| \`Files.Embed("name", bytes, "file.csv", "text/csv")\` | Embed a file from code |
| \`Files.EmbedText("name", text, "file.txt")\` | Embed a text file |
| \`Files["name"].SetVariable("key", "val")\` | Set a variable on a file |
| \`Files["name"].GetVariable("key")\` | Get a variable value |
| \`Files.List()\` | List all embedded files |
| \`Files.Contains("name")\` | Check if a file exists |`),

    { ...cs(`// Embed a CSV file programmatically
Files.EmbedText("sample", "Name,Score\\nAlice,95\\nBob,82\\nCharlie,78", "sample.csv", "text/csv");

// Read it back
var csv = Files["sample"].ContentAsText;
Display.Html($"<pre style='color:#4ec9b0'>{csv}</pre>");

// Set metadata
Files["sample"].SetVariable("source", "manual entry");
Files["sample"].SetVariable("rows", "3");

// List all embedded files
Files.List().Select(f => new { f.Name, f.Filename, f.MimeType, Vars = f.Variables.Count }).DisplayTable();`), columns: 2 },

    { ...cs(`Display.Html(@"<div style='background:#111118;border:1px solid #333;border-radius:6px;padding:14px;font-size:12px;color:#aaa;line-height:1.7'>
<div style='color:#569cd6;font-weight:600;margin-bottom:8px'>📎 Embedded Files Notes</div>
<div>• Files are stored inline in the .cnb notebook file</div>
<div>• Binary files are base64 encoded; text files stored as-is</div>
<div>• Variables are key-value metadata stored on each file</div>
<div>• Open the <strong>Embedded Files</strong> panel to manage files visually</div>
<div>• Code completion knows about <code>Files</code> — type <code>Files.</code> to see methods</div>
<div style='margin-top:8px;color:#4ec9b0'>💡 Use embedded files to ship data alongside your notebook without external file dependencies</div>
</div>");`, 'html'), columns: 2 },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 6 — Workspace & Panels
// ═══════════════════════════════════════════════════════════════════════════════

function makeWorkspacePanelsCells() {
  return [
    md(`# Workspace & Panels

Scripts can open, close, dock, and float panels — useful in setup notebooks that configure the workspace before you start working.

| Method | Description |
|--------|-------------|
| \`Panels.Open(PanelId.*)\` | Make a panel visible |
| \`Panels.Close(PanelId.*)\` | Hide a panel |
| \`Panels.CloseAll()\` | Close every open panel at once |
| \`Panels.Dock(PanelId.*, DockZone.*, size?)\` | Move to a dock zone; \`size < 1\` = fraction of window, \`size ≥ 1\` = pixels |
| \`Panels.Float(PanelId.*, x?, y?, width?, height?)\` | Float with optional exact position and size |

**DockZone constants:** \`DockZone.Left\` · \`DockZone.Right\` · \`DockZone.Bottom\`

**PanelId constants:** \`Log\` · \`Packages\` · \`Config\` · \`Db\` · \`Library\` · \`Variables\` · \`Toc\` · \`Files\` · \`Api\` · \`Graph\` · \`Todo\``),

    md('### Dock Panels to Zones'),

    cs(`// ── Dock panels to zones ─────────────────────────────────────────────────────
// Arrange the workspace for a data-exploration session.

// Right zone: Graph at 38% of window width, Variables below it
Panels.Open(PanelId.Graph);
Panels.Dock(PanelId.Graph, DockZone.Right, 0.38);

Panels.Open(PanelId.Variables);
Panels.Dock(PanelId.Variables, DockZone.Right);

// Bottom zone: Log panel at 160 px tall
Panels.Open(PanelId.Log);
Panels.Dock(PanelId.Log, DockZone.Bottom, 160);

Display.Html("<p style='color:#4ec9b0'>Layout applied — Graph and Variables on the right, Log at the bottom.</p>");`),

    cs(`// ── Float panels with precise position and size ───────────────────────────────
// Float two panels side by side on the right half of the screen.

Panels.Open(PanelId.Variables);
Panels.Float(PanelId.Variables, x: 880, y: 80, width: 380, height: 480);

Panels.Open(PanelId.Config);
Panels.Float(PanelId.Config, x: 880, y: 580, width: 380, height: 260);

Display.Html("<p style='color:#4ec9b0'>Variables and Config floating — drag them anywhere.</p>");`),

    cs(`// ── CloseAll then open only what you need ────────────────────────────────────
// Clear every open panel, then set a focused single-panel layout.

Panels.CloseAll();

Panels.Open(PanelId.Graph);
Panels.Dock(PanelId.Graph, DockZone.Right, 0.42);

Display.Html("<p style='color:#4ec9b0'>Focused layout: Graph panel only.</p>");`),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 7 — Cell Orchestration
// ═══════════════════════════════════════════════════════════════════════════════

function makeOrchestrationCells() {
  // Pre-create cells with known IDs so decision paths can reference them
  const loadCell     = { ...makeCell('code', [
    '// Load raw data',
    'var orders = new[] {',
    '    new { Id = 1, Product = "Widget A", Qty = 120, Price = 9.99 },',
    '    new { Id = 2, Product = "Widget B", Qty = 45,  Price = 24.50 },',
    '    new { Id = 3, Product = "Widget C", Qty = 200, Price = 4.75 },',
    '    new { Id = 4, Product = "Widget D", Qty = 8,   Price = 149.00 },',
    '};',
    'Display.Html($"<p>Loaded {orders.Length} orders</p>");',
  ].join('\n')), name: 'Load Orders', color: 'blue' };

  const statsCell    = { ...makeCell('code', [
    '// Compute summary statistics from the orders',
    'var totalRevenue = orders.Sum(o => o.Qty * o.Price);',
    'var avgQty       = orders.Average(o => (double)o.Qty);',
    'var topProduct   = orders.OrderByDescending(o => o.Qty * o.Price).First().Product;',
    '',
    'Display.Html($@"',
    '<table>',
    '  <tr><td><b>Total Revenue</b></td><td>${totalRevenue:N2}</td></tr>',
    '  <tr><td><b>Avg Quantity</b></td><td>{avgQty:N1}</td></tr>',
    '  <tr><td><b>Top Product</b></td><td>{topProduct}</td></tr>',
    '</table>");',
  ].join('\n')), name: 'Compute Stats', color: 'teal' };

  const thresholdVal = 'totalRevenue > double.Parse(Config["Threshold"])';
  const decisionCell = { ...makeCell('decision', thresholdVal), label: 'Revenue threshold met?', name: 'Revenue Gate', color: 'purple' };

  const passCell     = { ...makeCell('code', [
    '// Revenue above threshold — generate a success report',
    "var html = \"<div style='padding:8px;background:rgba(78,201,176,0.1);border-left:3px solid #4ec9b0;border-radius:4px'>\"",
    "  + \"<b style='color:#4ec9b0'>✓ Revenue Target Met</b>\"",
    "  + \"<p style='margin:4px 0 0;color:#ccc'>Revenue of $\" + totalRevenue.ToString(\"N2\") + \" exceeds threshold.</p>\"",
    '  + "</div>";',
    'Display.Html(html);',
  ].join('\n')), name: 'Success Report', color: 'green' };

  const failCell     = { ...makeCell('code', [
    '// Revenue below threshold — flag for review',
    "var html = \"<div style='padding:8px;background:rgba(224,80,80,0.1);border-left:3px solid #e05050;border-radius:4px'>\"",
    "  + \"<b style='color:#e05050'>✗ Below Target</b>\"",
    "  + \"<p style='margin:4px 0 0;color:#ccc'>Revenue of $\" + totalRevenue.ToString(\"N2\") + \" is below threshold.</p>\"",
    '  + "</div>";',
    'Display.Html(html);',
  ].join('\n')), name: 'Alert Report', color: 'red' };

  const checkCell    = { ...makeCell('check', 'orders.Length > 0'), label: 'Orders loaded', name: 'Data Check', color: 'green' };

  const chartCell    = { ...makeCell('code', [
    '// Plot revenue per product',
    'foreach (var o in orders)',
    '    Display.Plot(o.Product, o.Qty * o.Price);',
  ].join('\n')), name: 'Revenue Chart', color: 'orange' };

  // Switch decision: route by top product name
  const switchCell = { ...makeCell('decision', 'topProduct'), label: 'Route by top product', name: 'Product Router', color: 'purple', mode: 'switch' };

  const widgetACell = { ...makeCell('code', [
    '// Widget A special handling',
    'Display.Html("<p style=\'color:#569cd6\'><b>Widget A</b> is the top seller — running A-specific analytics.</p>");',
  ].join('\n')), name: 'Widget A Path', color: 'blue' };

  const widgetCCell = { ...makeCell('code', [
    '// Widget C special handling',
    'Display.Html("<p style=\'color:#4ec9b0\'><b>Widget C</b> leads — bulk pricing analysis triggered.</p>");',
  ].join('\n')), name: 'Widget C Path', color: 'teal' };

  const defaultRouteCell = { ...makeCell('code', [
    '// Default route for other products',
    'Display.Html($"<p style=\'color:#808080\'>Top product <b>{topProduct}</b> has no special handler — using default pipeline.</p>");',
  ].join('\n')), name: 'Default Path', color: 'gray' };

  // Wire decision paths
  decisionCell.truePath  = [passCell.id];
  decisionCell.falsePath = [failCell.id];
  switchCell.switchPaths = {
    'Widget A': [widgetACell.id],
    'Widget C': [widgetCCell.id],
    'default':  [defaultRouteCell.id],
  };

  // Wire explicit execution order
  loadCell.nextCells      = [checkCell.id];
  checkCell.prevCells     = [loadCell.id];
  checkCell.nextCells     = [statsCell.id];
  statsCell.prevCells     = [checkCell.id];
  statsCell.nextCells     = [decisionCell.id];
  decisionCell.prevCells  = [statsCell.id];
  passCell.nextCells      = [chartCell.id];
  failCell.nextCells      = [chartCell.id];
  chartCell.prevCells     = [passCell.id, failCell.id];
  chartCell.nextCells     = [switchCell.id];
  switchCell.prevCells    = [chartCell.id];

  return [
    md(`# Cell Orchestration

This template demonstrates the **cell orchestration** features — named cells, colors,
decision branching, and the interactive dependency graph.

## How to use

1. Open the **Orchestration** panel (Tools → Orchestration, or **Ctrl+Shift+Y**)
2. Run the cells below — the graph will light up with execution status
3. **Click a node** in the graph to run it, **double-click** to navigate
4. **Right-click** a node for: *Run with upstream*, *Run downstream*, *Add to pipeline*
5. Use **zoom** (scroll) and **pan** (drag empty space) to navigate the graph
6. Create **pipelines** in the bottom section to group and re-run cells`),

    md(`## 1. Cell Naming & Colors

Every cell has an optional **name** and **color** — visible in the cell header and in the
orchestration graph. Click the small dot to pick a color, click "unnamed" to set a name.

The cells below are pre-named and colored to show the feature.`),

    loadCell,

    md(`## 2. Data Validation

**Check cells** assert a boolean condition. They render green (pass) or red (fail).
They appear as nodes in the dependency graph.`),

    checkCell,

    md(`## 3. Computed Dependencies

This cell references \`orders\` from the Load cell — creating a dependency edge in the graph.
Open the Orchestration panel to see the edge from *Load Orders* → *Compute Stats*.`),

    statsCell,

    md(`## 4. Decision Cell — Branching

**Decision cells** evaluate a boolean expression and branch execution.
The cell below checks if total revenue exceeds the \`Threshold\` config value (set to 100).

- **True path** → runs *Success Report* (green)
- **False path** → runs *Alert Report* (red)

In the graph, true edges are solid green, false edges are dashed red.`),

    decisionCell,
    passCell,
    failCell,

    md(`## 5. Switch Decision — Multi-Path Branching

Decision cells also support **switch mode** — the expression returns a value and execution
routes to the matching case. Set the mode to "switch" using the dropdown in the cell header.

The cell below evaluates \`topProduct\` (from *Compute Stats*) and routes to:
- **"Widget A"** → Widget A analytics
- **"Widget C"** → Widget C bulk pricing
- **default** → generic handler (any unmatched value)

In the graph, switch edges are labeled with their case values and colored purple.`),

    switchCell,
    widgetACell,
    widgetCCell,
    defaultRouteCell,

    md(`## 6. Visualization

This cell also depends on \`orders\`, creating another edge in the graph.`),

    chartCell,

    md(`## 7. Pipelines

Open the Orchestration panel and use the **Pipelines** section at the bottom:

1. Click **+ Select** to enter selection mode
2. Click nodes in the graph to add them to the pipeline
3. Name it and click **✓** to save
4. Click **▶** to run the pipeline — cells execute in dependency order

### Orchestration Execution Modes

| Mode | What it does |
|------|-------------|
| **Click node** | Runs that single cell |
| **Run with upstream** | Runs all upstream cells first, then the target |
| **Run downstream** | Runs the target, then everything that depends on it |
| **Run pipeline** | Runs a named group of cells in topological order |

Decision cells dynamically choose which branch to follow during pipeline execution.`),

    md(`## Tips

- **Zoom** the graph with scroll wheel (0.3× to 3×)
- **Pan** by dragging on empty space in the graph
- **Fit** resets zoom and pan to default
- **Cancel** (⏹) stops a running orchestration mid-flight
- Nodes pulse when running, show ✓/✗ when done, and turn amber when stale
- Variable names appear as edge labels to show data flow`),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 8 — Forms
// ═══════════════════════════════════════════════════════════════════════════════

function makeFormsCells() {
  // Pre-create named cells so forms can reference them as targets
  const searchHandler = { ...makeCell('code', [
    '// Process the search form submission',
    'var query = (string)FormData["Query"];',
    'var maxResults = Convert.ToInt32(FormData["MaxResults"]);',
    'var includeArchived = (bool)FormData["IncludeArchived"];',
    '',
    'var results = new[] { "Alpha", "Beta", "Gamma", "Delta", "Epsilon" }',
    '    .Where(s => string.IsNullOrEmpty(query) || s.Contains(query, StringComparison.OrdinalIgnoreCase))',
    '    .Take(maxResults);',
    '',
    'Display.Html($"<h4>Search Results</h4><p>Query: <b>{query}</b> | Max: {maxResults} | Archived: {includeArchived}</p>");',
    'Display.Table(results.Select(r => new { Name = r, Status = "Active" }));',
  ].join('\n')), name: 'Process Search' };

  const orderHandler = { ...makeCell('code', [
    '// Process the order form submission',
    'var name = (string)FormData["name"];',
    'var quantity = Convert.ToInt32(FormData["quantity"]);',
    'var priority = (string)FormData["priority"];',
    'var rush = (bool)FormData["rush"];',
    'var notes = (string)FormData["notes"];',
    'var date = (string)FormData["deliveryDate"];',
    '',
    'var unitPrice = 24.99;',
    'var total = quantity * unitPrice * (rush ? 1.5 : 1.0);',
    '',
    'Display.Html($@"',
    '<div style=""padding:12px;border:1px solid #4ec9b0;border-radius:6px"">',
    '  <h4 style=""color:#4ec9b0;margin:0 0 8px"">Order Confirmed</h4>',
    '  <table>',
    '    <tr><td><b>Customer</b></td><td>{name}</td></tr>',
    '    <tr><td><b>Quantity</b></td><td>{quantity}</td></tr>',
    '    <tr><td><b>Priority</b></td><td>{priority}</td></tr>',
    '    <tr><td><b>Rush</b></td><td>{(rush ? "Yes (+50%)" : "No")}</td></tr>',
    '    <tr><td><b>Delivery</b></td><td>{date}</td></tr>',
    '    <tr><td><b>Total</b></td><td>${total:N2}</td></tr>',
    '  </table>',
    '  {(string.IsNullOrEmpty(notes) ? "" : $"<p><i>{notes}</i></p>")}',
    '</div>");',
  ].join('\n')), name: 'Submit Order' };

  const surveyHandler = { ...makeCell('code', [
    '// Process the survey form submission',
    'var rating = Convert.ToInt32(FormData["rating"]);',
    'var feature = (string)FormData["feature"];',
    'var feedback = (string)FormData["feedback"];',
    'var recommend = (bool)FormData["recommend"];',
    '',
    'Display.Html($@"',
    '<div style=""padding:12px;border:1px solid #569cd6;border-radius:6px"">',
    '  <h4 style=""color:#569cd6;margin:0 0 8px"">Survey Response Recorded</h4>',
    '  <p>Rating: {new string(\'★\', rating)}{new string(\'☆\', 5 - rating)} ({rating}/5)</p>',
    '  <p>Favorite feature: <b>{feature}</b></p>',
    '  <p>Would recommend: {(recommend ? "Yes" : "No")}</p>',
    '  {(string.IsNullOrEmpty(feedback) ? "" : $"<p>Feedback: <i>{feedback}</i></p>")}',
    '</div>");',
    '',
    'Display.Plot("Rating", rating);',
  ].join('\n')), name: 'Process Survey' };

  return [
    md(`# Forms

This template demonstrates **Display.Form()** — interactive forms that submit to a target cell.
Forms work in **dashboard mode**, making them ideal for data-entry applications.

Toggle dashboard mode with **Ctrl+Shift+B** to see forms without code.`),

    md(`## 1. Simple Search Form

The simplest form uses an **anonymous object** — field types are inferred automatically:
- \`string\` → text input
- \`int\`/\`double\` → number input
- \`bool\` → checkbox`),

    cs([
      '// Simple form: types inferred from anonymous object properties',
      'Display.Form("Search", new {',
      '    Query = "",',
      '    MaxResults = 10,',
      '    IncludeArchived = false,',
      '}, targetCell: "Process Search");',
    ].join('\n')),

    searchHandler,

    md(`## 2. Order Entry Form

For full control, use **FormField** descriptors with explicit types, validation,
placeholders, and options:`),

    cs([
      '// Detailed form with explicit field types and validation',
      'Display.Form("Place Order", new FormField[] {',
      '    FormField.Text("name", "Customer Name", required: true, placeholder: "Full name"),',
      '    FormField.Number("quantity", "Quantity", min: 1, max: 100, defaultValue: 1),',
      '    FormField.Select("priority", "Priority",',
      '        options: new[] { "Low", "Medium", "High" }, defaultValue: "Medium"),',
      '    FormField.Checkbox("rush", "Rush Delivery (+50%)"),',
      '    FormField.TextArea("notes", "Order Notes", placeholder: "Special instructions..."),',
      '    FormField.Date("deliveryDate", "Delivery Date"),',
      '}, targetCell: "Submit Order");',
    ].join('\n')),

    orderHandler,

    md(`## 3. Dynamic Survey Form

Forms can be **generated from data**. This example builds a survey dynamically
and the handler cell processes the response:`),

    cs([
      '// Build form fields dynamically from data',
      'var features = new[] { "Code Editor", "Panels", "Charts", "SQL", "Forms" };',
      '',
      'var fields = new[] {',
      '    FormField.Number("rating", "Overall Rating (1-5)", min: 1, max: 5, defaultValue: 4),',
      '    FormField.Select("feature", "Favorite Feature", options: features),',
      '    FormField.TextArea("feedback", "Additional Feedback", placeholder: "What could be better?"),',
      '    FormField.Checkbox("recommend", "Would you recommend this app?", defaultValue: true),',
      '};',
      '',
      'Display.Form("User Satisfaction Survey", fields, targetCell: "Process Survey");',
    ].join('\n')),

    surveyHandler,

    md(`## How It Works

| Concept | Details |
|---------|---------|
| **Display.Form(title, model, targetCell)** | Anonymous object → inferred field types |
| **Display.Form(title, fields[], targetCell)** | FormField array → explicit control |
| **FormData dictionary** | Target cell receives \`FormData["key"]\` with submitted values |
| **targetCell** | Cell name or ID — executed on submit with FormData injected |
| **Dashboard mode** | Forms render without code — Ctrl+Shift+B to toggle |

### FormField Types

| Factory | HTML Input | C# Type |
|---------|-----------|---------|
| \`FormField.Text()\` | text input | string |
| \`FormField.Number()\` | number input (min/max/step) | double |
| \`FormField.Select()\` | dropdown | string |
| \`FormField.Checkbox()\` | checkbox | bool |
| \`FormField.TextArea()\` | multi-line text | string |
| \`FormField.Date()\` | date picker | string (ISO-8601) |`),
  ];
}

// ── Notebook factory ──────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// Template 9 — Raytracer
// ═══════════════════════════════════════════════════════════════════════════════

function makeRaytracerCells() {
  return [
    md(`# Raytracer

Build a simple raytracer step by step, rendering directly into the notebook via base64 images.
Each cell builds on the previous — run them in order.`),

    { ...cs(`Display.StatCard("Resolution", "400 × 300", color: "#569cd6", icon: "🖼");`), columns: 4 },
    { ...cs(`Display.StatCard("Spheres", "4 objects", color: "#4ec9b0", icon: "🔵");`), columns: 4 },
    { ...cs(`Display.StatCard("Bounces", "3 depth", color: "#e0a040", icon: "↩");`), columns: 4 },
    { ...cs(`Display.StatCard("Render", "ParallelRender", color: "#c084d0", icon: "⚡");`), columns: 4 },

    md('## 1. Vector Math'),

    cs([
      '// ── Vec3: immutable 3D vector with operator overloads ─────────────────────────',
      'record struct Vec3(double X, double Y, double Z) {',
      '    public double Length    => Math.Sqrt(X*X + Y*Y + Z*Z);',
      '    public double LengthSq => X*X + Y*Y + Z*Z;',
      '    public Vec3 Normalized => this / Length;',
      '    public double Dot(Vec3 b) => X*b.X + Y*b.Y + Z*b.Z;',
      '    public Vec3 Cross(Vec3 b) => new(Y*b.Z - Z*b.Y, Z*b.X - X*b.Z, X*b.Y - Y*b.X);',
      '    public Vec3 Reflect(Vec3 n) => this - 2 * Dot(n) * n;',
      '    public static Vec3 operator +(Vec3 a, Vec3 b) => new(a.X+b.X, a.Y+b.Y, a.Z+b.Z);',
      '    public static Vec3 operator -(Vec3 a, Vec3 b) => new(a.X-b.X, a.Y-b.Y, a.Z-b.Z);',
      '    public static Vec3 operator -(Vec3 a)         => new(-a.X, -a.Y, -a.Z);',
      '    public static Vec3 operator *(double s, Vec3 a) => new(s*a.X, s*a.Y, s*a.Z);',
      '    public static Vec3 operator *(Vec3 a, double s) => new(s*a.X, s*a.Y, s*a.Z);',
      '    public static Vec3 operator *(Vec3 a, Vec3 b)   => new(a.X*b.X, a.Y*b.Y, a.Z*b.Z);',
      '    public static Vec3 operator /(Vec3 a, double s) => new(a.X/s, a.Y/s, a.Z/s);',
      '}',
      '',
      '// Quick test',
      'var v = new Vec3(1, 2, 3);',
      'new { v, normalized = v.Normalized, length = v.Length, dot = v.Dot(new Vec3(0,1,0)) }.Display();',
    ].join('\n')),

    md('## 2. Ray, Sphere, and Hit Record'),

    cs([
      '// ── Ray + Sphere + HitRecord ─────────────────────────────────────────────────',
      'record struct Ray(Vec3 Origin, Vec3 Dir);',
      '',
      'record struct HitRecord(double T, Vec3 Point, Vec3 Normal, Vec3 Color, double Reflectivity);',
      '',
      'record Sphere(Vec3 Center, double Radius, Vec3 Color, double Reflectivity = 0) {',
      '    public HitRecord? Hit(Ray ray, double tMin, double tMax) {',
      '        var oc = ray.Origin - Center;',
      '        var a  = ray.Dir.Dot(ray.Dir);',
      '        var h  = oc.Dot(ray.Dir);',
      '        var c  = oc.Dot(oc) - Radius * Radius;',
      '        var disc = h * h - a * c;',
      '        if (disc < 0) return null;',
      '        var sqrtD = Math.Sqrt(disc);',
      '        var t = (-h - sqrtD) / a;',
      '        if (t < tMin || t > tMax) { t = (-h + sqrtD) / a; if (t < tMin || t > tMax) return null; }',
      '        var p = ray.Origin + t * ray.Dir;',
      '        var n = (p - Center) / Radius;',
      '        return new HitRecord(t, p, n, Color, Reflectivity);',
      '    }',
      '}',
      '',
      '"Sphere + Ray types ready".Display();',
    ].join('\n')),

    md('## 3. Scene and Camera'),

    cs([
      '// ── Scene definition ──────────────────────────────────────────────────────────',
      'var spheres = new Sphere[] {',
      '    new(new Vec3( 0,   -0.2, -1.2), 0.5,  new Vec3(0.8, 0.3, 0.3), 0.05),  // red',
      '    new(new Vec3(-1.1,  0,   -1.5), 0.5,  new Vec3(0.3, 0.8, 0.3), 0.3),   // green (reflective)',
      '    new(new Vec3( 1.1,  0,   -1.5), 0.5,  new Vec3(0.3, 0.3, 0.8), 0.8),   // blue (mirror)',
      '    new(new Vec3( 0, -100.7, -1),  100.0, new Vec3(0.6, 0.6, 0.6), 0.02),  // ground',
      '};',
      '',
      'var lightDir = new Vec3(-0.5, 0.8, -0.3).Normalized;',
      'var lightColor = new Vec3(1, 0.95, 0.8);',
      'var ambient = new Vec3(0.08, 0.08, 0.12);',
      'var skyTop = new Vec3(0.3, 0.5, 1.0);',
      'var skyBottom = new Vec3(0.8, 0.85, 1.0);',
      '',
      'int W = 400, H = 250;',
      'double aspect = (double)W / H;',
      'double fov = 1.0;  // tan(half-angle)',
      '',
      'Display.Html($"<p style=\'color:#4ec9b0\'>Scene: {spheres.Length} spheres, {W}×{H} image</p>");',
    ].join('\n')),

    md('## 4. Trace Function'),

    cs([
      '// ── Trace: cast a ray and compute color ──────────────────────────────────────',
      'Vec3 Sky(Ray ray) {',
      '    var t = 0.5 * (ray.Dir.Normalized.Y + 1);',
      '    return (1 - t) * skyBottom + t * skyTop;',
      '}',
      '',
      'HitRecord? SceneHit(Ray ray, double tMin, double tMax) {',
      '    HitRecord? closest = null;',
      '    foreach (var s in spheres) {',
      '        var hit = s.Hit(ray, tMin, closest?.T ?? tMax);',
      '        if (hit != null) closest = hit;',
      '    }',
      '    return closest;',
      '}',
      '',
      'Vec3 Trace(Ray ray, int depth) {',
      '    if (depth <= 0) return new Vec3(0, 0, 0);',
      '    var hit = SceneHit(ray, 0.001, 1e20);',
      '    if (hit == null) return Sky(ray);',
      '    var h = hit.Value;',
      '',
      '    // Diffuse (Lambertian)',
      '    var diff = Math.Max(0, h.Normal.Dot(lightDir));',
      '    // Shadow test',
      '    var shadowRay = new Ray(h.Point + 0.001 * h.Normal, lightDir);',
      '    if (SceneHit(shadowRay, 0.001, 1e20) != null) diff *= 0.15;',
      '',
      '    var color = h.Color * (ambient + diff * lightColor);',
      '',
      '    // Reflection',
      '    if (h.Reflectivity > 0) {',
      '        var refl = ray.Dir.Normalized.Reflect(h.Normal);',
      '        var reflColor = Trace(new Ray(h.Point + 0.001 * h.Normal, refl), depth - 1);',
      '        color = (1 - h.Reflectivity) * color + h.Reflectivity * reflColor;',
      '    }',
      '    return color;',
      '}',
      '',
      '"Trace function ready".Display();',
    ].join('\n')),

    md('## 5. Render with Live Preview'),

    cs([
      '// ── Render using RenderRows with automatic live preview ──────────────────────',
      'var canvas = Display.Canvas(W, H, "Raytracer Output");',
      '',
      '// RenderRows handles the loop + periodic Flush for you (every 50 rows)',
      'canvas.RenderRows((x, y) => {',
      '    double u = (2.0 * (x + 0.5) / W - 1) * aspect * fov;',
      '    double v = (1 - 2.0 * (y + 0.5) / H) * fov;',
      '    var ray = new Ray(new Vec3(0, 0, 0), new Vec3(u, v, -1).Normalized);',
      '    var c = Trace(ray, 3);',
      '    return (c.X, c.Y, c.Z);',
      '}, flushEvery: 50);',
      '',
      'Display.Html($"<p style=\'color:#5a7080;margin-top:8px\'>{W}×{H} — {spheres.Length} spheres, 3 bounces</p>");',
    ].join('\n')),

    md('## 6. Parallel Render + Shape Overlay'),

    cs([
      '// ── ParallelRender: render all pixels using all CPU cores ─────────────────────',
      'var fast = Display.Canvas(W, H, "Parallel Render");',
      '',
      'fast.ParallelRender((x, y) => {',
      '    double u = (2.0 * (x + 0.5) / W - 1) * aspect * fov;',
      '    double v = (1 - 2.0 * (y + 0.5) / H) * fov;',
      '    var ray = new Ray(new Vec3(0, 0, 0), new Vec3(u, v, -1).Normalized);',
      '    var c = Trace(ray, 3);',
      '    return (c.X, c.Y, c.Z);',
      '});',
      '',
      '// Draw shape overlays on the rendered image',
      'fast.DrawRect(10, 10, 100, 20, 255, 255, 255);      // white border rectangle',
      'fast.FillRect(12, 12, 96, 16, 40, 40, 50);           // dark fill inside',
      'fast.DrawCircle(W - 30, 30, 15, 255, 200, 60);       // gold circle marker',
      'fast.FillCircle(W - 30, 30, 12, 60, 50, 30);         // dark fill',
      'fast.DrawLine(0, H - 1, W - 1, H - 1, 100, 100, 120); // bottom border line',
      '',
      'fast.Flush();',
      'Display.Html("<p style=\'color:#4ec9b0;margin-top:4px\'>Rendered with ParallelRender + shape overlays</p>");',
    ].join('\n')),

    md(`## 7. Experiment

Try modifying the scene in cell 3:
- Change sphere positions, colors, and reflectivity
- Adjust \`lightDir\` for different lighting angles
- Increase \`W\` and \`H\` for higher resolution (slower)
- Add more spheres to the array

Then re-run cells 3 → 5 to see the result.

---

### API Used in This Example

| Method | Purpose |
|--------|---------|
| \`Display.Canvas(w, h)\` | Creates a pixel buffer with live-updating image output |
| \`canvas.SetPixel(x, y, r, g, b)\` | Writes a pixel (double 0–1 or byte 0–255 overloads) |
| \`canvas.Flush()\` | Encodes the buffer to BMP and pushes the update |
| \`Display.ImageBytes(rgb, w, h)\` | One-shot: renders raw RGB bytes as an image |
| \`Display.NewImage(src)\` | Creates a live-updating image handle |
| \`handle.UpdateImage(src)\` | Updates the image in-place |
| \`handle.UpdateImageBytes(rgb, w, h)\` | Updates with raw RGB bytes |
| \`canvas.DrawLine(x0, y0, x1, y1, r, g, b)\` | Bresenham line drawing |
| \`canvas.DrawRect / FillRect(x, y, w, h, ...)\` | Rectangle outline / fill |
| \`canvas.DrawCircle / FillCircle(cx, cy, r, ...)\` | Circle outline / fill |
| \`canvas.ParallelRender((x, y) => (r, g, b))\` | Render all pixels using all CPU cores |
| \`canvas.RenderRows((x, y) => (r, g, b), flushEvery)\` | Sequential render with auto-flush for live preview |`),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 11 — Infographic Dashboard

function makeInfographicCells() {
  // Stat cards in a 4-column layout
  const stat1 = { ...cs(`Display.StatCard("Active Users", "12,847", color: "#569cd6", icon: "👥");`), columns: 4 };
  const stat2 = { ...cs(`Display.StatCard("Revenue", "$1.2M", color: "#4ec9b0", icon: "💰");`), columns: 4 };
  const stat3 = { ...cs(`Display.StatCard("Uptime", "99.97%", color: "#b48ead", icon: "⏱");`), columns: 4 };
  const stat4 = { ...cs(`Display.StatCard("Latency", "23ms", color: "#e0a040", icon: "⚡");`), columns: 4 };

  // Progress bars in 2 columns
  const prog1 = { ...cs(`Display.ProgressBar(78, "CPU Usage — 78%", color: "#569cd6");`), columns: 2 };
  const prog2 = { ...cs(`Display.ProgressBar(42, "Memory — 42%", color: "#4ec9b0");`), columns: 2 };
  const prog3 = { ...cs(`Display.ProgressBar(91, "Disk — 91%", color: "#e06070");`), columns: 2 };
  const prog4 = { ...cs(`Display.ProgressBar(15, "Network — 15%", color: "#e0a040");`), columns: 2 };

  // Charts in 2 columns
  const chart1 = { ...cs(`Display.Graph(new {
    type = "line",
    data = new {
        labels = new[] { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" },
        datasets = new[] {
            new { label = "Requests (k)", data = new[] { 12, 19, 15, 25, 22, 30, 28 },
                  borderColor = "#569cd6", backgroundColor = "rgba(86,156,214,0.1)", fill = true, tension = 0.4 },
            new { label = "Errors", data = new[] { 2, 1, 3, 1, 0, 2, 1 },
                  borderColor = "#e06070", backgroundColor = "rgba(224,96,112,0.1)", fill = true, tension = 0.4 },
        }
    },
    options = new { plugins = new { title = new { display = true, text = "Weekly Traffic" } } }
});`, 'graph'), columns: 2 };

  const chart2 = { ...cs(`Display.Graph(new {
    type = "doughnut",
    data = new {
        labels = new[] { "API", "Web", "Mobile", "Internal" },
        datasets = new[] {
            new { data = new[] { 45, 25, 20, 10 },
                  backgroundColor = new[] { "#569cd6", "#4ec9b0", "#e0a040", "#b48ead" },
                  borderWidth = 0 }
        }
    },
    options = new { plugins = new { title = new { display = true, text = "Traffic Sources" } } }
});`, 'graph'), columns: 2 };

  // Detail cards in 3 columns
  const card1 = { ...cs(`Display.Html(@"<div style='background:#1a1a22;border:1px solid #333;border-radius:8px;padding:16px;height:100%'>
  <div style='font-size:14px;font-weight:600;color:#569cd6;margin-bottom:10px'>🌐 API Gateway</div>
  <div style='font-size:12px;color:#aaa;line-height:1.6'>
    <div>Requests/sec: <span style=""color:#4ec9b0"">2,341</span></div>
    <div>P99 Latency: <span style=""color:#e0a040"">45ms</span></div>
    <div>Error Rate: <span style=""color:#4ec9b0"">0.02%</span></div>
    <div>Active Connections: <span style=""color:#569cd6"">847</span></div>
  </div>
</div>");`, 'html'), columns: 3 };

  const card2 = { ...cs(`Display.Html(@"<div style='background:#1a1a22;border:1px solid #333;border-radius:8px;padding:16px;height:100%'>
  <div style='font-size:14px;font-weight:600;color:#4ec9b0;margin-bottom:10px'>🗄 Database</div>
  <div style='font-size:12px;color:#aaa;line-height:1.6'>
    <div>Queries/sec: <span style=""color:#4ec9b0"">1,204</span></div>
    <div>Slow Queries: <span style=""color:#e06070"">3</span></div>
    <div>Connections: <span style=""color:#569cd6"">48/100</span></div>
    <div>Replication Lag: <span style=""color:#4ec9b0"">0.2s</span></div>
  </div>
</div>");`, 'html'), columns: 3 };

  const card3 = { ...cs(`Display.Html(@"<div style='background:#1a1a22;border:1px solid #333;border-radius:8px;padding:16px;height:100%'>
  <div style='font-size:14px;font-weight:600;color:#e0a040;margin-bottom:10px'>📦 Cache (Redis)</div>
  <div style='font-size:12px;color:#aaa;line-height:1.6'>
    <div>Hit Rate: <span style=""color:#4ec9b0"">94.7%</span></div>
    <div>Memory: <span style=""color:#e0a040"">2.1 GB / 4 GB</span></div>
    <div>Keys: <span style=""color:#569cd6"">142,391</span></div>
    <div>Evictions/hr: <span style=""color:#4ec9b0"">12</span></div>
  </div>
</div>");`, 'html'), columns: 3 };

  return [
    md(`# Infrastructure Dashboard

An infographic-style dashboard using **column layouts**, **stat cards**, **progress bars**, **charts**, and **marquees**. Run all cells to render the dashboard.

> **New features used:** \`Display.StatCard()\`, \`Display.ProgressBar()\`, \`Display.Marquee()\`, and the \`columns\` cell property for side-by-side layout.`),

    md('## Key Metrics'),
    stat1, stat2, stat3, stat4,

    cs(`Display.Marquee("  ●  SYSTEM STATUS: ALL SERVICES OPERATIONAL  ●  LAST DEPLOY: 2 hours ago  ●  NEXT MAINTENANCE WINDOW: Sunday 03:00 UTC  ●  ALERTS: 0 critical, 2 warning  ●  ", speed: 30, color: "#4ec9b0", background: "#0a0a12");`),

    md('## Resource Utilization'),
    prog1, prog2, prog3, prog4,

    md('## Traffic Overview'),
    chart1, chart2,

    md('## Service Health'),
    card1, card2, card3,

    cs(`// Render an activity timeline
Display.Html(@"<div style='border-left:2px solid #333;margin-left:12px;padding-left:16px'>
  <div style='position:relative;padding:8px 0'>
    <div style='position:absolute;left:-23px;top:10px;width:10px;height:10px;border-radius:50%;background:#4ec9b0'></div>
    <div style='color:#4ec9b0;font-size:11px;font-family:monospace'>14:32 UTC</div>
    <div style='color:#ddd;font-size:13px'>Auto-scaler added 2 instances to API cluster</div>
  </div>
  <div style='position:relative;padding:8px 0'>
    <div style='position:absolute;left:-23px;top:10px;width:10px;height:10px;border-radius:50%;background:#569cd6'></div>
    <div style='color:#569cd6;font-size:11px;font-family:monospace'>14:15 UTC</div>
    <div style='color:#ddd;font-size:13px'>Deployment v2.14.3 completed successfully</div>
  </div>
  <div style='position:relative;padding:8px 0'>
    <div style='position:absolute;left:-23px;top:10px;width:10px;height:10px;border-radius:50%;background:#e0a040'></div>
    <div style='color:#e0a040;font-size:11px;font-family:monospace'>13:58 UTC</div>
    <div style='color:#ddd;font-size:13px'>Cache hit rate dropped below 95% threshold — investigating</div>
  </div>
  <div style='position:relative;padding:8px 0'>
    <div style='position:absolute;left:-23px;top:10px;width:10px;height:10px;border-radius:50%;background:#b48ead'></div>
    <div style='color:#b48ead;font-size:11px;font-family:monospace'>13:30 UTC</div>
    <div style='color:#ddd;font-size:13px'>SSL certificate renewed for api.example.com (expires in 90 days)</div>
  </div>
</div>");`, 'html'),

    cs(`Display.Marquee("  📊  THROUGHPUT: 2,341 req/s  ●  P50: 12ms  ●  P95: 34ms  ●  P99: 45ms  ●  ERROR RATE: 0.02%  ●  CACHE HIT: 94.7%  ●  DB CONNECTIONS: 48/100  ●  ", speed: 35, color: "#569cd6", background: "#0a0a12");`),

    md(`## Column Layout Reference

Set the \`columns\` property on any cell to group consecutive cells with the same value into a CSS grid:

| Property | Effect |
|----------|--------|
| \`columns: 2\` | Two cells side-by-side |
| \`columns: 3\` | Three-column grid |
| \`columns: 4\` | Four-column grid |

### Display Helpers

| Method | Description |
|--------|-------------|
| \`Display.StatCard(label, value, color?, icon?)\` | Large-value card with label |
| \`Display.ProgressBar(percent, label?, color?)\` | Horizontal progress bar |
| \`Display.Marquee(text, speed?, color?, background?)\` | Scrolling text ticker |
| \`Display.Html(html)\` | Arbitrary HTML for custom layouts |

Combine these with column layouts to create rich dashboards and infographics.`),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 10 — Service Mesh (Docker + Mock APIs)

function makeServiceMeshCells() {
  // Docker cells in 3-column layout
  const gateway = { ...docker('nginx:alpine', {
    containerName: 'mesh-gateway', name: 'API Gateway', color: 'blue',
    ports: '8080:80', runOnStartup: true, presenting: true,
  }), columns: 3 };

  const redis = { ...docker('redis:7-alpine', {
    containerName: 'mesh-cache', name: 'Cache (Redis)', color: 'red',
    ports: '6379:6379', runOnStartup: true, presenting: true,
  }), columns: 3 };

  const postgres = { ...docker('postgres:16-alpine', {
    containerName: 'mesh-db', name: 'Database (Postgres)', color: 'purple',
    ports: '5432:5432', env: 'POSTGRES_USER=mesh, POSTGRES_PASSWORD=mesh123, POSTGRES_DB=meshdb',
    runOnStartup: true, presenting: true,
  }), columns: 3 };

  // Mock service cells in 3 columns
  const userSvc = { ...cs(`// User Service — CRUD mock on random port
var userPort = await Mock.StartAsync(new {
    id = "user-svc",
    title = "User Service",
    controllers = new[] { new {
        basePath = "/api/users",
        endpoints = new object[] {
            new { method = "GET", path = "",       summary = "List users",
                  mockResponse = new { status = 200, body = @"[{""id"":1,""name"":""Alice"",""email"":""alice@mesh.dev"",""role"":""admin""},{""id"":2,""name"":""Bob"",""email"":""bob@mesh.dev"",""role"":""user""},{""id"":3,""name"":""Carol"",""email"":""carol@mesh.dev"",""role"":""user""}]" } },
            new { method = "GET", path = "/{id}",  summary = "Get user",
                  mockResponse = new { status = 200, body = @"{""id"":{{id}},""name"":""Alice"",""email"":""alice@mesh.dev""}" } },
            new { method = "POST", path = "",      summary = "Create user",
                  mockResponse = new { status = 201, body = @"{""id"":4,""name"":""New User"",""created"":true}" } },
        }
    } }
});
Display.StatCard("User Service", $":{userPort}", color: "#4ec9b0", icon: "👤");`), columns: 3 };

  const orderSvc = { ...cs(`// Order Service — mock on random port
var orderPort = await Mock.StartAsync(new {
    id = "order-svc",
    title = "Order Service",
    controllers = new[] { new {
        basePath = "/api/orders",
        endpoints = new object[] {
            new { method = "GET", path = "",       summary = "List orders",
                  mockResponse = new { status = 200, body = @"[{""id"":1001,""userId"":2,""total"":148.99,""status"":""confirmed""},{""id"":1002,""userId"":1,""total"":79.99,""status"":""shipped""}]" } },
            new { method = "GET", path = "/{id}",  summary = "Get order",
                  mockResponse = new { status = 200, body = @"{""id"":{{id}},""userId"":2,""items"":[{""productId"":42,""qty"":1,""price"":79.99},{""productId"":17,""qty"":2,""price"":34.50}],""total"":148.99}" } },
            new { method = "POST", path = "",      summary = "Create order",
                  mockResponse = new { status = 201, body = @"{""id"":1003,""created"":true}" } },
        }
    } }
});
Display.StatCard("Order Service", $":{orderPort}", color: "#e0a040", icon: "📦");`), columns: 3 };

  const productSvc = { ...cs(`// Product Service — mock on random port
var productPort = await Mock.StartAsync(new {
    id = "product-svc",
    title = "Product Service",
    controllers = new[] { new {
        basePath = "/api/products",
        endpoints = new object[] {
            new { method = "GET", path = "",       summary = "List products",
                  mockResponse = new { status = 200, body = @"[{""id"":42,""name"":""Wireless Keyboard"",""price"":79.99,""stock"":150},{""id"":17,""name"":""USB-C Hub"",""price"":34.50,""stock"":89}]" } },
            new { method = "GET", path = "/{id}",  summary = "Get product",
                  mockResponse = new { status = 200, body = @"{""id"":{{id}},""name"":""Wireless Keyboard"",""price"":79.99,""stock"":150}" } },
        }
    } }
});
Display.StatCard("Product Service", $":{productPort}", color: "#c084d0", icon: "🛒");`), columns: 3 };

  // Health + sidebar in 2 columns
  const healthCheck = { ...cs(`// Verify all services are reachable
var endpoints = new[] {
    ("Gateway",  "http://localhost:8080"),
    ("User API", $"http://localhost:{userPort}/api/users"),
    ("Orders",   $"http://localhost:{orderPort}/api/orders"),
    ("Products", $"http://localhost:{productPort}/api/products"),
};

var sb = new System.Text.StringBuilder();
sb.AppendLine("<table style='width:100%;border-collapse:collapse'>");
sb.AppendLine("<tr style='border-bottom:1px solid #333'><th style='text-align:left;padding:6px 8px'>Service</th><th style='padding:6px 8px'>Status</th><th style='padding:6px 8px'>Latency</th></tr>");

foreach (var (name, url) in endpoints) {
    var sw = System.Diagnostics.Stopwatch.StartNew();
    bool ok = false;
    try {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var resp = await client.GetAsync(url);
        ok = resp.IsSuccessStatusCode;
    } catch { }
    sw.Stop();
    var color = ok ? "#4ec9b0" : "#e06070";
    var icon = ok ? "●" : "○";
    sb.AppendLine($"<tr><td style='padding:4px 8px'>{name}</td><td style='padding:4px 8px;color:{color};font-weight:600'>{icon} {(ok ? "Healthy" : "Down")}</td><td style='padding:4px 8px;color:#888;font-family:monospace'>{sw.ElapsedMilliseconds}ms</td></tr>");
}
sb.AppendLine("</table>");
Display.Html(sb.ToString());`, 'html'), columns: 2 };

  const healthNotes = { ...cs(`Display.Html(@"<div style='background:#111118;border:1px solid #333;border-radius:6px;padding:14px;font-size:12px;color:#aaa;line-height:1.7'>
<div style='color:#569cd6;font-weight:600;margin-bottom:8px'>📋 Health Check Notes</div>
<div>• The Gateway responds even without upstream config — nginx returns its default page</div>
<div>• Mock services start on random ports above 9000 and are assigned automatically</div>
<div>• Latency shown is round-trip from the kernel process, not end-user latency</div>
<div>• If a service shows as Down, run its cell above to start it</div>
<div style='margin-top:8px;color:#4ec9b0'>💡 <strong>Tip:</strong> Use <code>Mock.ListAsync()</code> to see all running mocks with their ports</div>
</div>");`, 'html'), columns: 2 };

  // Cross-service call + sidebar
  const crossCall = { ...cs(`// Simulate Order Service assembling an order from multiple services
using var http = new HttpClient();
var user = await http.GetStringAsync($"http://localhost:{userPort}/api/users/2");
var product1 = await http.GetStringAsync($"http://localhost:{productPort}/api/products/42");
var product2 = await http.GetStringAsync($"http://localhost:{productPort}/api/products/17");

var order = new {
    orderId = 1001,
    buyer = System.Text.Json.JsonSerializer.Deserialize<object>(user),
    items = new[] {
        System.Text.Json.JsonSerializer.Deserialize<object>(product1),
        System.Text.Json.JsonSerializer.Deserialize<object>(product2),
    },
    total = 148.99,
    status = "confirmed",
};
order.Display();`), columns: 2 };

  const crossNotes = { ...cs(`Display.Html(@"<div style='background:#111118;border:1px solid #333;border-radius:6px;padding:14px;font-size:12px;color:#aaa;line-height:1.7'>
<div style='color:#e0a040;font-weight:600;margin-bottom:8px'>🔗 Service Communication</div>
<div>This cell demonstrates the <strong>API composition</strong> pattern:</div>
<div style='margin:6px 0 6px 12px;font-family:monospace;font-size:11px;color:#888'>
Order Service → User Service (resolve buyer)<br/>
Order Service → Product Service × 2 (item details)<br/>
Order Service → assemble response
</div>
<div>In a real mesh, an Envoy/Istio sidecar proxies these calls, adding:</div>
<div>• Circuit breaking &amp; retries</div>
<div>• mTLS encryption</div>
<div>• Distributed tracing headers</div>
<div>• Load balancing across replicas</div>
</div>");`, 'html'), columns: 2 };

  return [
    md(`# Service Mesh Simulation

A fully automated **microservice mesh** using Docker containers for infrastructure, \`Mock\` API for services, and the new column layout. **Run All** to spin up everything.`),

    cs(`Display.Marquee("  🚀  SERVICE MESH DEMO  ●  Docker + Mock APIs + Column Layouts  ●  Run All to start  ●  ", speed: 25, color: "#569cd6", background: "#0a0a12");`),

    md('## Infrastructure — Docker Containers'),
    gateway, redis, postgres,

    md('## Mock API Services'),
    userSvc, orderSvc, productSvc,

    md('## Health Check'),
    healthCheck, healthNotes,

    md('## Cross-Service Communication'),
    crossCall, crossNotes,

    md('## Service Dashboard'),
    cs(`// Render live dashboard from running mocks
var mocks = await Mock.ListAsync();
var html = new System.Text.StringBuilder();
html.AppendLine("<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:10px'>");
foreach (var svc in mocks) {
    html.AppendLine($@"<div style='background:#1a1a22;border:1px solid #333;border-left:3px solid #4ec9b0;border-radius:6px;padding:12px'>
  <div style='font-weight:600;color:#4ec9b0;margin-bottom:4px'>{svc.Title}</div>
  <div style='font-size:11px;color:#888'>Mock API · <span style=""color:#4ec9b0"">:{svc.Port}</span></div>
</div>");
}

// Add Docker containers
foreach (var c in new[] { ("API Gateway", "8080", "#569cd6"), ("Redis Cache", "6379", "#e06070"), ("Postgres DB", "5432", "#b48ead") }) {
    var running = Docker.IsRunning($"mesh-{(c.Item1 == "API Gateway" ? "gateway" : c.Item1 == "Redis Cache" ? "cache" : "db")}");
    var status = running ? "Running" : "Stopped";
    var statusColor = running ? "#4ec9b0" : "#e06070";
    html.AppendLine($@"<div style='background:#1a1a22;border:1px solid #333;border-left:3px solid {c.Item3};border-radius:6px;padding:12px'>
  <div style='font-weight:600;color:{c.Item3};margin-bottom:4px'>{c.Item1}</div>
  <div style='font-size:11px;color:#888'>Docker · :{c.Item2} · <span style=""color:{statusColor}"">{status}</span></div>
</div>");
}
html.AppendLine("</div>");
Display.Html(html.ToString());`, 'html'),

    md('## Cleanup'),
    cs(`// Stop all mock servers and Docker containers in one call
await Mock.StopAllAsync();
Docker.StopAndRemove("mesh-gateway");
Docker.StopAndRemove("mesh-cache");
Docker.StopAndRemove("mesh-db");
Display.Html("<div style='color:#4ec9b0;font-weight:600'>✓ All services stopped and cleaned up.</div>");`),

    md(`---

### API Reference

| API | Description |
|-----|-------------|
| \`Mock.StartAsync(apiDef, port?)\` | Start a mock server, returns assigned port |
| \`Mock.StopAsync(id)\` | Stop a mock server by ID |
| \`Mock.StopAllAsync()\` | Stop all running mock servers |
| \`Mock.ListAsync()\` | List all running mocks (id, port, title) |
| \`Docker.Run(image, ...)\` | Start a container, returns ID |
| \`Docker.Stop(id)\` / \`Docker.Remove(id)\` | Stop / remove a container |
| \`Docker.StopAndRemove(id)\` | Stop + remove (ignores errors) |
| \`Docker.StopAllTracked()\` | Stop all session containers |
| \`Docker.IsRunning(id)\` | Check container status |
| \`Docker.List()\` | List all containers |

> **Tip:** Use **File → Export as Docker Compose…** to export infrastructure as a standalone \`docker-compose.yml\`.`),
  ];
}

export function createNotebook(templateKey = null) {
  return {
    id: uuidv4(),
    title: 'Untitled',
    path: null,
    isDirty: false,
    color: null,
    memoryHistory: [],
    cells: templateKey ? cellsForTemplate(templateKey) : [],
    outputs: {},
    cellResults: {},
    running: new Set(),
    kernelStatus: 'starting',
    nugetPackages: [],
    nugetSources: [...DEFAULT_NUGET_SOURCES],
    config: templateKey ? configForTemplate(templateKey) : [],
    logPanelOpen: false,
    nugetPanelOpen: false,
    configPanelOpen: false,
    attachedDbs: [],   // [{ connectionId, status, varName, schema, error }]
    dbPanelOpen: false,
    vars: [],
    varHistory: {},
    varsPanelOpen: false,
    tocPanelOpen: false,
    graphPanelOpen: false,
    todoPanelOpen: false,
    regexPanelOpen: false,
    historyPanelOpen: false,
    depsPanelOpen: false,
    embedPanelOpen: false,
    outputHistory: {},
    staleCellIds: [],
    autoRun: false,
    pipelines: [],
    embeddedFiles: [],
    retainedResults: {},
    breakpoints: {},
    debugState: null,
  };
}
