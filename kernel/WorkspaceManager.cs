using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Tags;
using Microsoft.CodeAnalysis.Text;

namespace SharpNoteKernel;

// ── Data transfer objects ─────────────────────────────────────────────────────

public record CompletionItemData(string Label, string Kind, string? Detail);

public record DiagnosticData(int From, int To, string Severity, string Message);

public record ParameterData(string Label);

public record SignatureData(string Label, IReadOnlyList<ParameterData> Parameters);

public record SignatureHelpData(IReadOnlyList<SignatureData> Signatures, int ActiveParameter)
{
    public static readonly SignatureHelpData Empty =
        new(Array.Empty<SignatureData>(), 0);
}

// ── WorkspaceManager ──────────────────────────────────────────────────────────
//
// Keeps an AdhocWorkspace in sync with the kernel's script state.
// One instance is created per kernel process and shared across all handlers.
// Call UpdateDocument() before querying completions, diagnostics, or
// signature help.  Call UpdateReferences() after each NuGet load.

public sealed class WorkspaceManager : IDisposable
{
    // Preamble is derived from ScriptGlobals via reflection so the workspace
    // always mirrors the actual script execution environment.
    private static readonly string GlobalsPreamble = BuildGlobalsPreamble();

    // Dynamic declarations appended after GlobalsPreamble (e.g. attached DB variables).
    private string _dynamicPreamble = "";
    private int TotalPreambleLength => GlobalsPreamble.Length + _dynamicPreamble.Length;

    private readonly AdhocWorkspace _workspace;
    private readonly ProjectId      _projectId;
    private readonly DocumentId     _docId;

