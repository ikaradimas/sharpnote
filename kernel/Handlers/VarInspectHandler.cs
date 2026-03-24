using System;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace SharpNoteKernel;

partial class Program
{
    internal static void HandleVarInspect(JsonElement msg, TextWriter realStdout)
    {
        var name = msg.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;

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
