using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using PolyglotKernel;

namespace PolyglotKernel;

partial class Program
{
    // ── Lint handler ──────────────────────────────────────────────────────────

    internal static void HandleLint(JsonElement msg, TextWriter realStdout)
    {
        var requestId = msg.GetProperty("requestId").GetString()!;
        var lintCode  = msg.GetProperty("code").GetString()!;
        var diags     = GetLintDiagnostics(lintCode);
        realStdout.WriteLine(JsonSerializer.Serialize(new
        { type = "lint_result", requestId, diagnostics = diags }));
    }

    internal static List<object> GetLintDiagnostics(string code)
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
}