    public WorkspaceManager()
    {
        // MefHostServices wires up completion providers, diagnostic analyzers, etc.
        var host = MefHostServices.Create(MefHostServices.DefaultAssemblies);
        _workspace = new AdhocWorkspace(host);

        _projectId = ProjectId.CreateNewId();
        _docId     = DocumentId.CreateNewId(_projectId);

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
            _projectId,
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
    /// Replaces the script document text.  Must be called before querying
    /// completions, diagnostics, or signature help.
    /// </summary>
    public void UpdateDocument(string code)
    {
        var text     = SourceText.From(GlobalsPreamble + _dynamicPreamble + code);
        var solution = _workspace.CurrentSolution.WithDocumentText(_docId, text);
        _workspace.TryApplyChanges(solution);
    }

    /// <summary>
    /// Replaces the dynamic preamble segment (variable declarations for attached DBs, etc.).
    /// Call after any DB connect or disconnect.
    /// </summary>
    public void SetDynamicPreamble(string declarations)
    {
        _dynamicPreamble = declarations;
    }

    /// <summary>
    /// Adds new metadata references (e.g. after a NuGet package loads).
    /// References already present, identified by file path, are skipped.
    /// </summary>
    public void UpdateReferences(IEnumerable<MetadataReference> refs)
    {
        var project = _workspace.CurrentSolution.GetProject(_projectId)!;
        var existing = project.MetadataReferences
            .OfType<PortableExecutableReference>()
            .Select(r => r.FilePath)
            .Where(p => p != null)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var solution = _workspace.CurrentSolution;
        var changed  = false;
        foreach (var r in refs.OfType<PortableExecutableReference>())
        {
            if (r.FilePath != null && existing.Add(r.FilePath))
            {
                solution = solution.AddMetadataReference(_projectId, r);
                changed  = true;
            }
        }

        if (changed)
            _workspace.TryApplyChanges(solution);
    }

    /// <summary>
    /// Returns completions at <paramref name="position"/> within the current
    /// document (position is relative to the start of user code, not the preamble).
    /// Call <see cref="UpdateDocument"/> first.
    /// </summary>
    public async Task<IReadOnlyList<CompletionItemData>> GetCompletionsAsync(int position)
    {
        var doc     = _workspace.CurrentSolution.GetDocument(_docId)!;
        var service = CompletionService.GetService(doc);
        if (service == null) return Array.Empty<CompletionItemData>();

        var result = await service.GetCompletionsAsync(doc, TotalPreambleLength + position);
        if (result?.ItemsList == null) return Array.Empty<CompletionItemData>();

        return result.ItemsList
            .Select(item => new CompletionItemData(
                item.DisplayText,
                MapCompletionTags(item.Tags),
                item.InlineDescription.Length > 0 ? item.InlineDescription : null))
            .ToList();
    }

    /// <summary>
    /// Returns semantic diagnostics for the current document.
    /// Spans in the returned records are relative to the start of user code.
    /// Call <see cref="UpdateDocument"/> first.
    /// </summary>
    public async Task<IReadOnlyList<DiagnosticData>> GetDiagnosticsAsync()
    {
        var doc   = _workspace.CurrentSolution.GetDocument(_docId)!;
        var model = await doc.GetSemanticModelAsync();
        if (model == null) return Array.Empty<DiagnosticData>();

        return model.GetDiagnostics()
            .Where(d =>
                d.Location.IsInSource &&
                d.Severity >= DiagnosticSeverity.Warning &&
                d.Location.SourceSpan.Start >= TotalPreambleLength)
            .Select(d => new DiagnosticData(
                d.Location.SourceSpan.Start - TotalPreambleLength,
                d.Location.SourceSpan.End   - TotalPreambleLength,
                d.Severity == DiagnosticSeverity.Error ? "error" : "warning",
                d.GetMessage()))
            .ToList();
    }

    /// <summary>
    /// Returns signature help at <paramref name="position"/> within the current
    /// document (position is relative to the start of user code, not the preamble).
    /// Call <see cref="UpdateDocument"/> first.
    /// </summary>
    public async Task<SignatureHelpData> GetSignatureHelpAsync(int position)
    {
        var doc   = _workspace.CurrentSolution.GetDocument(_docId)!;
        var root  = await doc.GetSyntaxRootAsync();
        var model = await doc.GetSemanticModelAsync();
        if (root == null || model == null) return SignatureHelpData.Empty;

        var adjustedPos = Math.Clamp(TotalPreambleLength + position, 0, root.FullSpan.End - 1);
        var token       = root.FindToken(adjustedPos);

        var argList = token.Parent?
            .AncestorsAndSelf()
            .OfType<ArgumentListSyntax>()
            .FirstOrDefault();

        if (argList?.Parent is not InvocationExpressionSyntax invocation)
            return SignatureHelpData.Empty;

        // Count completed arguments before the cursor to determine active parameter
        var activeParam = argList.Arguments
            .TakeWhile(a => a.Span.End < adjustedPos)
            .Count();

        var symbolInfo = model.GetSymbolInfo(invocation.Expression);
        var symbols    = symbolInfo.Symbol != null
            ? (IEnumerable<ISymbol>)new[] { symbolInfo.Symbol }
            : symbolInfo.CandidateSymbols;
        var methods    = symbols.OfType<IMethodSymbol>().ToList();

        // Expand to all public overloads from the containing type
        if (methods.Count >= 1 && methods[0].ContainingType != null)
        {
            methods = methods[0].ContainingType
                .GetMembers(methods[0].Name)
                .OfType<IMethodSymbol>()
                .Where(m => m.DeclaredAccessibility == Accessibility.Public)
                .OrderBy(m => m.Parameters.Length)
                .ToList();
        }

        if (methods.Count == 0) return SignatureHelpData.Empty;

        var fmt = SymbolDisplayFormat.MinimallyQualifiedFormat;
        var signatures = methods.Select(m =>
        {
            var parms = m.Parameters
                .Select(p => new ParameterData(
                    $"{p.Type.ToDisplayString(fmt)} {p.Name}"))
                .ToList<ParameterData>();
            var paramStr = string.Join(", ", parms.Select(p => p.Label));
            var label    = $"{m.Name}({paramStr}): {m.ReturnType.ToDisplayString(fmt)}";
            return new SignatureData(label, parms);
        }).ToList();

        return new SignatureHelpData(signatures, activeParam);
    }

    public void Dispose() => _workspace.Dispose();

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Generates the globals preamble by reflecting on <see cref="ScriptGlobals"/>
    /// so the workspace always mirrors the actual script execution environment.
    /// </summary>
    private static string BuildGlobalsPreamble()
    {
        var sb = new StringBuilder();
        foreach (var prop in typeof(ScriptGlobals)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            var t        = prop.PropertyType;
            // Use short name for kernel-internal types; fully-qualified name for everything else
            var typeName = t.Namespace == "SharpNoteKernel" ? t.Name : (t.FullName ?? t.Name);
            var init     = t.IsValueType ? "default" : "default!";
            sb.AppendLine($"{typeName} {prop.Name} = {init};");
        }
        return sb.ToString();
    }

    private static string MapCompletionTags(ImmutableArray<string> tags)
    {
        if (tags.Contains(WellKnownTags.Method))      return "function";
        if (tags.Contains(WellKnownTags.Property))    return "property";
        if (tags.Contains(WellKnownTags.Field))       return "variable";
        if (tags.Contains(WellKnownTags.Class))       return "class";
        if (tags.Contains(WellKnownTags.Interface))   return "interface";
        if (tags.Contains(WellKnownTags.Enum))        return "enum";
        if (tags.Contains(WellKnownTags.EnumMember))  return "enum";
        if (tags.Contains(WellKnownTags.Keyword))     return "keyword";
        if (tags.Contains(WellKnownTags.Namespace))   return "namespace";
        if (tags.Contains(WellKnownTags.Local))       return "variable";
        if (tags.Contains(WellKnownTags.Constant))    return "constant";
        if (tags.Contains(WellKnownTags.Structure))   return "class";
        if (tags.Contains(WellKnownTags.Delegate))    return "class";
        if (tags.Contains(WellKnownTags.Event))       return "variable";
        return "text";
    }

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

        // All .NET platform assemblies
        var tpa = AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string;
        if (tpa != null)
            foreach (var path in tpa.Split(Path.PathSeparator))
                TryAdd(path);

        // Kernel assembly — contains DisplayHelper, DbHelper, PanelsHelper, etc.
        TryAdd(typeof(DisplayHelper).Assembly.Location);

        // EF Core
        TryAdd(typeof(Microsoft.EntityFrameworkCore.DbContext).Assembly.Location);
        TryAdd(typeof(Microsoft.EntityFrameworkCore.RelationalDatabaseFacadeExtensions).Assembly.Location);

        return refs;
    }
}
