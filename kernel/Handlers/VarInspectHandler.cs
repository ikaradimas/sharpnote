using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;

namespace SharpNoteKernel;

partial class Program
{
    internal static async Task HandleVarInspect(JsonElement msg, ScriptOptions options, ScriptGlobals globals, TextWriter realStdout)
    {
        var name = msg.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
        var isExpression = msg.TryGetProperty("expression", out var exprProp) && exprProp.GetBoolean();

        if (name == null || script == null)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "var_inspect_result",
                    name = name ?? "",
                    typeName = "",
                    json = "null",
                }));
            }
            return;
        }

        // Expression evaluation mode — evaluate arbitrary C# expression
        if (isExpression)
        {
            try
            {
                var result = await CSharpScript.EvaluateAsync<object>(name, options, globals);
                string exprJson;
                string exprType;
                try
                {
                    exprJson = JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true, MaxDepth = 32 });
                    exprType = result?.GetType().Name ?? "null";
                }
                catch
                {
                    exprJson = result?.ToString() ?? "null";
                    exprType = result?.GetType().Name ?? "null";
                }
                lock (realStdout)
                {
                    realStdout.WriteLine(JsonSerializer.Serialize(new
                    {
                        type = "var_inspect_result",
                        name,
                        typeName = exprType,
                        json = exprJson,
                        expression = true,
                    }));
                }
            }
            catch (Exception ex)
            {
                lock (realStdout)
                {
                    realStdout.WriteLine(JsonSerializer.Serialize(new
                    {
                        type = "var_inspect_result",
                        name,
                        typeName = "",
                        json = "null",
                        error = ex.Message,
                        expression = true,
                    }));
                }
            }
            return;
        }

        var variable = script.Variables.FirstOrDefault(v => v.Name == name);
        if (variable == null)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                {
                    type = "var_inspect_result",
                    name,
                    typeName = "",
                    json = "null",
                }));
            }
            return;
        }

        string json;
        try
        {
            json = JsonSerializer.Serialize(variable.Value, new JsonSerializerOptions
            {
                WriteIndented = true,
                MaxDepth = 32,
            });
        }
        catch
        {
            json = variable.Value?.ToString() ?? "null";
        }

        lock (realStdout)
        {
            realStdout.WriteLine(JsonSerializer.Serialize(new
            {
                type = "var_inspect_result",
                name,
                typeName = variable.Type.Name,
                json,
            }));
        }
    }
}
