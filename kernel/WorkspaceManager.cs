using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;

namespace SharpNoteKernel;

// ── WorkspaceManager (spike) ──────────────────────────────────────────────────
//
// Validates that Roslyn's CompletionService and semantic diagnostics work for
// C# script-mode documents with injected globals.  This will be promoted to a
// production class in Step 2 once the spike confirms correctness.

public sealed class WorkspaceManager : IDisposable
{
    // Preamble injected before every user script so the workspace sees the same
    // globals (Display, Db, …) that the script execution engine exposes.
    private static readonly string GlobalsPreamble =
        "DisplayHelper Display = default!;\n" +
        "PanelsHelper Panels = default!;\n" +
        "DbHelper Db = default!;\n" +
        "ConfigHelper Config = default!;\n" +
        "UtilHelper Util = default!;\n" +
        "System.Threading.CancellationToken __ct__ = default;\n";

    private static readonly int PreambleLength = GlobalsPreamble.Length;

    private readonly AdhocWorkspace _workspace;
    private readonly DocumentId _docId;

    public WorkspaceManager()
    {
        // MefHostServices wires up completion providers, diagnostic analyzers, etc.
        // DefaultAssemblies covers Workspaces.Common, CSharp.Workspaces,
        // Features, and CSharp.Features — all needed for CompletionService.
        var host = MefHostServices.Create(MefHostServices.DefaultAssemblies);
        _workspace = new AdhocWorkspace(host);

        var projectId = ProjectId.CreateNewId();
        _docId = DocumentId.CreateNewId(projectId);

        var parseOptions = new CSharpParseOptions(
            LanguageVersion.Latest,
            DocumentationMode.None,
            SourceCodeKind.Script);

        var compilationOptions = new CSharpCompilationOptions(
            OutputKind.DynamicallyLinkedLibrary,
            allowUnsafe: true,
            usings: new[]
            {
                "System",
                "System.Collections",
                "System.Collections.Generic",
                "System.Linq",
                "System.Text",
                "System.IO",
                "System.Threading.Tasks",
                "System.Text.Json",
                "System.Net",
                "SharpNoteKernel",
                "Microsoft.EntityFrameworkCore",
            });

        var projectInfo = ProjectInfo.Create(
            projectId,
            VersionStamp.Create(),
            "SharpNoteScript",
            "SharpNoteScript",
            LanguageNames.CSharp,
            parseOptions: parseOptions,
            compilationOptions: compilationOptions,
            metadataReferences: BuildMetadataReferences());

        _workspace.AddProject(projectInfo);

        _workspace.AddDocument(DocumentInfo.Create(
            _docId,
            "script.csx",
            sourceCodeKind: SourceCodeKind.Script,
            loader: TextLoader.From(TextAndVersion.Create(
                SourceText.From(GlobalsPreamble), VersionStamp.Create()))));
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /// <summary>
    /// Replaces the script document text.  Must be called before
    /// <see cref="GetCompletionsAsync"/> or <see cref="GetDiagnosticsAsync"/>.
    /// </summary>
    public void UpdateDocument(string code)
    {
        var text = SourceText.From(GlobalsPreamble + code);
        var solution = _workspace.CurrentSolution.WithDocumentText(_docId, text);
        _workspace.TryApplyChanges(solution);
    }

    /// <summary>
    /// Returns completions at <paramref name="position"/> within <paramref name="code"/>
    /// (position is relative to the start of user code, not the preamble).
    /// </summary>
    public async Task<IReadOnlyList<CompletionItem>> GetCompletionsAsync(string code, int position)
    {
        UpdateDocument(code);
        var doc     = _workspace.CurrentSolution.GetDocument(_docId)!;
        var service = CompletionService.GetService(doc);
        if (service == null) return Array.Empty<CompletionItem>();

        var result = await service.GetCompletionsAsync(doc, PreambleLength + position);
        return result?.ItemsList ?? (IReadOnlyList<CompletionItem>)Array.Empty<CompletionItem>();
    }

    /// <summary>
    /// Returns semantic diagnostics for <paramref name="code"/>.
    /// Spans in returned diagnostics are relative to the start of user code.
    /// </summary>
    public async Task<IReadOnlyList<(int From, int To, string Severity, string Message)>> GetDiagnosticsAsync(string code)
    {
        UpdateDocument(code);
        var doc   = _workspace.CurrentSolution.GetDocument(_docId)!;
        var model = await doc.GetSemanticModelAsync();
        if (model == null) return Array.Empty<(int, int, string, string)>();

        return model.GetDiagnostics()
            .Where(d =>
                d.Location.IsInSource &&
                d.Severity >= DiagnosticSeverity.Warning &&
                d.Location.SourceSpan.Start >= PreambleLength)
            .Select(d => (
                From:     d.Location.SourceSpan.Start - PreambleLength,
                To:       d.Location.SourceSpan.End   - PreambleLength,
                Severity: d.Severity == DiagnosticSeverity.Error ? "error" : "warning",
                Message:  d.GetMessage()))
            .ToList();
    }

    public void Dispose() => _workspace.Dispose();

    // ── Reference builder ─────────────────────────────────────────────────────

    private static IEnumerable<MetadataReference> BuildMetadataReferences()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var refs = new List<MetadataReference>();

        void TryAdd(string path)
        {
            if (!string.IsNullOrEmpty(path) && File.Exists(path) && seen.Add(path))
            {
                try { refs.Add(MetadataReference.CreateFromFile(path)); } catch { }
            }
        }

        // All .NET platform assemblies (covers System.*, Microsoft.Extensions.*, etc.)
        var tpa = AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string;
        if (tpa != null)
            foreach (var path in tpa.Split(Path.PathSeparator))
                TryAdd(path);

        // Kernel assembly — contains DisplayHelper, DbHelper, PanelsHelper, etc.
        TryAdd(typeof(DisplayHelper).Assembly.Location);

        // EF Core (kernel imports Microsoft.EntityFrameworkCore)
        TryAdd(typeof(Microsoft.EntityFrameworkCore.DbContext).Assembly.Location);
        TryAdd(typeof(Microsoft.EntityFrameworkCore.RelationalDatabaseFacadeExtensions).Assembly.Location);

        return refs;
    }
}
