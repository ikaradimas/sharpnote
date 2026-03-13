using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;

// ── DisplayContext ───────────────────────────────────────────────────────────

public static class DisplayContext
{
    public static DisplayHelper? Current { get; internal set; }
}

// ── LogContext ────────────────────────────────────────────────────────────────

public static class LogContext
{
    internal static TextWriter? Output { get; set; }

    internal static void WriteNotebook(string message)
    {
        Output?.WriteLine(JsonSerializer.Serialize(new
        {
            type = "log",
            tag = "NOTEBOOK",
            message,
            timestamp = DateTime.UtcNow.ToString("O"),
        }));
    }
}

// ── ConfigContext ─────────────────────────────────────────────────────────────

public class ConfigHelper
{
    private readonly IReadOnlyDictionary<string, string> _values;

    public ConfigHelper(IReadOnlyDictionary<string, string> values) => _values = values;

    /// <summary>Returns the value for <paramref name="key"/>, or an empty string if not set.</summary>
    public string this[string key] => _values.TryGetValue(key, out var v) ? v : "";

    /// <summary>Returns the value for <paramref name="key"/>, or <paramref name="defaultValue"/> if not set.</summary>
    public string Get(string key, string defaultValue = "") =>
        _values.TryGetValue(key, out var v) ? v : defaultValue;

    /// <summary>Returns true if the key is present and non-empty.</summary>
    public bool Has(string key) => _values.ContainsKey(key) && !string.IsNullOrEmpty(_values[key]);

    /// <summary>All config entries as a read-only dictionary.</summary>
    public IReadOnlyDictionary<string, string> All => _values;

    public override string ToString() =>
        _values.Count == 0 ? "(empty)" : string.Join(", ", _values.Select(kv => $"{kv.Key}={kv.Value}"));
}

public static class ConfigContext
{
    public static ConfigHelper Current { get; internal set; } =
        new ConfigHelper(new Dictionary<string, string>());
}

// ── DisplayHandle ────────────────────────────────────────────────────────────

public class DisplayHandle
{
    private readonly DisplayHelper _display;
    public string HandleId { get; }

    internal DisplayHandle(DisplayHelper display, string handleId)
    {
        _display = display;
        HandleId = handleId;
    }

    public void UpdateHtml(string html) =>
        _display.SendUpdate("html", (object)html, HandleId);

    public void UpdateTable<T>(IEnumerable<T> rows)
    {
        var list = DisplayHelper.ToRowDicts(rows.Cast<object?>().ToList());
        _display.SendUpdate("table", (object)list, HandleId);
    }

    public void UpdateGraph(object config) =>
        _display.SendUpdate("graph", config, HandleId);

    public void Clear() =>
        _display.SendUpdate("html", (object)"", HandleId);
}

// ── Display helper ───────────────────────────────────────────────────────────

public class DisplayHelper
{
    private readonly TextWriter _out;
    private string? _currentId;

    public DisplayHelper(TextWriter output) => _out = output;

    public void SetCellId(string id) => _currentId = id;

    private void Send(object payload)
    {
        _out.WriteLine(JsonSerializer.Serialize(payload));
    }

    // ── One-shot display ─────────────────────────────────────────────────────

    public void Html(string html) =>
        Send(new { type = "display", id = _currentId, format = "html", content = (object)html });

    public void Table<T>(IEnumerable<T> rows)
    {
        var list = ToRowDicts(rows.Cast<object?>().ToList());
        Send(new { type = "display", id = _currentId, format = "table", content = (object)list });
    }

    public void TableFromDicts(IEnumerable<Dictionary<string, object?>> rows)
    {
        var list = rows.ToList();
        Send(new { type = "display", id = _currentId, format = "table", content = (object)list });
    }

    public void Csv(string csv) =>
        Send(new { type = "display", id = _currentId, format = "csv", content = (object)csv });

    public void Graph(object chartConfig) =>
        Send(new { type = "display", id = _currentId, format = "graph", content = chartConfig });

    // ── Updateable display handles ───────────────────────────────────────────

    public DisplayHandle NewHtml(string initialHtml)
    {
        var h = NewHandle();
        Send(new { type = "display", id = _currentId, format = "html",
                   content = (object)initialHtml, handleId = h.HandleId });
        return h;
    }

