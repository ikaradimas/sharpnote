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

    md('### Line Chart — Revenue vs Costs'),

    cs(`// Return a Chart.js config object — set output mode to "graph"
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
}`, 'graph'),

    md('### Doughnut Chart'),

    cs(`// Doughnut — category share
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
}`, 'graph'),

    md('### Scatter Chart'),

    cs(`// Scatter — correlation between two variables
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
}`, 'graph'),

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

    md('### Step 1 — Register and Attach'),

    cs(`// ── Step 1: register and attach ──────────────────────────────────────────────
// Run this cell once. The 'scratch' DbContext will be ready for the next cell.

await Db.AddAsync("scratch", DbProvider.SqliteMemory, "");
Db.Attach("scratch");   // triggers schema introspection; 'scratch' available next cell

Display.Html("<p style='color:#4ec9b0'>Setup sent — run the query cell below.</p>");`),

    md('### Step 2 — Create Schema, Insert, and Query'),

    cs(`// ── Step 2: create schema, insert, and query ─────────────────────────────────
// Run after the setup cell above has completed.

scratch.Database.ExecuteSqlRaw(@"
    CREATE TABLE IF NOT EXISTS Orders (
        Id      INTEGER PRIMARY KEY,
        Product TEXT    NOT NULL,
        Qty     INTEGER NOT NULL,
        Price   REAL    NOT NULL
    )");
scratch.Database.ExecuteSqlRaw(@"
    INSERT INTO Orders VALUES
        (1, 'Widget A', 3,  9.99),
        (2, 'Widget B', 1, 24.99),
        (3, 'Widget A', 7,  9.99),
        (4, 'Gadget',   2, 49.99)");

record Order(long Id, string Product, int Qty, double Price);
var orders = scratch.Database
    .SqlQueryRaw<Order>("SELECT Id, Product, Qty, Price FROM Orders ORDER BY Id")
    .ToList();

Display.Table(orders);

// LINQ aggregation
orders
    .GroupBy(o => o.Product)
    .Select(g => new {
        Product = g.Key,
        Units   = g.Sum(o => o.Qty),
        Revenue = Math.Round(g.Sum(o => o.Qty * o.Price), 2),
    })
    .OrderByDescending(s => s.Revenue)
    .DisplayTable();

// Clean up
Db.Detach("scratch");
Db.Remove("scratch");`),

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
| \`Docker.Stop(nameOrId)\` | Stop a running container |
| \`Docker.Remove(nameOrId)\` | Remove a container |
| \`Docker.Exec(nameOrId, cmd)\` | Run a command inside a container |
| \`Docker.IsRunning(nameOrId)\` | Check if running |
| \`Docker.List()\` | List all containers |`),

    cs(`// ── Docker example (uncomment if Docker is available) ────────────────────────
// var id = Docker.Run("redis:7", name: "demo-redis",
//     ports: new() { ["6379"] = "6379" });
// Console.WriteLine($"Started: {id[..12]}");
// Docker.IsRunning("demo-redis").Display();
// Docker.Stop("demo-redis");
// Docker.Remove("demo-redis");

Docker.List().DisplayTable();  // List running containers`),
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

  return [
    md(`# Cell Orchestration

This template demonstrates the **cell orchestration** features — named cells, colors,
decision branching, and the interactive dependency graph.

## How to use

1. Open the **Dependencies** panel (Tools → Dependencies, or **Ctrl+Shift+Y**)
2. Run the cells below — the graph will light up with execution status
3. **Click a node** in the graph to run it, **double-click** to navigate
4. **Right-click** a node for: *Run with deps*, *Run downstream*, *Add to pipeline*
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
Open the Dependencies panel to see the edge from *Load Orders* → *Compute Stats*.`),

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

Open the Dependencies panel and use the **Pipelines** section at the bottom:

1. Click **+ Select** to enter selection mode
2. Click nodes in the graph to add them to the pipeline
3. Name it and click **✓** to save
4. Click **▶** to run the pipeline — cells execute in dependency order

### Orchestration Execution Modes

| Mode | What it does |
|------|-------------|
| **Click node** | Runs that single cell |
| **Run with deps** | Runs all upstream cells first, then the target |
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
    outputHistory: {},
    staleCellIds: [],
    autoRun: false,
    pipelines: [],
    breakpoints: {},
    debugState: null,
  };
}
