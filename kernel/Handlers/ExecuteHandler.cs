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
        ConfigContext.Current = new ConfigHelper(configDict);

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
        var interrupted = false;

        // Inject __ct__.ThrowIfCancellationRequested() into every loop body so
        // tight synchronous loops respond to Stop without killing the kernel.
        globals.__ct__ = execToken;
        var injectedCode = new CancellationCheckInjector()
            .Visit(CSharpSyntaxTree.ParseText(cleanCode,
                new CSharpParseOptions(LanguageVersion.Latest,
                    Microsoft.CodeAnalysis.DocumentationMode.None, Microsoft.CodeAnalysis.SourceCodeKind.Script))
                .GetRoot())!.ToFullString();

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

        var wasCancelled = !success && errorMessage == "Execution interrupted";
        realStdout.WriteLine(JsonSerializer.Serialize(new
        { type = "complete", id, success, cancelled = wasCancelled }));
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