    public DisplayHandle NewTable<T>(IEnumerable<T> rows)
    {
        var h = NewHandle();
        var list = ToRowDicts(rows.Cast<object?>().ToList());
        Send(new { type = "display", id = _currentId, format = "table",
                   content = (object)list, handleId = h.HandleId });
        return h;
    }

    public DisplayHandle NewGraph(object chartConfig)
    {
        var h = NewHandle();
        Send(new { type = "display", id = _currentId, format = "graph",
                   content = chartConfig, handleId = h.HandleId });
        return h;
    }

    internal void SendUpdate(string format, object content, string handleId) =>
        Send(new { type = "display", id = _currentId, format, content, handleId, update = true });

    private DisplayHandle NewHandle() =>
        new(this, Guid.NewGuid().ToString("N")[..12]);

    internal static List<Dictionary<string, object?>> ToRowDicts(List<object?> items)
    {
        return items.Select(row =>
        {
            if (row == null) return new Dictionary<string, object?> { ["value"] = null };
            var dict = new Dictionary<string, object?>();
            foreach (var p in row.GetType().GetProperties())
                dict[p.Name] = p.GetValue(row);
            if (dict.Count == 0)
                dict["value"] = row.ToString();
            return dict;
        }).ToList();
    }
}

// ── Extension methods ────────────────────────────────────────────────────────

public static class PolyglotExtensions
{
    public static void Display(this object? obj)
    {
        var d = DisplayContext.Current;
        if (d == null) return;
        AutoDisplay(d, obj);
    }

    public static void DisplayTable<T>(this IEnumerable<T> rows)
    {
        var d = DisplayContext.Current;
        if (d == null) return;
        var dicts = DisplayHelper.ToRowDicts(rows.Cast<object?>().ToList());
        d.TableFromDicts(dicts);
    }

    public static void DisplayHtml(this string html)
    {
        DisplayContext.Current?.Html(html);
    }

    public static void DisplayCsv(this string csv)
    {
        DisplayContext.Current?.Csv(csv);
    }

    public static void DisplayGraph(this object chartConfig)
    {
        DisplayContext.Current?.Graph(chartConfig);
    }

    public static T Log<T>(this T obj, string? label = null)
    {
        var output = LogContext.Output;
        if (output != null)
        {
            string msg;
            if (obj == null)
                msg = "null";
            else if (obj is string s)
                msg = s;
            else if (obj.GetType().IsPrimitive || obj is decimal)
                msg = obj.ToString() ?? "";
            else
            {
                try { msg = JsonSerializer.Serialize(obj); }
                catch { msg = obj.ToString() ?? ""; }
            }

            output.WriteLine(JsonSerializer.Serialize(new
            {
                type = "log",
                tag = "USER",
                message = label != null ? $"{label}: {msg}" : msg,
                timestamp = DateTime.UtcNow.ToString("O"),
            }));
        }
        return obj;
    }

    internal static void AutoDisplay(DisplayHelper d, object? obj)
    {
        if (obj == null) return;

        if (obj is string s)
        {
            d.Html($"<pre>{System.Net.WebUtility.HtmlEncode(s)}</pre>");
            return;
        }

        if (obj is IEnumerable enumerable)
        {
            var items = enumerable.Cast<object?>().ToList();
            if (items.Count == 0)
            {
                d.Html("<pre>(empty)</pre>");
                return;
            }
            var first = items[0];
            if (first == null || first is string || first.GetType().IsPrimitive)
            {
                var rows = items.Select((v, i) => new Dictionary<string, object?> { ["index"] = i, ["value"] = v }).ToList();
                d.TableFromDicts(rows);
            }
            else
            {
                var dicts = DisplayHelper.ToRowDicts(items);
                d.TableFromDicts(dicts);
            }
            return;
        }

        if (obj.GetType().IsPrimitive || obj is decimal)
        {
            d.Html($"<pre>{obj}</pre>");
            return;
        }

        try
        {
            var json = JsonSerializer.Serialize(obj, new JsonSerializerOptions { WriteIndented = true });
            d.Html($"<pre>{System.Net.WebUtility.HtmlEncode(json)}</pre>");
        }
        catch
        {
            d.Html($"<pre>{System.Net.WebUtility.HtmlEncode(obj.ToString() ?? "")}</pre>");
        }
    }
}

