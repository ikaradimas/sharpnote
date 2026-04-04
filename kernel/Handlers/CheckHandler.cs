using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using SharpNoteKernel;

namespace SharpNoteKernel;

partial class Program
{
    internal static async Task HandleExecuteCheck(
        JsonElement msg,
        ScriptOptions options,
        ScriptGlobals globals,
        TextWriter realStdout)
    {
        var cellId     = msg.TryGetProperty("id",         out var cid)  ? cid.GetString()  : null;
        var expression = msg.TryGetProperty("expression",  out var exp)  ? exp.GetString()  : "";
        var label      = msg.TryGetProperty("label",       out var lbl)  ? lbl.GetString()  : "";

        // Apply notebook config
        var configDict = new Dictionary<string, string>();
        if (msg.TryGetProperty("config", out var cfgProp))
            foreach (var entry in cfgProp.EnumerateObject())
                configDict[entry.Name] = entry.Value.GetString() ?? "";
        ConfigContext.Current = new ConfigHelper(configDict, realStdout);

        CurrentCellId = cellId;
        globals.Display.SetCellId(cellId ?? "");
        DisplayContext.Current = globals.Display;

        try
        {
            if (string.IsNullOrWhiteSpace(expression))
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "check_result", id = cellId,
                    passed = false, label, message = "No expression provided",
                }));
                realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = true }));
                return;
            }

            // Wrap expression in a bool cast and evaluate
            var code = $"(bool)({expression})";
            var opts = options.AddReferences(dbMetaRefs);

            if (script == null)
                script = await CSharpScript.RunAsync<object?>(code, opts, globals, typeof(ScriptGlobals));
            else
                script = await script.ContinueWithAsync<object?>(code, opts);

            var passed = script.ReturnValue is true;

            // Build a human-readable message from the expression result
            var message = passed ? "passed" : "failed";
            try
            {
                // Try to evaluate the expression without the bool cast to get the raw value
                var rawScript = await script.ContinueWithAsync<object?>(expression, opts);
                var rawVal = rawScript.ReturnValue;
                if (rawVal != null) message = $"{rawVal}";
            }
            catch { /* ignore — just use passed/failed */ }

            realStdout.WriteLine(JsonSerializer.Serialize(new
            {
                type = "check_result", id = cellId,
                passed, label, message,
            }));
            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = true }));
        }
        catch (Exception ex)
        {
            var inner = ex is AggregateException agg ? agg.InnerException ?? ex : ex;
            // Check failures are not errors — they're failed checks
            realStdout.WriteLine(JsonSerializer.Serialize(new
            {
                type = "check_result", id = cellId,
                passed = false, label,
                message = inner.Message,
            }));
            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = true }));
        }
        finally
        {
            CurrentCellId = null;
            DisplayContext.Current = null;
        }
    }
}
