using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace SharpNoteKernel;

partial class Program
{
    internal static async Task HandleFormat(JsonElement msg, TextWriter realStdout)
    {
        var requestId = msg.GetProperty("requestId").GetString()!;
        var code      = msg.GetProperty("code").GetString()!;

        // Strip #r nuget directives — the workspace already has loaded package
        // references; leaving the directives causes spurious parse errors.
        var (cleanCode, nugetRefs) = ParseNugetDirectives(code);

        var (formatted, diagnostics) = await _workspaceManager.FormatCodeAsync(cleanCode);

        // Re-prepend #r directives so they aren't lost from the cell
        if (nugetRefs.Count > 0)
        {
            var directives = string.Join("\n", nugetRefs.Select(r =>
                r.Item2 != null ? $"#r \"nuget: {r.Item1}, {r.Item2}\"" : $"#r \"nuget: {r.Item1}\""));
            formatted = directives + "\n" + formatted;
        }

        var diags = diagnostics
            .Select(d => new { from = d.From, to = d.To, severity = d.Severity, message = d.Message })
            .ToList();

        realStdout.WriteLine(JsonSerializer.Serialize(new
        { type = "format_result", requestId, formatted, diagnostics = diags }));
    }
}
