using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;
using SharpNoteKernel;

namespace kernel.Tests;

/// <summary>
/// Spike tests that validate Roslyn's CompletionService and semantic diagnostics
/// work correctly for C# script-mode documents with injected globals.
/// </summary>
public class WorkspaceManagerTests
{
    // ── Completions ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetCompletions_ScriptGlobal_Display_ReturnsMemberItems()
    {
        using var wm = new WorkspaceManager();
        var code = "Display.";
        var items = await wm.GetCompletionsAsync(code, code.Length);
        var labels = items.Select(i => i.DisplayText).ToList();

        labels.Should().NotBeEmpty();
        // DisplayHelper exposes Layout, Cell, Markdown, Html, etc.
        labels.Should().Contain(l => l.StartsWith("L") || l.StartsWith("C") || l.StartsWith("M"));
    }

    [Fact]
    public async Task GetCompletions_WellKnownType_Console_ReturnsMemberItems()
    {
        using var wm = new WorkspaceManager();
        var code = "Console.";
        var items = await wm.GetCompletionsAsync(code, code.Length);
        var labels = items.Select(i => i.DisplayText).ToList();

        labels.Should().Contain("WriteLine");
        labels.Should().Contain("ReadLine");
        labels.Should().Contain("Write");
    }

    [Fact]
    public async Task GetCompletions_LocalVariable_ReturnsMemberItems()
    {
        using var wm = new WorkspaceManager();
        // Declare a list, then trigger completions on it
        var code = "var nums = new System.Collections.Generic.List<int>();\nnums.";
        var items = await wm.GetCompletionsAsync(code, code.Length);
        var labels = items.Select(i => i.DisplayText).ToList();

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
        var items = await wm.GetCompletionsAsync(code, code.Length);
        var labels = items.Select(i => i.DisplayText).ToList();

        labels.Should().NotBeEmpty();
    }

    [Fact]
    public async Task GetCompletions_EmptyContext_ReturnsKeywords()
    {
        using var wm = new WorkspaceManager();
        var items = await wm.GetCompletionsAsync("", 0);
        var labels = items.Select(i => i.DisplayText).ToList();

        // Should surface C# keywords and the script globals
        labels.Should().Contain("var");
        labels.Should().Contain("int");
    }

    // ── Diagnostics ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDiagnostics_TypeMismatch_ReturnSemanticError()
    {
        using var wm = new WorkspaceManager();
        // Assigning a string literal to an int — semantic (type) error, not a parse error
        var diags = await wm.GetDiagnosticsAsync("int x = \"hello\";");

        diags.Should().NotBeEmpty();
        diags.Should().Contain(d => d.Severity == "error");
    }

    [Fact]
    public async Task GetDiagnostics_ValidCode_ReturnsEmpty()
    {
        using var wm = new WorkspaceManager();
        var diags = await wm.GetDiagnosticsAsync("int x = 42;");

        diags.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDiagnostics_UndefinedVariable_ReturnsSemanticError()
    {
        using var wm = new WorkspaceManager();
        var diags = await wm.GetDiagnosticsAsync("var x = undeclaredVar + 1;");

        diags.Should().NotBeEmpty();
        diags.Should().Contain(d => d.Severity == "error");
    }

    [Fact]
    public async Task GetDiagnostics_SpansAreRelativeToUserCode_NotPreamble()
    {
        using var wm = new WorkspaceManager();
        // The error is at position 0 of user code ("int x = ...")
        var diags = await wm.GetDiagnosticsAsync("int x = \"hello\";");

        diags.Should().Contain(d => d.From >= 0);
        // Positions must not be in negative range (which would mean preamble bleed-through)
        diags.Should().AllSatisfy(d => d.From.Should().BeGreaterThanOrEqualTo(0));
    }
}
