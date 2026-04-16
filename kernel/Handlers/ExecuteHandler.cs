using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using SharpNoteKernel;
using SharpNoteKernel.Db;

namespace SharpNoteKernel;

partial class Program
{
    internal static async Task HandleExecute(
        JsonElement msg,
        ScriptOptions options,
        ScriptGlobals globals,
        DisplayHelper display,
        TextWriter realStdout,
        Action<ScriptOptions> setOptions)
    {
        var id = msg.GetProperty("id").GetString()!;
        CurrentCellId = id;
        var code = msg.GetProperty("code").GetString()!;
        var outputMode = msg.TryGetProperty("outputMode", out var omProp)
            ? omProp.GetString() ?? "auto"
            : "auto";
        var execSources = msg.TryGetProperty("sources", out var esProp)
            ? esProp.EnumerateArray().Select(s => s.GetString()!).ToList()
            : (System.Collections.Generic.List<string>?)null;

        // ── Apply notebook config ─────────────────────────────────────────────
        var configDict = new System.Collections.Generic.Dictionary<string, string>();
        if (msg.TryGetProperty("config", out var cfgProp))
            foreach (var entry in cfgProp.EnumerateObject())
                configDict[entry.Name] = entry.Value.GetString() ?? "";
        ConfigContext.Current = new ConfigHelper(configDict, realStdout);

        // ── Parse #r "nuget: ..." directives ──────────────────────────────────
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

            var (updatedOptions, nugetError, _) =
                await LoadNuGetAsync(pkgId, pkgVer, options, id, realStdout, execSources);

            if (nugetError != null)
            {
                success = false;
                errorMessage = nugetError;
                LogContext.WriteNotebook($"NuGet: Failed {pkgId}: {nugetError}");
                break;
            }

            options = updatedOptions;
            setOptions(options);
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
            return;
        }

        // If only #r directives and no real code, complete immediately
        if (string.IsNullOrWhiteSpace(cleanCode))
        {
            realStdout.WriteLine(JsonSerializer.Serialize(new
            { type = "complete", id, success = true }));
            return;
        }

        display.SetCellId(id);
        DisplayContext.Current = display;

        var captureBuffer = new StringBuilder();
        using var captureWriter = new StringWriter(captureBuffer);
        Console.SetOut(captureWriter);

        var effectiveOptions = options.AddReferences(dbMetaRefs);
        _execCts = new CancellationTokenSource();
        var execToken = _execCts.Token;
        UtilContext.Current.SetCancellationToken(execToken);
        globals.Mock.SetCancellationToken(execToken);
        var interrupted = false;