// ── Script globals ───────────────────────────────────────────────────────────

public class ScriptGlobals
{
    public DisplayHelper Display { get; set; } = null!;
    public ConfigHelper Config => ConfigContext.Current;
}

// ── Kernel entry point ───────────────────────────────────────────────────────

class Program
{
    // Track loaded NuGet packages for the lifetime of this kernel process
    private static readonly HashSet<string> _loadedNugetKeys =
        new(StringComparer.OrdinalIgnoreCase);

    static async Task Main()
    {
        var realStdout = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
        Console.OutputEncoding = Encoding.UTF8;
        LogContext.Output = realStdout;

        var display = new DisplayHelper(realStdout);
        var globals = new ScriptGlobals { Display = display };

        var options = ScriptOptions.Default
            .AddImports(
                "System",
                "System.Collections",
                "System.Collections.Generic",
                "System.Linq",
                "System.Text",
                "System.IO",
                "System.Threading.Tasks",
                "System.Text.Json",
                "System.Net"
            )
            .AddReferences(
                typeof(object).Assembly,
                typeof(Enumerable).Assembly,
                typeof(System.Net.WebUtility).Assembly,
                typeof(DisplayHelper).Assembly
            );

        ScriptState<object?>? state = null;

        realStdout.WriteLine(JsonSerializer.Serialize(new { type = "ready" }));

        // ── Background memory reporter ───────────────────────────────────────
        var memCts = new System.Threading.CancellationTokenSource();
        _ = Task.Run(async () =>
        {
            var proc = Process.GetCurrentProcess();
            while (!memCts.Token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(3000, memCts.Token);
                    proc.Refresh();
                    var mb = Math.Round(proc.WorkingSet64 / (1024.0 * 1024.0), 1);
                    var json = JsonSerializer.Serialize(new { type = "memory_mb", mb });
                    lock (realStdout) { realStdout.WriteLine(json); }
                }
                catch (OperationCanceledException) { break; }
                catch { /* ignore transient errors */ }
            }
        });

        var stdin = new StreamReader(Console.OpenStandardInput());
        string? line;

        while ((line = await stdin.ReadLineAsync()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            JsonElement msg;
            try { msg = JsonSerializer.Deserialize<JsonElement>(line); }
            catch { continue; }

            var msgType = msg.GetProperty("type").GetString();

            switch (msgType)
            {
                case "execute":
                {
                    var id = msg.GetProperty("id").GetString()!;
                    var code = msg.GetProperty("code").GetString()!;
                    var outputMode = msg.TryGetProperty("outputMode", out var omProp)
                        ? omProp.GetString() ?? "auto"
                        : "auto";
                    var execSources = msg.TryGetProperty("sources", out var esProp)
                        ? esProp.EnumerateArray().Select(s => s.GetString()!).ToList()
                        : (List<string>?)null;

                    // ── Apply notebook config ────────────────────────────────
                    var configDict = new Dictionary<string, string>();
                    if (msg.TryGetProperty("config", out var cfgProp))
                        foreach (var entry in cfgProp.EnumerateObject())
                            configDict[entry.Name] = entry.Value.GetString() ?? "";
                    ConfigContext.Current = new ConfigHelper(configDict);

                    // ── Parse #r "nuget: ..." directives ────────────────────
                    var (cleanCode, nugetRefs) = ParseNugetDirectives(code);

                    bool success = true;
                    string? errorMessage = null;
                    string? stackTrace = null;

                    // Load any requested NuGet packages before running code
                    foreach (var (pkgId, pkgVer) in nugetRefs)
                    {
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        {
                            type = "stdout",
                            id,
                            content = $"📦 Installing {pkgId}{(pkgVer != null ? $" {pkgVer}" : " (latest)")}…"
                        }));
                        LogContext.WriteNotebook($"NuGet: Installing {pkgId}{(pkgVer != null ? $" {pkgVer}" : " (latest)")}");

                        var (updatedOptions, nugetError) =
                            await LoadNuGetAsync(pkgId, pkgVer, options, id, realStdout, execSources);

                        if (nugetError != null)
                        {
                            success = false;
                            errorMessage = nugetError;
                            LogContext.WriteNotebook($"NuGet: Failed {pkgId}: {nugetError}");
                            break;
                        }

                        options = updatedOptions;
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        {
                            type = "stdout",
                            id,
                            content = $"✓ {pkgId} loaded"
                        }));
                        LogContext.WriteNotebook($"NuGet: Loaded {pkgId}");
                    }

