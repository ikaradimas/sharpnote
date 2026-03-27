using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;
using SharpNoteKernel;

namespace kernel.Tests;

/// <summary>
/// Tests for autocomplete behaviour via WorkspaceManager.
/// </summary>
public class AutocompleteTests
{
    // ── LINQ extensions ───────────────────────────────────────────────────────

    [Fact]
    public async Task GetCompletions_ListType_IncludesLinqMethods()
    {
        using var wm = new WorkspaceManager();
        var code = "var nums = new System.Collections.Generic.List<int>();\nnums.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().Contain("Select");
        labels.Should().Contain("Where");
        labels.Should().Contain("OrderBy");
        labels.Should().Contain("GroupBy");
    }

    [Fact]
    public async Task GetCompletions_IntType_DoesNotIncludeLinqMethods()
    {
        using var wm = new WorkspaceManager();
        // int is not IEnumerable — no LINQ extensions
        var code = "int x = 0;\nx.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().NotContain("Select");
        labels.Should().NotContain("Where");
    }

    // ── Chained member access ─────────────────────────────────────────────────

    [Fact]
    public async Task GetCompletions_Display_ReturnsMemberItems()
    {
        using var wm = new WorkspaceManager();
        var code = "Display.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().Contain("Layout");
        labels.Should().Contain("Cell");
    }

    [Fact]
    public async Task GetCompletions_ChainAccess_TwoLevel_ResolvesType()
    {
        using var wm = new WorkspaceManager();
        // Assign the result of Display.Cell(...) to a variable and access its members
        var code = "var cell = new SharpNoteKernel.LayoutCell(\"t\", \"c\", \"html\");\ncell.";
        wm.UpdateDocument(code);
        var items = await wm.GetCompletionsAsync(code.Length);
        var labels = items.Select(i => i.Label).ToList();

        labels.Should().Contain("Title");
        labels.Should().Contain("Content");
        labels.Should().Contain("Format");
    }

    [Fact]
    public async Task GetCompletions_UnknownIdentifier_DoesNotThrow()
    {
        using var wm = new WorkspaceManager();
        var code = "unknown.Prop.";
        wm.UpdateDocument(code);
        var act = async () => await wm.GetCompletionsAsync(code.Length);

        await act.Should().NotThrowAsync();
    }
}
