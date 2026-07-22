using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;

namespace SharpNoteKernel;

partial class Program
{
    // Compiled-script cache for watch/expression inspection. CSharpScript.EvaluateAsync
    // recompiles AND emits a fresh (non-collectible) assembly on every call, so a watch
    // that re-evaluates on each execution leaks an assembly per refresh. CSharpScript.Create
    // emits once; reusing the resulting Script across RunAsync calls avoids the repeated
    // emission (the documented workaround — see tasks/kernel-memory-redesign.md). This does
    // NOT apply to the main cell-execution path, which chains via ContinueWithAsync and so
    // recompiles against an ever-changing predecessor; that belongs to the custom-host redesign.
    private static readonly Dictionary<string, (ScriptOptions Opts, Script<object> Script)> _exprScriptCache = new();
    private const int MaxExprScriptCache = 64;

    /// <summary>Flushed on kernel reset (references and script state change wholesale).</summary>
    internal static void ClearExpressionScriptCache() => _exprScriptCache.Clear();

    // Returns a compiled Script for `expr`, reusing the cached one unless `options` (which is
    // reassigned only when metadata references change — NuGet load, reset) is a new instance.
    private static Script<object> GetOrCompileExpression(string expr, ScriptOptions options)
    {
        if (_exprScriptCache.TryGetValue(expr, out var entry) && ReferenceEquals(entry.Opts, options))
            return entry.Script;

        if (_exprScriptCache.Count >= MaxExprScriptCache && !_exprScriptCache.ContainsKey(expr))
            _exprScriptCache.Clear(); // bounded: watches are few; a flush caps the cache itself

        var compiled = CSharpScript.Create<object>(expr, options, typeof(ScriptGlobals));
        _exprScriptCache[expr] = (options, compiled);
        return compiled;
    }

    internal static async Task HandleVarInspect(JsonElement msg, ScriptOptions options, ScriptGlobals globals, TextWriter realStdout)
    {
        var name = msg.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
        var isExpression = msg.TryGetProperty("expression", out var exprProp) && exprProp.GetBoolean();
        // Display mode: render the value with the same inference as the .Display()
        // family (AutoDisplay → html / table / tree) instead of raw JSON. Used by
        // the per-cell variable inspector popups.
        var asDisplay = msg.TryGetProperty("display", out var dispProp) && dispProp.GetBoolean();

        if (name == null || script == null)
        {
            EmitInspectMiss(realStdout, name ?? "", asDisplay, isExpression);
            return;
        }

        // ── Resolve the value + its runtime type ──────────────────────────────
        object? value;
        string typeName;
        try
        {
            if (isExpression)
            {
                // Compile once per distinct expression, then re-run against current globals
                // for a fresh value — avoids emitting a new assembly on every watch refresh.
                var compiled = GetOrCompileExpression(name, options);
                value = (await compiled.RunAsync(globals)).ReturnValue;
                typeName = value?.GetType().Name ?? "null";
            }
            else
            {
                // LastOrDefault: re-running a cell re-declares its `var`s, so a name can
                // appear multiple times in script.Variables (shadowed). The last one is
                // the current binding — FirstOrDefault would return the stale original.
                var variable = script.Variables.LastOrDefault(v => v.Name == name);
                if (variable == null)
                {
                    EmitInspectMiss(realStdout, name, asDisplay, isExpression);
                    return;
                }
                value = variable.Value;
                typeName = variable.Type.Name;
            }
        }
        catch (Exception ex)
        {
            if (isExpression) _exprScriptCache.Remove(name); // don't retain a failing compilation
            EmitInspectError(realStdout, name, ex.Message, asDisplay, isExpression);
            return;
        }

        if (asDisplay)
        {
            EmitDisplayResult(realStdout, name, typeName, value, isExpression);
            return;
        }

        // ── Raw-JSON mode (existing var inspector dialog / Vars panel) ─────────
        string json;
        try
        {
            json = JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true, MaxDepth = 32 });
        }
        catch
        {
            json = value?.ToString() ?? "null";
        }

        lock (realStdout)
        {
            realStdout.WriteLine(JsonSerializer.Serialize(new
            {
                type = "var_inspect_result",
                name,
                typeName,
                json,
                expression = isExpression ? true : (bool?)null,
            }));
        }
    }

    /// <summary>
    /// Runs the value through <see cref="SharpNoteExtensions.AutoDisplay"/> — the same
    /// type-dispatch the .Display() family uses — captures the emitted display payload,
    /// and returns its { format, content } to the renderer.
    /// </summary>
    private static void EmitDisplayResult(TextWriter realStdout, string name, string typeName, object? value, bool isExpression)
    {
        string? format = null;
        JsonElement content = default;
        var hasContent = false;
        var isNull = value == null;

        if (!isNull)
        {
            try
            {
                var sw = new StringWriter();
                SharpNoteExtensions.AutoDisplay(new DisplayHelper(sw), value);
                var raw = sw.ToString().Trim();
                if (raw.Length > 0)
                {
                    // AutoDisplay emits a single {type:"display", format, content, …} line.
                    var firstLine = raw.Split('\n')[0];
                    using var doc = JsonDocument.Parse(firstLine);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("format", out var f)) format = f.GetString();
                    if (root.TryGetProperty("content", out var c)) { content = c.Clone(); hasContent = true; }
                }
            }
            catch
            {
                format = null;
                hasContent = false;
            }
        }

        lock (realStdout)
        {
            realStdout.WriteLine(JsonSerializer.Serialize(new
            {
                type = "var_display_result",
                name,
                typeName,
                format,
                content = hasContent ? (object?)content : null,
                isNull,
                expression = isExpression ? true : (bool?)null,
            }));
        }
    }

    private static void EmitInspectMiss(TextWriter realStdout, string name, bool asDisplay, bool isExpression)
    {
        lock (realStdout)
        {
            realStdout.WriteLine(asDisplay
                ? JsonSerializer.Serialize(new { type = "var_display_result", name, typeName = "", format = (string?)null, content = (object?)null, isNull = true, expression = isExpression ? true : (bool?)null })
                : JsonSerializer.Serialize(new { type = "var_inspect_result", name, typeName = "", json = "null", expression = isExpression ? true : (bool?)null }));
        }
    }

    private static void EmitInspectError(TextWriter realStdout, string name, string error, bool asDisplay, bool isExpression)
    {
        lock (realStdout)
        {
            realStdout.WriteLine(asDisplay
                ? JsonSerializer.Serialize(new { type = "var_display_result", name, typeName = "", format = (string?)null, content = (object?)null, isNull = true, error, expression = isExpression ? true : (bool?)null })
                : JsonSerializer.Serialize(new { type = "var_inspect_result", name, typeName = "", json = "null", error, expression = isExpression ? true : (bool?)null }));
        }
    }
}