        // Inject FormData variable when the execute message contains form submission data.
        if (msg.TryGetProperty("formData", out var formDataProp) && formDataProp.ValueKind == JsonValueKind.Object)
        {
            var sb = new StringBuilder();
            sb.AppendLine("var FormData = new System.Collections.Generic.Dictionary<string, object> {");
            foreach (var entry in formDataProp.EnumerateObject())
            {
                var val = entry.Value.ValueKind switch
                {
                    JsonValueKind.String => $"\"{entry.Value.GetString()!.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"",
                    JsonValueKind.Number => entry.Value.GetRawText(),
                    JsonValueKind.True   => "true",
                    JsonValueKind.False  => "false",
                    _                    => $"\"{entry.Value.GetRawText().Replace("\\", "\\\\").Replace("\"", "\\\"")}\"",
                };
                sb.AppendLine($"    [\"{entry.Name}\"] = (object){val},");
            }
            sb.AppendLine("};");
            cleanCode = sb.ToString() + cleanCode;
        }

        // Strip trailing semicolon from the final expression statement so Roslyn
        // captures its return value (e.g. `DateTime.Compare(a,b);` → displays the int).
        cleanCode = TrimFinalExprSemicolon(cleanCode);

        // ── Parse optional breakpoints for debugging ─────────────────────────
        var breakpointLines = new System.Collections.Generic.List<int>();
        if (msg.TryGetProperty("breakpoints", out var bpProp) && bpProp.ValueKind == JsonValueKind.Array)
            foreach (var bp in bpProp.EnumerateArray())
                if (bp.TryGetInt32(out var bpLine))
                    breakpointLines.Add(bpLine);

        var debugActive = breakpointLines.Count > 0;

        // Create DebugContext — provides __dbg__.Check(line) for pause/resume/step.
        // Always assigned so injected code compiles, but Check() is a no-op when no
        // breakpoints are set and not stepping.
        var debugCtx = new DebugContext(
            realStdout, id, execToken, breakpointLines,
            () => script?.Variables
                .Where(v => !v.Name.StartsWith("<"))
                .Select(v => (object)new {
                    name = v.Name,
                    typeName = v.Type.Name,
                    value = SafeToString(v.Value, v.Type.Name),
                })
                .ToList() ?? new System.Collections.Generic.List<object>());
        globals.__dbg__ = debugCtx;
        _currentDebugCtx = debugCtx;

        // Inject __ct__.ThrowIfCancellationRequested() into every loop body so
        // tight synchronous loops respond to Stop without killing the kernel.
        globals.__ct__ = execToken;
        var parseOpts = new CSharpParseOptions(LanguageVersion.Latest,
            Microsoft.CodeAnalysis.DocumentationMode.None, Microsoft.CodeAnalysis.SourceCodeKind.Script);
        var injectedCode = new CancellationCheckInjector()
            .Visit(CSharpSyntaxTree.ParseText(cleanCode, parseOpts).GetRoot())!
            .ToFullString();

        // When breakpoints are set, also inject __dbg__.Check(line) before every
        // statement so DebugContext can pause execution at breakpoints.
        if (debugActive)
        {
            var debugTree = CSharpSyntaxTree.ParseText(injectedCode, parseOpts);
            var debugRoot = (Microsoft.CodeAnalysis.CSharp.Syntax.CompilationUnitSyntax)debugTree.GetRoot();
            injectedCode = new DebugCheckInjector(lineOffset: 0)
                .Rewrite(debugRoot).ToFullString();
        }

        try
        {
            // WaitAsync handles async operations (await points); the injected checks
            // handle synchronous tight loops — together they cover all cases.
            Task<ScriptState<object?>> scriptTask = script == null
                ? CSharpScript.RunAsync<object?>(injectedCode, effectiveOptions, globals, typeof(ScriptGlobals))
                : script.ContinueWithAsync<object?>(injectedCode, effectiveOptions);
            script = await scriptTask.WaitAsync(execToken);
        }
        catch (OperationCanceledException) when (execToken.IsCancellationRequested)
        {
            interrupted = true;
            success = false;
            errorMessage = "Execution interrupted";
            // script left as-is
        }
        catch (Microsoft.CodeAnalysis.Scripting.CompilationErrorException ex)
        {
            success = false;
            errorMessage = string.Join("\n", ex.Diagnostics);
            // Send structured diagnostics with positions for inline display
            var inlineDiags = ex.Diagnostics
                .Where(d => d.Location.IsInSource)
                .Select(d => {
                    var span = d.Location.GetLineSpan();
                    return new {
                        line    = span.StartLinePosition.Line + 1,
                        col     = span.StartLinePosition.Character + 1,
                        endLine = span.EndLinePosition.Line + 1,
                        endCol  = span.EndLinePosition.Character + 1,
                        severity = d.Severity == Microsoft.CodeAnalysis.DiagnosticSeverity.Error ? "error" : "warning",
                        message  = d.GetMessage(),
                        code     = d.Id,
                    };
                })
                .ToList();
            if (inlineDiags.Count > 0)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                { type = "inline_diagnostics", id, diagnostics = inlineDiags }));
            }
        }
        catch (Exception ex)
        {
            success = false;
            errorMessage = ex.Message;
            stackTrace = ex.StackTrace;
        }
        finally
        {
            // If interrupted the orphaned script task may still be running; redirect
            // Console.Out to Null so it cannot corrupt the JSON protocol.
            Console.SetOut(interrupted ? TextWriter.Null : realStdout);
            DisplayContext.Current = null;
            _execCts = null;
            _currentDebugCtx = null;
        }

        var captured = captureBuffer.ToString();
        if (!string.IsNullOrEmpty(captured))
        {
            realStdout.WriteLine(JsonSerializer.Serialize(new
            { type = "stdout", id, content = captured }));
        }

        if (success && script?.ReturnValue != null)
        {
            display.SetCellId(id);
            RenderReturnValue(display, script.ReturnValue, outputMode, id, realStdout);
        }

        if (!success && errorMessage != "Execution interrupted")
        {
            realStdout.WriteLine(JsonSerializer.Serialize(new
            { type = "error", id, message = errorMessage, stackTrace }));
        }

        if (success && script != null)
        {
            // Append executed code to workspace so subsequent cells' LSP diagnostics
            // can resolve types, records, and variables defined here.
            _workspaceManager.AppendExecutedCode(cleanCode);

            var vars = script.Variables
                .Where(v => !v.Name.StartsWith("<"))
                .Select(v => new {
                    name         = v.Name,
                    typeName     = v.Type.Name,
                    fullTypeName = v.Type.FullName ?? v.Type.Name,
                    value        = SafeToString(v.Value, v.Type.Name),
                    isNull       = v.Value == null,
                })
                .ToList();
            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "vars_update", vars }));
        }

        CurrentCellId = null;
        var wasCancelled = !success && errorMessage == "Execution interrupted";
        realStdout.WriteLine(JsonSerializer.Serialize(new
        { type = "complete", id, success, cancelled = wasCancelled }));
    }

    // Strip the semicolon from the last expression statement so the script
    // captures its return value.  Only fires when the final top-level statement
    // is an expression statement (method call, comparison, etc.) — assignments,
    // declarations, and control-flow are left untouched.
    private static string TrimFinalExprSemicolon(string code)
    {
        var tree = CSharpSyntaxTree.ParseText(code,
            new CSharpParseOptions(LanguageVersion.Latest,
                Microsoft.CodeAnalysis.DocumentationMode.None,
                Microsoft.CodeAnalysis.SourceCodeKind.Script));
        var root = tree.GetRoot();

        var last = root.ChildNodes()
            .OfType<Microsoft.CodeAnalysis.CSharp.Syntax.GlobalStatementSyntax>()
            .LastOrDefault();
        if (last?.Statement is Microsoft.CodeAnalysis.CSharp.Syntax.ExpressionStatementSyntax exprStmt)
        {
            var semi = exprStmt.SemicolonToken;
            if (!semi.IsMissing)
                return code[..semi.SpanStart] + code[semi.Span.End..];
        }

        return code;
    }

    // Safe ToString for variable inspector
    internal static string SafeToString(object? value, string typeName)
    {
        if (value == null) return "null";
        try { var s = value.ToString() ?? ""; return s.Length > 120 ? s[..120] + "…" : s; }
        catch { return $"<{typeName}>"; }
    }

    // ── Return value renderer ─────────────────────────────────────────────────

    internal static void RenderReturnValue(DisplayHelper display, object rv, string outputMode,
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
                    SharpNoteExtensions.AutoDisplay(display, rv);
                }
                break;
            case "graph":
                display.Graph(rv);
                break;
            default: // "auto"
                SharpNoteExtensions.AutoDisplay(display, rv);
                break;
        }
    }
}