                    if (!success)
                    {
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        { type = "error", id, message = errorMessage, stackTrace = (string?)null }));
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        { type = "complete", id, success = false }));
                        break;
                    }

                    // If only #r directives and no real code, complete immediately
                    if (string.IsNullOrWhiteSpace(cleanCode))
                    {
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        { type = "complete", id, success = true }));
                        break;
                    }

                    display.SetCellId(id);
                    DisplayContext.Current = display;

                    var captureBuffer = new StringBuilder();
                    using var captureWriter = new StringWriter(captureBuffer);
                    Console.SetOut(captureWriter);

                    try
                    {
                        if (state == null)
                        {
                            state = await CSharpScript.RunAsync<object?>(
                                cleanCode, options, globals, typeof(ScriptGlobals));
                        }
                        else
                        {
                            state = await state.ContinueWithAsync<object?>(cleanCode, options);
                        }
                    }
                    catch (CompilationErrorException ex)
                    {
                        success = false;
                        errorMessage = string.Join("\n", ex.Diagnostics);
                    }
                    catch (Exception ex)
                    {
                        success = false;
                        errorMessage = ex.Message;
                        stackTrace = ex.StackTrace;
                    }
                    finally
                    {
                        Console.SetOut(realStdout);
                        DisplayContext.Current = null;
                    }

                    var captured = captureBuffer.ToString();
                    if (!string.IsNullOrEmpty(captured))
                    {
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        { type = "stdout", id, content = captured }));
                    }

                    if (success && state?.ReturnValue != null)
                    {
                        display.SetCellId(id);
                        RenderReturnValue(display, state.ReturnValue, outputMode, id, realStdout);
                    }

                    if (!success)
                    {
                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        { type = "error", id, message = errorMessage, stackTrace }));
                    }

                    realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "complete", id, success }));
                    break;
                }

                case "lint":
                {
                    var requestId = msg.GetProperty("requestId").GetString()!;
                    var lintCode  = msg.GetProperty("code").GetString()!;
                    var diags     = GetLintDiagnostics(lintCode);
                    realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "lint_result", requestId, diagnostics = diags }));
                    break;
                }

                case "autocomplete":
                {
                    var requestId = msg.GetProperty("requestId").GetString()!;
                    var acCode    = msg.GetProperty("code").GetString()!;
                    var acPos     = msg.GetProperty("position").GetInt32();
                    var items     = GetAutocompletions(acCode, acPos, state);
                    realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "autocomplete_result", requestId, items }));
                    break;
                }

                case "preload_nugets":
                {
                    var preloadSources = msg.TryGetProperty("sources", out var psProp)
                        ? psProp.EnumerateArray().Select(s => s.GetString()!).ToList()
                        : (List<string>?)null;
                    var pkgList = msg.GetProperty("packages").EnumerateArray().ToList();
                    foreach (var pkgEl in pkgList)
                    {
                        var pkgId  = pkgEl.GetProperty("id").GetString()!;
                        var pkgVer = pkgEl.TryGetProperty("version", out var vProp)
                            && vProp.ValueKind == JsonValueKind.String
                            ? vProp.GetString() : null;

                        realStdout.WriteLine(JsonSerializer.Serialize(new
                        { type = "nuget_status", id = pkgId, version = pkgVer, status = "loading" }));
                        LogContext.WriteNotebook($"NuGet preload: {pkgId} {pkgVer ?? "latest"}");

                        var (updatedOpts, nugetErr) =
                            await LoadNuGetAsync(pkgId, pkgVer, options, "__preload__", realStdout, preloadSources);

                        if (nugetErr != null)
                        {
                            realStdout.WriteLine(JsonSerializer.Serialize(new
                            { type = "nuget_status", id = pkgId, version = pkgVer,
                              status = "error", message = nugetErr }));
                            LogContext.WriteNotebook($"NuGet preload error: {pkgId}: {nugetErr}");
                        }
                        else
                        {
                            options = updatedOpts;
                            realStdout.WriteLine(JsonSerializer.Serialize(new
                            { type = "nuget_status", id = pkgId, version = pkgVer, status = "loaded" }));
                            LogContext.WriteNotebook($"NuGet preload loaded: {pkgId}");
                        }
                    }
                    realStdout.WriteLine(JsonSerializer.Serialize(new { type = "nuget_preload_complete" }));
                    break;
                }

                case "reset":
                {
                    state = null;
                    realStdout.WriteLine(JsonSerializer.Serialize(new { type = "reset_complete" }));
                    break;
                }

                case "exit":
                    memCts.Cancel();
                    return;
            }
        }
    }

    // ── C# keywords ─────────────────────────────────────────────────────────

    private static readonly string[] CSharpKeywords =
    {
        "abstract", "as", "async", "await", "base", "bool", "break", "byte",
        "case", "catch", "char", "checked", "class", "const", "continue",
        "decimal", "default", "delegate", "do", "double", "else", "enum",
        "event", "explicit", "extern", "false", "finally", "fixed", "float",
        "for", "foreach", "goto", "if", "implicit", "in", "int", "interface",
        "internal", "is", "lock", "long", "namespace", "new", "null", "object",
        "operator", "out", "override", "params", "private", "protected",
        "public", "readonly", "ref", "return", "sbyte", "sealed", "short",
        "sizeof", "stackalloc", "static", "string", "struct", "switch", "this",
        "throw", "true", "try", "typeof", "uint", "ulong", "unchecked",
        "unsafe", "ushort", "using", "var", "virtual", "void", "volatile", "while",
    };

    // Well-known static types for member completion
    private static readonly Dictionary<string, Type> WellKnownTypes =
        new(StringComparer.Ordinal)
        {
            ["Console"] = typeof(Console),
            ["Math"] = typeof(Math),
            ["Convert"] = typeof(Convert),
            ["String"] = typeof(string),
            ["string"] = typeof(string),
            ["int"] = typeof(int),
            ["double"] = typeof(double),
            ["Array"] = typeof(Array),
            ["Enumerable"] = typeof(Enumerable),
            ["File"] = typeof(System.IO.File),
            ["Directory"] = typeof(Directory),
            ["Path"] = typeof(System.IO.Path),
            ["Environment"] = typeof(Environment),
            ["DateTime"] = typeof(DateTime),
            ["TimeSpan"] = typeof(TimeSpan),
            ["Regex"] = typeof(Regex),
            ["JsonSerializer"] = typeof(JsonSerializer),
            ["Display"] = typeof(DisplayHelper),
        };

    // ── Lint handler ─────────────────────────────────────────────────────────

    static List<object> GetLintDiagnostics(string code)
    {
        try
        {
            var parseOptions = new CSharpParseOptions(
                LanguageVersion.Latest,
                DocumentationMode.None,
                SourceCodeKind.Script);
            var tree = CSharpSyntaxTree.ParseText(code, parseOptions);
            return tree.GetDiagnostics()
                .Where(d => d.Location.IsInSource && d.Severity >= DiagnosticSeverity.Warning)
                .Select(d => (object)new
                {
                    from = d.Location.SourceSpan.Start,
                    to   = d.Location.SourceSpan.End,
                    severity = d.Severity == DiagnosticSeverity.Error ? "error" : "warning",
                    message  = d.GetMessage(),
                })
                .ToList();
        }
        catch { return new List<object>(); }
    }

    // ── Autocomplete handler ─────────────────────────────────────────────────

    static List<object> GetAutocompletions(string code, int position, ScriptState<object?>? state)
    {
        var textBefore = position <= code.Length ? code[..position] : code;

        // Member access: "expr." or "expr.partial"
        var memberMatch = Regex.Match(textBefore, @"\b(\w+)\.(\w*)$");
        if (memberMatch.Success)
        {
            var objName = memberMatch.Groups[1].Value;
            var members = GetMembersForExpr(objName, state);
            if (members.Count > 0) return members;
        }

        // General context: keywords + state variables
        var items = new List<object>();
        foreach (var kw in CSharpKeywords)
            items.Add(new { label = kw, type = "keyword", detail = (string?)null });

        if (state != null)
        {
            foreach (var v in state.Variables)
            {
                items.Add(new
                {
                    label  = v.Name,
                    type   = "variable",
                    detail = v.Type?.Name,
                });
            }
        }

        return items;
    }

    static List<object> GetMembersForExpr(string name, ScriptState<object?>? state)
    {
        // Try live variable
        if (state != null)
        {
            var v = state.Variables.FirstOrDefault(
                x => string.Equals(x.Name, name, StringComparison.Ordinal));
            if (v?.Value != null)
                return ReflectMembers(v.Value.GetType(), isStatic: false);
        }

        // Try well-known static type
        if (WellKnownTypes.TryGetValue(name, out var type))
            return ReflectMembers(type, isStatic: true);

        return new List<object>();
    }

    static List<object> ReflectMembers(Type type, bool isStatic)
    {
        var flags = BindingFlags.Public |
                    (isStatic ? BindingFlags.Static : BindingFlags.Instance);
        var seen  = new HashSet<string>(StringComparer.Ordinal);
        var items = new List<object>();

        foreach (var m in type.GetMembers(flags))
        {
            if (m.Name.StartsWith('_') || !seen.Add(m.Name)) continue;

            var (kind, detail) = m switch
            {
                MethodInfo mi when !mi.IsSpecialName =>
                    ("function", mi.ReturnType.Name),
                PropertyInfo pi =>
                    ("property", pi.PropertyType.Name),
                FieldInfo fi =>
                    ("variable", fi.FieldType.Name),
                _ => ("", null)
            };

            if (kind == "") continue;
            items.Add(new { label = m.Name, type = kind, detail });
        }

        // LINQ extension methods for IEnumerable types
        if (!isStatic && typeof(IEnumerable).IsAssignableFrom(type))
        {
            foreach (var m in typeof(Enumerable)
                .GetMethods(BindingFlags.Public | BindingFlags.Static)
                .Where(m => !m.IsSpecialName && seen.Add(m.Name)))
            {
                items.Add(new { label = m.Name, type = "function", detail = "LINQ" });
            }
        }

        return items;
    }

    // ── #r "nuget: ..." parsing ──────────────────────────────────────────────

    private static (string cleanCode, List<(string id, string? version)> refs)
        ParseNugetDirectives(string code)
    {
        var refs = new List<(string, string?)>();
        var lines = code.Split('\n');
        var clean = new List<string>(lines.Length);

        foreach (var line in lines)
        {
            var m = Regex.Match(line.Trim(),
                @"^#r\s+""nuget:\s*([^,""\s]+?)(?:\s*,\s*([^""]+?))?\s*""",
                RegexOptions.IgnoreCase);
            if (m.Success)
            {
                refs.Add((m.Groups[1].Value.Trim(),
                          m.Groups[2].Success ? m.Groups[2].Value.Trim() : null));
                clean.Add(""); // preserve line numbers
            }
            else
            {
                clean.Add(line);
            }
        }

        return (string.Join('\n', clean), refs);
    }

    // ── NuGet package loader ─────────────────────────────────────────────────

    private static async Task<(ScriptOptions opts, string? error)> LoadNuGetAsync(
        string packageId, string? version, ScriptOptions options,
        string cellId, TextWriter realStdout, IEnumerable<string>? sourceUrls = null)
    {
        var key = $"{packageId.ToLower()}/{version ?? "*"}";
        if (_loadedNugetKeys.Contains(key)) return (options, null);

        var tempDir = Path.Combine(Path.GetTempPath(), $"pg_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            var verAttr = version != null ? $" Version=\"{version}\"" : "";
            await File.WriteAllTextAsync(Path.Combine(tempDir, "r.csproj"),
                $"""
                <Project Sdk="Microsoft.NET.Sdk">
                  <PropertyGroup>
                    <TargetFramework>net8.0</TargetFramework>
                    <ImplicitUsings>disable</ImplicitUsings>
                    <Nullable>disable</Nullable>
                  </PropertyGroup>
                  <ItemGroup>
                    <PackageReference Include="{packageId}"{verAttr} />
                  </ItemGroup>
                </Project>
                """);

            var srcArgs = sourceUrls?
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => $"--source \"{s}\"")
                .ToList() ?? new List<string>();
            var srcArgStr = srcArgs.Count > 0 ? " " + string.Join(" ", srcArgs) : "";

            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo("dotnet", $"restore r.csproj --nologo -v q{srcArgStr}")
                {
                    WorkingDirectory = tempDir,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                }
            };
            proc.Start();

            // Read stdout/stderr concurrently to avoid deadlock
            var stdoutTask = proc.StandardOutput.ReadToEndAsync();
            var stderrTask = proc.StandardError.ReadToEndAsync();
            await proc.WaitForExitAsync();
            var stderr = await stderrTask;
            await stdoutTask;

            if (proc.ExitCode != 0)
                return (options, $"NuGet restore failed for {packageId}: {stderr.Trim()}");

            var assetsPath = Path.Combine(tempDir, "obj", "project.assets.json");
            if (!File.Exists(assetsPath))
                return (options, $"NuGet restore did not produce assets file for {packageId}");

            var dlls = GetDllsFromAssets(assetsPath);
            foreach (var dll in dlls.Where(File.Exists))
            {
                try { options = options.AddReferences(Assembly.LoadFrom(dll)); }
                catch { /* skip unloadable assemblies */ }
            }

            _loadedNugetKeys.Add(key);
            return (options, null);
        }
        catch (Exception ex)
        {
            return (options, $"NuGet error: {ex.Message}");
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    // Parse project.assets.json and return all runtime DLL paths
    private static List<string> GetDllsFromAssets(string assetsPath)
    {
        var result = new List<string>();
        using var doc = JsonDocument.Parse(File.ReadAllText(assetsPath));
        var root = doc.RootElement;

        // Global packages folder (first key in packageFolders)
        string packageRoot = "";
        foreach (var folder in root.GetProperty("packageFolders").EnumerateObject())
        {
            packageRoot = folder.Name.TrimEnd('/', '\\', Path.DirectorySeparatorChar);
            break;
        }
        if (string.IsNullOrEmpty(packageRoot)) return result;

        var libraries = root.GetProperty("libraries");

        // Use the first (and only) target
        foreach (var target in root.GetProperty("targets").EnumerateObject())
        {
            foreach (var pkg in target.Value.EnumerateObject())
            {
                if (!libraries.TryGetProperty(pkg.Name, out var libInfo)) continue;
                if (!libInfo.TryGetProperty("path", out var pathEl)) continue;
                var libPath = pathEl.GetString()!;

                // Prefer runtime files; fall back to compile
                JsonElement files = default;
                bool found = pkg.Value.TryGetProperty("runtime", out files);
                if (!found) found = pkg.Value.TryGetProperty("compile", out files);
                if (!found) continue;

                foreach (var file in files.EnumerateObject())
                {
                    var rel = file.Name; // e.g. "lib/net6.0/Foo.dll"
                    if (rel == "_._") continue;
                    if (!rel.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)) continue;

                    var parts = new[] { packageRoot, libPath }
                        .Concat(rel.Split('/'))
                        .ToArray();
                    result.Add(Path.Combine(parts));
                }
            }
            break; // only first target
        }

        return result;
    }

    // ── Return value renderer ────────────────────────────────────────────────

    static void RenderReturnValue(DisplayHelper display, object rv, string outputMode,
        string id, TextWriter realStdout)
    {
        switch (outputMode)
        {
            case "text":
                realStdout.WriteLine(JsonSerializer.Serialize(new
                { type = "stdout", id, content = rv.ToString() ?? "" }));
                break;
            case "html":
                display.Html(rv.ToString() ?? "");
                break;
            case "table":
                if (rv is IEnumerable enumerable && rv is not string)
                {
                    var items = enumerable.Cast<object?>().ToList();
                    display.TableFromDicts(DisplayHelper.ToRowDicts(items));
                }
                else
                {
                    PolyglotExtensions.AutoDisplay(display, rv);
                }
                break;
            case "graph":
                display.Graph(rv);
                break;
            default: // "auto"
                PolyglotExtensions.AutoDisplay(display, rv);
                break;
        }
    }
}
