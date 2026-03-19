using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.Scripting;
using PolyglotKernel;

namespace PolyglotKernel;

partial class Program
{
    // ── reset handler ─────────────────────────────────────────────────────────

    internal static async Task HandleReset(
        ScriptOptions options,
        ScriptGlobals globals,
        TextWriter realStdout)
    {
        script = null;
        foreach (var info in attachedDbs.Values)
        {
            try { await InjectDbContextAsync(info, options, globals); }
            catch { /* best-effort; kernel was reset */ }
        }
        realStdout.WriteLine(JsonSerializer.Serialize(new { type = "reset_complete" }));
    }
}
