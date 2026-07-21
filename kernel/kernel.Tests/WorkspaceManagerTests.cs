using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using Microsoft.CodeAnalysis;
using Xunit;
using SharpNoteKernel;

namespace kernel.Tests;

public class WorkspaceManagerTests
{
    // ── Completions ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetCompletions_ScriptGlobal_Display_ReturnsMemberItems()
    {
        using var wm = new WorkspaceManager();
        var code = "Display.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);

        items.Should().NotBeEmpty();
        // DisplayHelper exposes Layout, Cell, Markdown, Html, etc.
        items.Select(i => i.Label).Should()
            .Contain(l => l.StartsWith("L") || l.StartsWith("C") || l.StartsWith("M"));
    }

    [Fact]
    public async Task GetCompletions_WellKnownType_Console_ReturnsMemberItems()
    {
        using var wm = new WorkspaceManager();
        var code = "Console.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().Contain("WriteLine");
        labels.Should().Contain("ReadLine");
        labels.Should().Contain("Write");
    }

    [Fact]
    public async Task GetCompletions_LocalVariable_ReturnsMemberItems()
    {
        using var wm = new WorkspaceManager();
        var code = "var nums = new System.Collections.Generic.List<int>();\nnums.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().Contain("Add");
        labels.Should().Contain("Count");
        labels.Should().Contain("Where");   // LINQ
        labels.Should().Contain("Select");  // LINQ
    }

    [Fact]
    public async Task GetCompletions_ScriptGlobal_Db_ReturnsMemberItems()
    {
        using var wm = new WorkspaceManager();
        var code = "Db.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);

        items.Should().NotBeEmpty();
    }

