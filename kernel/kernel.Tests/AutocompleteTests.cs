using System.Collections.Generic;
using System.Linq;
using FluentAssertions;
using Xunit;
using SharpNoteKernel;

namespace kernel.Tests;

/// <summary>
/// Unit tests for the autocomplete handler — calls static methods directly,
/// no kernel subprocess needed.
/// </summary>
public class AutocompleteTests
{
    // ── ReflectMembers ────────────────────────────────────────────────────────

    [Fact]
    public void ReflectMembers_IEnumerableType_IncludesLinqMethods()
    {
        var items = Program.ReflectMembers(typeof(List<int>), isStatic: false);
        var labels = items.Select(i => (string)((dynamic)i).label).ToList();

        labels.Should().Contain("Select");
        labels.Should().Contain("Where");
        labels.Should().Contain("OrderBy");
        labels.Should().Contain("GroupBy");
    }

    [Fact]
    public void ReflectMembers_IEnumerableInterface_IncludesLinqMethods()
    {
        var items = Program.ReflectMembers(typeof(IEnumerable<string>), isStatic: false);
        var labels = items.Select(i => (string)((dynamic)i).label).ToList();

        labels.Should().Contain("Select");
        labels.Should().Contain("Where");
    }

    [Fact]
    public void ReflectMembers_NonEnumerable_DoesNotIncludeLinqMethods()
    {
        var items = Program.ReflectMembers(typeof(int), isStatic: false);
        var labels = items.Select(i => (string)((dynamic)i).label).ToList();

        labels.Should().NotContain("Select");
        labels.Should().NotContain("Where");
    }

    [Fact]
    public void ReflectMembers_Static_DoesNotIncludeLinqMethods()
    {
        // Enumerable itself is a static type — the LINQ check must not apply
        var items = Program.ReflectMembers(typeof(List<int>), isStatic: true);
        var labels = items.Select(i => (string)((dynamic)i).label).ToList();

        // Static members are returned but not LINQ extension methods
        labels.Should().NotContain("Select"); // no LINQ when isStatic=true
    }

    // ── GetAutocompletions — chain resolution ─────────────────────────────────

    [Fact]
    public void GetAutocompletions_ChainAccess_ResolvesPropertyType()
    {
        // "Display.Cell." — Display is a WellKnownInstance (DisplayHelper),
        // Cell is a method that returns LayoutCell; should get LayoutCell members.
        var items = Program.GetAutocompletions("Display.Cell.", 13, state: null);
        var labels = items.Select(i => (string)((dynamic)i).label).ToList();

        // LayoutCell record has Title, Content, Format properties
        labels.Should().Contain("Title");
        labels.Should().Contain("Content");
        labels.Should().Contain("Format");
    }

    [Fact]
    public void GetAutocompletions_ChainAccess_UnknownParent_ReturnsEmpty()
    {
        var items = Program.GetAutocompletions("unknown.Prop.", 13, state: null);
        items.Should().BeEmpty();
    }

    [Fact]
    public void GetAutocompletions_SingleAccess_StillWorks()
    {
        // Regression: single-level member access must still resolve correctly
        var items = Program.GetAutocompletions("Display.", 8, state: null);
        var labels = items.Select(i => (string)((dynamic)i).label).ToList();

        labels.Should().Contain("Layout");
        labels.Should().Contain("Cell");
    }

    [Fact]
    public void GetAutocompletions_ChainAccess_WithPartialName_ReturnsFullList()
    {
        // Filtering by partial name happens client-side; the handler returns all members
        var items = Program.GetAutocompletions("Display.Cell.Ti", 15, state: null);
        var labels = items.Select(i => (string)((dynamic)i).label).ToList();

        labels.Should().Contain("Title");
        labels.Should().Contain("Content"); // all members returned, not just "Ti*"
    }
}
