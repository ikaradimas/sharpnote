using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace SharpNoteKernel;

partial class Program
{
    internal static async Task HandleLint(JsonElement msg, TextWriter realStdout)
    {
        var requestId = msg.GetProperty("requestId").GetString()!;
        var code      = msg.GetProperty("code").GetString()!;

        _workspaceManager.UpdateDocument(code);
        var diagnostics = await _workspaceManager.GetDiagnosticsAsync();

        var diags = diagnostics
            .Select(d => new { from = d.From, to = d.To, severity = d.Severity, message = d.Message })
            .ToList();

        realStdout.WriteLine(JsonSerializer.Serialize(new
        { type = "lint_result", requestId, diagnostics = diags }));
    }
}
