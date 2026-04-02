using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;
using Xunit.Abstractions;

namespace kernel.Tests;

public class LayoutTests : IClassFixture<KernelFixture>, IAsyncLifetime
{
    private readonly KernelFixture _k;

    public LayoutTests(KernelFixture fixture, ITestOutputHelper _) => _k = fixture;

    public Task InitializeAsync() => _k.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── Tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Layout_EmitsLayoutFormat_WithColumnCount()
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id = KernelFixture.NewId(),
            code = "Display.Layout(3, \"hello\", 42, \"world\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        msg.GetProperty("columns").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task Layout_CellCount_MatchesItemCount()
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id = KernelFixture.NewId(),
            code = "Display.Layout(2, \"a\", \"b\", \"c\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        msg.GetProperty("cells").GetArrayLength().Should().Be(3);
    }

    [Fact]
    public async Task Layout_CellTitle_IsPreserved()
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id = KernelFixture.NewId(),
            code = "Display.Layout(1, Display.Cell(\"My Title\", 42));" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cell = msg.GetProperty("cells")[0];
        cell.GetProperty("title").GetString().Should().Be("My Title");
    }

    [Fact]
    public async Task Layout_StringItem_RendersAsHtml()
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id = KernelFixture.NewId(),
            code = "Display.Layout(1, \"hello world\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cellContent = msg.GetProperty("cells")[0].GetProperty("content");
        cellContent.GetProperty("format").GetString().Should().Be("html");
    }

    [Fact]
    public async Task Layout_EnumerableItem_RendersAsTable()
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id = KernelFixture.NewId(),
            code = "var rows = new[] { new { Name = \"Alice\", Score = 95 } }; Display.Layout(1, (object)rows);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cellContent = msg.GetProperty("cells")[0].GetProperty("content");
        cellContent.GetProperty("format").GetString().Should().Be("table");
    }

    [Fact]
    public async Task Layout_ComplexObjectItem_RendersAsTree()
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id = KernelFixture.NewId(),
            code = "Display.Layout(1, new { Name = \"Alice\", Score = 95 });" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cellContent = msg.GetProperty("cells")[0].GetProperty("content");
        cellContent.GetProperty("format").GetString().Should().Be("tree");
    }

    [Fact]
    public async Task Layout_NoTitle_TitleIsNull()
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id = KernelFixture.NewId(),
            code = "Display.Layout(1, \"plain\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cell = msg.GetProperty("cells")[0];
        cell.GetProperty("title").ValueKind.Should().Be(JsonValueKind.Null);
    }
}
