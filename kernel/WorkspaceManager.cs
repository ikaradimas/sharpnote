using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
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

public record CompletionItemData(string Label, string Kind, string? Detail, string? SortText = null);

public record DiagnosticData(int From, int To, string Severity, string Message);

public record ParameterData(string Label);

public record SignatureData(string Label, IReadOnlyList<ParameterData> Parameters);

public record SignatureHelpData(IReadOnlyList<SignatureData> Signatures, int ActiveParameter)
{
    public static readonly SignatureHelpData Empty =
        new(Array.Empty<SignatureData>(), 0);
}

// Hover: the symbol's type signature + optional XML-doc summary, plus the span
// (relative to user code) of the token being hovered.
public record HoverData(string Signature, string? Documentation, int From, int To);

// ── WorkspaceManager ──────────────────────────────────────────────────────────
//
// Keeps an AdhocWorkspace in sync with the kernel's script state.
// One instance is created per kernel process and shared across all handlers.
// Call UpdateDocument() before querying completions, diagnostics, or
// signature help.  Call UpdateReferences() after each NuGet load.

public sealed class WorkspaceManager : IDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);

    // Preamble is derived from ScriptGlobals via reflection so the workspace
    // always mirrors the actual script execution environment.
    private static readonly string GlobalsPreamble = BuildGlobalsPreamble();

    // Dynamic declarations appended after GlobalsPreamble (e.g. attached DB variables).
    private string _dynamicPreamble = "";
    // Accumulated source from successfully executed cells — gives the workspace
    // visibility into types, records, methods, and variables defined in prior cells.
    // Kept per cell id (in first-seen order) so a re-run REPLACES that cell's source
    // instead of appending a duplicate, and so the total stays bounded: without this the
    // preamble grew unbounded (every re-run appended a full copy) and every LSP keystroke
    // re-parsed the whole accumulated document. See tasks/kernel-memory-redesign.md.
    private readonly List<string> _cellOrder = new();
    private readonly Dictionary<string, string> _cellCode = new();
    private string _scriptPreamble = "";
    // Cap on the concatenated per-cell source (characters). Oldest cells are evicted once
    // exceeded — a soft LSP-only degradation (completions for very old cells may lapse)
    // that keeps a runaway notebook from re-binding a multi-megabyte document per keystroke.
    private const int MaxScriptPreambleChars = 512 * 1024;
    private int TotalPreambleLength => GlobalsPreamble.Length + _dynamicPreamble.Length + _scriptPreamble.Length;

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
                "System.Net.Http",
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
        var text     = SourceText.From(GlobalsPreamble + _dynamicPreamble + _scriptPreamble + code);
        var solution = _workspace.CurrentSolution.WithDocumentText(_docId, text);
        _workspace.TryApplyChanges(solution);
    }

    /// <summary>
    /// Records a successfully executed cell's source so the workspace can resolve types,
    /// records, and variables defined in prior cells. Keyed by cell id: re-running a cell
    /// replaces its previous source (in place, preserving declaration order) rather than
    /// appending a duplicate. The concatenated preamble is capped; oldest cells are evicted
    /// once <see cref="MaxScriptPreambleChars"/> is exceeded.
    /// </summary>
    public void AppendExecutedCode(string cellId, string code)
    {
        if (string.IsNullOrWhiteSpace(code)) return;

        if (_cellCode.ContainsKey(cellId))
        {
            _cellCode[cellId] = code; // re-run: replace in place, keep order position
        }
        else
        {
            _cellOrder.Add(cellId);
            _cellCode[cellId] = code;
        }

        // Evict oldest cells while over the cap (never evict the cell just recorded).
        var total = _cellCode.Values.Sum(c => c.Length + 1);
        while (total > MaxScriptPreambleChars && _cellOrder.Count > 1)
        {
            var oldest = _cellOrder[0];
            if (oldest == cellId) break;
            _cellOrder.RemoveAt(0);
            total -= _cellCode[oldest].Length + 1;
            _cellCode.Remove(oldest);
        }

        RebuildScriptPreamble();
    }

    private void RebuildScriptPreamble()
    {
        var sb = new StringBuilder();
        foreach (var id in _cellOrder)
            sb.Append(_cellCode[id]).Append('\n');
        _scriptPreamble = sb.ToString();
    }

    /// <summary>Clears the accumulated script preamble (e.g. on kernel reset).</summary>
    public void ClearScriptPreamble()
    {
        _cellOrder.Clear();
        _cellCode.Clear();
        _scriptPreamble = "";
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
    /// Image-based references (no file path) are not handled here — use
    /// <see cref="ReplaceReference"/> for dynamically compiled assemblies.
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
    /// Swaps <paramref name="oldRef"/> for <paramref name="newRef"/> in the workspace.
    /// If <paramref name="oldRef"/> is null, simply adds <paramref name="newRef"/>.
    /// Use this for dynamically compiled references (e.g. DB context assemblies) that
    /// have no file path and cannot be deduplicated by <see cref="UpdateReferences"/>.
    /// </summary>
    public void ReplaceReference(MetadataReference? oldRef, MetadataReference newRef)
    {
        var solution = _workspace.CurrentSolution;
        if (oldRef != null)
            solution = solution.RemoveMetadataReference(_projectId, oldRef);
        solution = solution.AddMetadataReference(_projectId, newRef);
        _workspace.TryApplyChanges(solution);
    }

    /// <summary>
    /// Returns completions at <paramref name="position"/> within the current
    /// document (position is relative to the start of user code, not the preamble).
    /// Call <see cref="UpdateDocument"/> first.
    /// </summary>
    public async Task<IReadOnlyList<CompletionItemData>> GetCompletionsAsync(int position)
    {
        var doc = _workspace.CurrentSolution.GetDocument(_docId)!;

        // Check for using-directive context — the preamble places variable
        // declarations before user code, so Roslyn's built-in completion
        // doesn't recognise the using-directive context.  Detect it ourselves
        // and walk the compilation's namespace symbol tree instead.
        var sourceText = await doc.GetTextAsync();
        var userCode   = sourceText.ToString().Substring(TotalPreambleLength);
        var usingItems = await TryGetUsingCompletionsAsync(doc, userCode, position);
        if (usingItems != null) return usingItems;

        var service = CompletionService.GetService(doc);
        if (service == null) return Array.Empty<CompletionItemData>();

        var result = await service.GetCompletionsAsync(doc, TotalPreambleLength + position);
        if (result?.ItemsList == null) return Array.Empty<CompletionItemData>();

        return result.ItemsList
            .Select(item => new CompletionItemData(
                item.DisplayText,
                MapCompletionTags(item.Tags),
                item.InlineDescription.Length > 0 ? item.InlineDescription : null,
                item.SortText))
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
    /// Formats the user code portion of the document and returns the formatted text.
    /// Call <see cref="UpdateDocument"/> first.
    /// </summary>
    public async Task<string> FormatDocumentAsync()
    {
        var doc        = _workspace.CurrentSolution.GetDocument(_docId)!;
        var sourceText = await doc.GetTextAsync();
        var totalLen   = sourceText.Length;
        var preambleLen = TotalPreambleLength;

        // Format only the user-code span so the formatter never reshapes the
        // preamble — this keeps the preamble length stable and avoids slicing
        // into user code when extracting the result.
        var userSpan  = Microsoft.CodeAnalysis.Text.TextSpan.FromBounds(preambleLen, totalLen);
        var formatted = await Microsoft.CodeAnalysis.Formatting.Formatter.FormatAsync(doc, userSpan);
        var text      = (await formatted.GetTextAsync()).ToString();
        return text[preambleLen..].TrimStart('\r', '\n');
    }

    /// <summary>
    /// Atomically updates the document and formats it, preventing concurrent LSP
    /// didChange calls from corrupting the workspace between update and format.
    /// </summary>
    public async Task<(string formatted, IReadOnlyList<DiagnosticData> diagnostics)> FormatCodeAsync(string code)
    {
        await _gate.WaitAsync();
        try
        {
            UpdateDocument(code);
            var formatted   = await FormatDocumentAsync();
            var diagnostics = await GetDiagnosticsAsync();
            return (formatted, diagnostics);
        }
        finally { _gate.Release(); }
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

    // Quick-info format: minimally-qualified names, include the type for locals /
    // fields / parameters and full method signatures — same style as tooltips in
    // a typical C# IDE.
    private static readonly SymbolDisplayFormat HoverFormat =
        SymbolDisplayFormat.MinimallyQualifiedFormat;

    /// <summary>
    /// Returns quick-info for the symbol at <paramref name="position"/> (relative
    /// to the start of user code): its type signature and, when available, the
    /// XML-doc summary. Returns null when the cursor is not on a resolvable
    /// identifier. Call <see cref="UpdateDocument"/> first.
    /// </summary>
    public async Task<HoverData?> GetHoverAsync(int position)
    {
        var doc   = _workspace.CurrentSolution.GetDocument(_docId)!;
        var root  = await doc.GetSyntaxRootAsync();
        var model = await doc.GetSemanticModelAsync();
        if (root == null || model == null) return null;

        var adjusted = Math.Clamp(TotalPreambleLength + position, 0, Math.Max(0, root.FullSpan.End - 1));
        var token    = root.FindToken(adjusted);
        if (!token.IsKind(SyntaxKind.IdentifierToken)) return null;

        var node = token.Parent;
        if (node == null) return null;

        var symbol = model.GetSymbolInfo(node).Symbol
                     ?? model.GetSymbolInfo(node).CandidateSymbols.FirstOrDefault()
                     ?? model.GetDeclaredSymbol(node);
        if (symbol == null || symbol.Kind is SymbolKind.ErrorType or SymbolKind.Discard)
            return null;

        var signature = FormatSymbol(symbol);
        if (string.IsNullOrWhiteSpace(signature)) return null;
        var summary   = ExtractSummary(symbol.GetDocumentationCommentXml());

        var from = Math.Max(0, token.Span.Start - TotalPreambleLength);
        var to   = Math.Max(from, token.Span.End - TotalPreambleLength);
        return new HoverData(signature, summary, from, to);
    }

    /// <summary>Renders a symbol as an IDE-style quick-info signature.</summary>
    private static string FormatSymbol(ISymbol symbol)
    {
        // Hovering a type name in `new Foo()` resolves to the constructor —
        // describe the type instead.
        if (symbol is IMethodSymbol { MethodKind: MethodKind.Constructor } ctor && ctor.ContainingType != null)
            symbol = ctor.ContainingType;

        var display = symbol.ToDisplayString(HoverFormat);

        if (symbol is INamedTypeSymbol nt)
        {
            var kind = nt.TypeKind switch
            {
                TypeKind.Class     => nt.IsRecord ? "record" : "class",
                TypeKind.Struct    => nt.IsRecord ? "record struct" : "struct",
                TypeKind.Interface => "interface",
                TypeKind.Enum      => "enum",
                TypeKind.Delegate  => "delegate",
                _                  => null,
            };
            if (kind != null) display = $"{kind} {display}";
        }
        return display;
    }

    /// <summary>Extracts the &lt;summary&gt; text from an XML doc comment, if any.</summary>
    private static string? ExtractSummary(string? xml)
    {
        if (string.IsNullOrWhiteSpace(xml)) return null;
        var m = Regex.Match(xml, "<summary>(.*?)</summary>", RegexOptions.Singleline);
        if (!m.Success) return null;
        var text = Regex.Replace(m.Groups[1].Value, "<.*?>", "");  // strip inner tags (<see>, <c>, …)
        text = Regex.Replace(text, "\\s+", " ").Trim();
        return text.Length == 0 ? null : text;
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

    // ── Using-directive completions ─────────────────────────────────────────

    private static readonly Regex UsingDirectivePattern =
        new(@"^using\s+([\w.]*\.?)$", RegexOptions.Compiled);

    /// <summary>
    /// If the cursor sits inside a <c>using</c> directive, walks the compilation's
    /// namespace symbol tree and returns child namespace completions.
    /// Returns <c>null</c> when the cursor is not in a using-directive context.
    /// </summary>
    private async Task<IReadOnlyList<CompletionItemData>?> TryGetUsingCompletionsAsync(
        Document doc, string userCode, int position)
    {
        // Find the line containing the cursor
        var lineStart = userCode.LastIndexOf('\n', Math.Max(0, position - 1)) + 1;
        var lineText  = userCode.Substring(lineStart, position - lineStart);

        var match = UsingDirectivePattern.Match(lineText);
        if (!match.Success) return null;

        var prefix = match.Groups[1].Value; // e.g. "System.Net.", "System.N", ""

        var compilation = await doc.Project.GetCompilationAsync();
        if (compilation == null) return null;

        var ns = compilation.GlobalNamespace;

        if (prefix.Length > 0)
        {
            var parts       = prefix.TrimEnd('.').Split('.');
            var endsWithDot = prefix.EndsWith(".");
            var walkParts   = endsWithDot ? parts : parts.Take(parts.Length - 1);

            foreach (var part in walkParts)
            {
                var child = ns.GetNamespaceMembers()
                    .FirstOrDefault(n => n.Name == part);
                if (child == null) return Array.Empty<CompletionItemData>();
                ns = child;
            }

            if (!endsWithDot)
            {
                var partial = parts.Last();
                return GetNamespaceChildren(ns)
                    .Where(c => c.Label.StartsWith(partial, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }
        }

        return GetNamespaceChildren(ns).ToList();
    }

    private static IEnumerable<CompletionItemData> GetNamespaceChildren(
        INamespaceSymbol ns)
    {
        foreach (var child in ns.GetNamespaceMembers().OrderBy(n => n.Name))
            yield return new CompletionItemData(child.Name, "namespace", null);
    }

    // ── Tag mapping ──────────────────────────────────────────────────────────

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