    [Fact]
    public async Task GetCompletions_EmptyContext_ReturnsKeywords()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("");
        var items = await wm.GetCompletionsAsync(0);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().Contain("var");
        labels.Should().Contain("int");
    }

    [Fact]
    public async Task GetCompletions_ItemsHaveKind()
    {
        using var wm = new WorkspaceManager();
        var code = "Console.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);

        items.Should().AllSatisfy(i => i.Kind.Should().NotBeNullOrEmpty());
    }

    // ── Diagnostics ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDiagnostics_TypeMismatch_ReturnsSemanticError()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("int x = \"hello\";");
        var diags = await wm.GetDiagnosticsAsync();

        diags.Should().NotBeEmpty();
        diags.Should().Contain(d => d.Severity == "error");
    }

    [Fact]
    public async Task GetDiagnostics_ValidCode_ReturnsEmpty()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("int x = 42;");
        var diags = await wm.GetDiagnosticsAsync();

        diags.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDiagnostics_UndefinedVariable_ReturnsSemanticError()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("var x = undeclaredVar + 1;");
        var diags = await wm.GetDiagnosticsAsync();

        diags.Should().NotBeEmpty();
        diags.Should().Contain(d => d.Severity == "error");
    }

    [Fact]
    public async Task GetDiagnostics_SpansAreRelativeToUserCode_NotPreamble()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("int x = \"hello\";");
        var diags = await wm.GetDiagnosticsAsync();

        diags.Should().Contain(d => d.From >= 0);
        diags.Should().AllSatisfy(d => d.From.Should().BeGreaterThanOrEqualTo(0));
    }

    // ── References ────────────────────────────────────────────────────────────

    [Fact]
    public void UpdateReferences_DoesNotThrow()
    {
        using var wm = new WorkspaceManager();
        // Re-adding an already-present assembly should be a no-op
        var refs = new[] { MetadataReference.CreateFromFile(typeof(System.Console).Assembly.Location) };
        var act = () => wm.UpdateReferences(refs);
        act.Should().NotThrow();
    }

    // ── Signature help ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetSignatureHelp_ConsoleWriteLine_ReturnsOverloads()
    {
        using var wm = new WorkspaceManager();
        var code = "Console.WriteLine(";
        wm.UpdateDocument(code);
        var help = await wm.GetSignatureHelpAsync(code.Length);

        help.Signatures.Should().NotBeEmpty();
        help.Signatures.Should().Contain(s => s.Label.Contains("WriteLine"));
    }

    [Fact]
    public async Task GetSignatureHelp_ConsoleWriteLine_SignaturesHaveParameters()
    {
        using var wm = new WorkspaceManager();
        var code = "Console.WriteLine(";
        wm.UpdateDocument(code);
        var help = await wm.GetSignatureHelpAsync(code.Length);

        // At least one overload should have parameters
        help.Signatures.Should().Contain(s => s.Parameters.Count > 0);
    }

    [Fact]
    public async Task GetSignatureHelp_WithActiveParam_ReturnsCorrectIndex()
    {
        using var wm = new WorkspaceManager();
        // Cursor is after first comma → active parameter = 1
        var code = "Console.Write(\"{0}\", ";
        wm.UpdateDocument(code);
        var help = await wm.GetSignatureHelpAsync(code.Length);

        help.ActiveParameter.Should().Be(1);
    }

    [Fact]
    public async Task GetSignatureHelp_OutsideMethodCall_ReturnsEmpty()
    {
        using var wm = new WorkspaceManager();
        var code = "int x = 42;";
        wm.UpdateDocument(code);
        var help = await wm.GetSignatureHelpAsync(code.Length);

        help.Signatures.Should().BeEmpty();
    }

    // ── Using-directive completions ───────────────────────────────────────────

    [Fact]
    public async Task GetCompletions_UsingSystem_ReturnsChildNamespaces()
    {
        using var wm = new WorkspaceManager();
        var code = "using System.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().Contain("Net");
        labels.Should().Contain("Linq");
        labels.Should().Contain("Collections");
        items.First(i => i.Label == "Net").Kind.Should().Be("namespace");
    }

    [Fact]
    public async Task GetCompletions_UsingSystemNet_ReturnsHttpNamespace()
    {
        using var wm = new WorkspaceManager();
        var code = "using System.Net.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);

        items.Select(i => i.Label).Should().Contain("Http");
    }

    [Fact]
    public async Task GetCompletions_UsingEmpty_ReturnsTopLevelNamespaces()
    {
        using var wm = new WorkspaceManager();
        var code = "using ";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().Contain("System");
        labels.Should().Contain("Microsoft");
    }

    [Fact]
    public async Task GetCompletions_UsingPartialFilter_FiltersCorrectly()
    {
        using var wm = new WorkspaceManager();
        var code = "using System.N";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().Contain("Net");
        labels.Should().Contain("Numerics");
        labels.Should().NotContain("Linq");
    }

    [Fact]
    public async Task GetCompletions_UsingOnSecondLine_StillWorks()
    {
        using var wm = new WorkspaceManager();
        var code = "using System;\nusing System.Net.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);

        items.Select(i => i.Label).Should().Contain("Http");
    }

    [Fact]
    public async Task GetCompletions_UsingAfterCode_StillWorks()
    {
        using var wm = new WorkspaceManager();
        var code = "var x = 1;\nusing System.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);

        items.Select(i => i.Label).Should().Contain("Net");
    }

    [Fact]
    public async Task GetCompletions_NonUsingContext_FallsBackToRoslyn()
    {
        using var wm = new WorkspaceManager();
        var code = "Console.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);

        items.Select(i => i.Label).Should().Contain("WriteLine");
    }

    // ── Hover (quick info) ──────────────────────────────────────────────────

    [Fact]
    public async Task GetHover_LocalVariable_ShowsTypeAndName()
    {
        using var wm = new WorkspaceManager();
        var code = "var count = 42;\ncount";
        wm.UpdateDocument(code);
        var hover = await wm.GetHoverAsync(code.LastIndexOf("count"));

        hover.Should().NotBeNull();
        hover!.Signature.Should().Contain("count");
        hover.Signature.Should().Contain("int");
    }

    [Fact]
    public async Task GetHover_GenericLocal_ShowsElementType()
    {
        using var wm = new WorkspaceManager();
        var code = "var nums = new System.Collections.Generic.List<int>();\nnums";
        wm.UpdateDocument(code);
        var hover = await wm.GetHoverAsync(code.LastIndexOf("nums"));

        hover.Should().NotBeNull();
        hover!.Signature.Should().Contain("List<int>");
    }

    [Fact]
    public async Task GetHover_Method_ShowsSignature()
    {
        using var wm = new WorkspaceManager();
        var code = "System.Console.WriteLine(\"hi\");";
        wm.UpdateDocument(code);
        var hover = await wm.GetHoverAsync(code.IndexOf("WriteLine"));

        hover.Should().NotBeNull();
        hover!.Signature.Should().Contain("WriteLine");
    }

    [Fact]
    public async Task GetHover_TypeName_ShowsKind()
    {
        using var wm = new WorkspaceManager();
        var code = "var sb = new System.Text.StringBuilder();";
        wm.UpdateDocument(code);
        var hover = await wm.GetHoverAsync(code.IndexOf("StringBuilder"));

        hover.Should().NotBeNull();
        hover!.Signature.Should().Contain("StringBuilder");
        hover.Signature.Should().Contain("class");
    }

    [Fact]
    public async Task GetHover_TypeFromPriorCell_Resolves()
    {
        using var wm = new WorkspaceManager();
        // A type defined in a previously-executed cell is visible via the preamble.
        wm.AppendExecutedCode("class Widget { public int Id { get; set; } }");
        var code = "var w = new Widget();\nw";
        wm.UpdateDocument(code);
        var hover = await wm.GetHoverAsync(code.LastIndexOf("w"));

        hover.Should().NotBeNull();
        hover!.Signature.Should().Contain("Widget");
    }

    [Fact]
    public async Task GetHover_OnWhitespaceOrOperator_ReturnsNull()
    {
        using var wm = new WorkspaceManager();
        var code = "var x = 1;";
        wm.UpdateDocument(code);
        var hover = await wm.GetHoverAsync(code.IndexOf(" = ") + 1); // on '='

        hover.Should().BeNull();
    }

    // ── Accumulated-source integrity ────────────────────────────────────────
    // ExecuteHandler stores each executed cell in the workspace. Cells whose last
    // statement is an expression have their semicolon trimmed for return-value
    // capture at execution time; that trimmed form must NOT be what's persisted —
    // otherwise the accumulated document reads `…expr«no ;» nextCell` and raises a
    // spurious CS1002 "; expected". These verify accumulation stays well-formed.

    [Fact]
    public async Task GetDiagnostics_ExpressionEndingPriorCells_NoSpuriousSemicolonError()
    {
        using var wm = new WorkspaceManager();
        // Prior cells ending in an expression statement, stored WITH their
        // terminating semicolons (the fixed behaviour).
        wm.AppendExecutedCode("var a = 1;\na.ToString();");
        wm.AppendExecutedCode("var b = 2;\nb.ToString();");
        wm.UpdateDocument("var c = a + b;");

        var diags = await wm.GetDiagnosticsAsync();
        diags.Should().NotContain(d => d.Message.Contains("; expected"));
        diags.Should().BeEmpty();
    }

    [Fact]
    public async Task GetCompletions_AfterExpressionEndingPriorCell_StillResolvesItsSymbols()
    {
        using var wm = new WorkspaceManager();
        wm.AppendExecutedCode("var nums = new System.Collections.Generic.List<int>();\nnums.Count.ToString();");
        var code = "nums.";
        wm.UpdateDocument(code);

        var items = await wm.GetCompletionsAsync(code.Length);
        items.Select(i => i.Label).Should().Contain("Add");
    }
}
