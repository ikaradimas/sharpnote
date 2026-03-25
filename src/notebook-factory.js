import { v4 as uuidv4 } from 'uuid';

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId() {
  return Math.random().toString(36).slice(2, 10); // 8-char base-36
}

export function makeCell(type = 'code', content = '') {
  return { id: shortId(), type, content, ...(type === 'code' ? { outputMode: 'auto', locked: false } : {}) };
}

// ── NuGet default sources ─────────────────────────────────────────────────────

export const DEFAULT_NUGET_SOURCES = [
  { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
];

// ── Example notebook cells ────────────────────────────────────────────────────

function makeExampleCells() {
  const md = (content) => makeCell('markdown', content);
  const cs = (content, outputMode = 'auto') =>
    ({ ...makeCell('code', content), outputMode });

  return [
    md(`# Notebook

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
| Database | Attach via **DB** panel or \`Db.Add\` / \`Db.Attach\` → \`mydb.Users.ToList()\` |
| Panels | \`Panels.Open/Close/CloseAll(PanelId.*)\` · \`Panels.Dock/Float\` |
| Util | \`obj.Dump()\` · \`Util.Time()\` · \`Util.Dif()\` · \`Util.HorizontalRun()\` · \`Util.Cache()\` · \`Util.ConfirmAsync()\` |
| Auto-render | Return a value — type is detected automatically |`),

    md('## 1 · Basic C#'),

    cs(`// Variables, interpolation, LINQ
var name = "SharpNote";
var version = 1.0;
Console.WriteLine($"Hello from {name} v{version}!");

var numbers = Enumerable.Range(1, 10).ToList();
var evens   = numbers.Where(n => n % 2 == 0).ToList();
Console.WriteLine($"Evens: {string.Join(", ", evens)}");

// Returning a value auto-renders it
DateTime.Now`),

    md('## 2 · HTML & Tables'),

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

    md('## 3 · Extension Methods'),

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

    md(`## 4 · NuGet Packages

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

    md('## 5 · Charts'),

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

    md('## 6 · CSV'),

    cs(`// Parse and render CSV inline
Display.Csv("Name,Score,Grade\\nAlice,95,A\\nBob,82,B\\nCharlie,78,C+\\nDiana,91,A-");`),

    md(`## 7 · Live Updates

\`Display.NewHtml()\`, \`NewTable()\`, and \`NewGraph()\` return a **handle** whose \`Update*\` methods
replace the output in-place while the cell is still running — useful for progress indicators,
streaming results, and live charts.`),

    cs(`// Animated progress bar
string Bar(int pct) => $@"<div style='font-family:sans-serif;padding:2px 0'>
  <div style='background:#3c3c3c;border-radius:3px;height:16px'>
    <div style='background:#0e639c;height:16px;border-radius:3px;width:{pct}%;transition:width 0.1s'></div>
  </div>
  <p style='color:#888;font-size:11px;margin:3px 0 0'>{pct}%</p>
</div>";

var progress = Display.NewHtml(Bar(0));
for (int i = 1; i <= 20; i++) {
    await Task.Delay(80);
    progress.UpdateHtml(Bar(i * 5));
}
progress.UpdateHtml("<span style='color:#4ec9b0;font-weight:600'>✓ Complete!</span>");`),

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

    md(`## 8 · Logging

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

    md(`## 9 · Notebook Configuration

Use the **Config** panel (toolbar) to define key/value pairs that become available to all scripts in the notebook via the \`Config\` global.

This is useful for environment-specific settings (URLs, feature flags, credentials) without hard-coding them in cells.

| Expression | Result |
|------------|--------|
| \`Config["Key"]\` | Value string, or \`""\` if missing |
| \`Config.Get("Key", "default")\` | Value with fallback |
| \`Config.Has("Key")\` | \`true\` if key exists and non-empty |
| \`Config.All\` | \`IReadOnlyDictionary<string,string>\` |

Config is persisted in the \`.cnb\` file alongside packages and sources.`),

    cs(`// Read config values (try editing them in the Config panel first)
var env     = Config.Get("Environment", "development");
var baseUrl = Config.Get("ApiBaseUrl", "(not set)");
var missing = Config.Get("NonExistent", "fallback value");

Display.Html($@"
<table style='border-collapse:collapse;font-size:12px'>
  <tr><th style='padding:4px 12px;text-align:left;color:#4fc3f7'>Key</th>
      <th style='padding:4px 12px;text-align:left;color:#4fc3f7'>Value</th></tr>
  <tr><td style='padding:3px 12px'>Environment</td><td style='padding:3px 12px;color:#00e5cc'>{env}</td></tr>
  <tr><td style='padding:3px 12px'>ApiBaseUrl</td><td style='padding:3px 12px;color:#00e5cc'>{baseUrl}</td></tr>
  <tr><td style='padding:3px 12px'>NonExistent</td><td style='padding:3px 12px;color:#555'>{missing}</td></tr>
  <tr><td style='padding:3px 12px;color:#555'>All entries</td><td style='padding:3px 12px;color:#555'>{Config.All.Count} defined</td></tr>
</table>");`),

    md(`## 10 · Databases

There are two ways to connect a database to a notebook:

**Via the DB panel** — click **+ Add** to register a connection, then **Attach** to connect it. The kernel introspects the schema and injects a typed \`DbContext\` variable. The variable name is derived from the connection name (e.g. *"My CRM"* → \`myCrm\`).

**From code** — use the \`Db\` global to register and attach connections programmatically (see the in-memory example below):

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
| Add connection | \`await Db.AddAsync(name, provider, connStr)\` — throws if name already exists |
| Async | \`await mydb.Orders.ToListAsync()\` |`),

    md(`### 10a · In-memory SQLite from code

\`Db.Add\` + \`Db.Attach\` register and connect a database without touching the DB panel.
\`Db.Attach\` triggers schema introspection via a round-trip to the renderer, so the injected
variable (\`scratch\`) is available to the **next** cell, not the one that called \`Attach\`.

**Run the setup cell first, then run the query cell.**`),

    cs(`// ── Step 1: register and attach ──────────────────────────────────────────────
// Run this cell once. The 'scratch' DbContext will be ready for the next cell.

await Db.AddAsync("scratch", DbProvider.SqliteMemory, "");
Db.Attach("scratch");   // triggers schema introspection; 'scratch' available next cell

Display.Html("<p style='color:#4ec9b0'>Setup sent — run the query cell below.</p>");`),

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

    md(`## 11 · Shared State & Records

All cells in a notebook share a single execution context — types, variables, and \`using\`
directives defined in one cell are available in every cell that runs afterwards.`),

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

    md(`## 12 · Async & HTTP

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

    md('## 13 · More Chart Types'),

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

    md(`## 14 · Modern C#

Pattern matching, switch expressions, list patterns, and the range operator all work
out of the box — Roslyn scripting targets C# 12.`),

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

    md(`## 15 · Diagrams (Mermaid)

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

    md(`## 16 · Math Formulas (KaTeX)

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

    md(`## 17 · Interactive Widgets

Widgets are live UI controls rendered inline in cell output. Their values **persist across re-runs** — changing a slider and pressing Run reads the new position.

| Widget | Kernel API |
|--------|-----------|
| Slider | \`Display.Slider(label, min, max, step, defaultValue)\` |
| Dropdown | \`Display.Dropdown(label, options[], defaultValue)\` |
| Date Picker | \`Display.DatePicker(label, defaultValue)\` |

All three return a \`WidgetHandle\` with implicit conversions to \`double\`, \`int\`, \`float\`, and \`string\`.`),

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

    md(`## 18 · Display.Markdown

\`Display.Markdown(text)\` renders rich markdown from C# code — including **Mermaid diagrams** and **KaTeX math**.
Useful for generating dynamic documentation, reports, or structured output.`),

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

    md(`## 19 · Live Graph with Display.Plot

\`Display.Plot(name, value)\` pushes a data point to the **Graph panel** immediately — no need to wait for the cell to finish.

| Mode | Description |
|------|-------------|
| \`PlotMode.Value\` | Plot the raw value *(default)* |
| \`PlotMode.RateOfChange\` | Plot the change since the last call |

Open the **Graph panel** (Ctrl+Shift+R), then run the cell below to see both series update in real time.`),

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

    md(`## 20 · Panels Layout API

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

    md(`## 21 · Util — LinqPAD Utilities

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

    cs(`// .Dump() — LinqPAD-compatible alias for .Display()
"LinqPAD users feel right at home!".Dump();

// Arrays auto-render as tables
new[] {
  new { Name = "Alice", Score = 95, Grade = "A"  },
  new { Name = "Bob",   Score = 82, Grade = "B+" },
  new { Name = "Carol", Score = 78, Grade = "C+" },
}.Dump("exam results");     // try clicking the column headers to sort`),

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

    cs(`// Util.Dif — line-by-line diff between two values
// Great for comparing config snapshots, JSON payloads, or any two objects.

var before = new { Name = "Alice", Score = 85, Status = "pending",  Tags = new[] { "new" } };
var after  = new { Name = "Alice", Score = 92, Status = "approved", Tags = new[] { "new", "verified" } };

Util.Dif(before, after, "before", "after");`),

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

    cs(`// Util.Highlight — draw attention to important output
var health = new { Status = "Healthy", Latency = "12ms", Uptime = "99.9%", Errors = 0 };
Util.Highlight(health, "#4ec9b0");         // teal — all good

var warning = new { Status = "Degraded", Latency = "340ms", Uptime = "97.2%", Errors = 14 };
Util.Highlight(warning, "#f4b246");        // amber — attention needed`),

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

    cs(`// Util.Cmd — run a shell command and display the output
// The result is also returned as a string for further processing.

Util.Cmd("dotnet", "--version");`),

    cs(`// Util.ConfirmAsync — pause execution and ask the user before continuing.
// The cell awaits the user's click; OK returns true, Cancel returns false.
// Great for guarding destructive operations in an interactive notebook.

if (await Util.ConfirmAsync("Proceed with the operation?", "Confirm"))
{
    "✓ User confirmed — running operation.".Display();
}
else
{
    "✕ Cancelled by user.".Display();
}`),
  ];
}

// ── Notebook factory ──────────────────────────────────────────────────────────

export function createNotebook(withExamples = false) {
  return {
    id: uuidv4(),
    title: 'Untitled',
    path: null,
    isDirty: false,
    color: null,
    memoryHistory: [],
    cells: withExamples ? makeExampleCells() : [],
    outputs: {},
    cellResults: {},
    running: new Set(),
    kernelStatus: 'starting',
    nugetPackages: [],
    nugetSources: [...DEFAULT_NUGET_SOURCES],
    config: [],
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
    outputHistory: {},
    staleCellIds: [],
  };
}
