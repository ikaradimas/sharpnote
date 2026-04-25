using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;
using Xunit.Abstractions;

namespace kernel.Tests;

/// <summary>
/// Integration tests for Display.Plot, Display.Markdown, and Display.DatePicker —
/// uses a shared kernel process and resets state between tests.
/// </summary>
public class DisplayTests : IClassFixture<KernelFixture>, IAsyncLifetime
{
    private readonly KernelFixture _k;

    public DisplayTests(KernelFixture fixture, ITestOutputHelper _) => _k = fixture;

    public Task InitializeAsync() => _k.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── Display.Canvas ────────────────────────────────────────────────────────

    [Fact]
    public async Task Canvas_FlushEmitsValidPngDataUri()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = @"
            var c = Display.Canvas(40, 30);
            for (int y = 0; y < 30; y++)
                for (int x = 0; x < 40; x++)
                    c.SetPixel(x, y, 255, 0, 0);
            c.Flush();" });

        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);

        // Find the Flush update message (has handleId + update=true + format=image)
        var flushMsg = _k.GetMessages().FirstOrDefault(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("update", out var u) && u.GetBoolean() &&
            el.TryGetProperty("format", out var f) && f.GetString() == "image");

        flushMsg.ValueKind.Should().NotBe(JsonValueKind.Undefined);
        var src = flushMsg.GetProperty("content").GetProperty("src").GetString();
        src.Should().StartWith("data:image/png;base64,");

        var b64 = src!.Substring("data:image/png;base64,".Length);
        var png = Convert.FromBase64String(b64);
        // PNG signature
        png[0].Should().Be(0x89);
        png[1].Should().Be(0x50);
        // IHDR length must be 13
        var ihdrLen = (png[8] << 24) | (png[9] << 16) | (png[10] << 8) | png[11];
        ihdrLen.Should().Be(13);
        // Color type at offset 25 must be 2 (RGB)
        png[25].Should().Be(2);
    }

    [Fact]
    public async Task Canvas_OnClickAfterFlush_ReEmitsAsInteractive()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = @"
            var c = Display.Canvas(20, 20);
            c.Fill(10, 20, 30);
            c.Flush();
            c.OnClick = (x, y, b) => { };" });

        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);

        var imageUpdates = _k.GetMessages().Where(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("update", out var u) && u.GetBoolean() &&
            el.TryGetProperty("format", out var f) && f.GetString() == "image").ToList();

        // We expect at least two image updates: the explicit Flush(), then the auto-flush
        // from EnableMouse() triggered by the OnClick setter — and the latest must be interactive.
        imageUpdates.Should().HaveCountGreaterThanOrEqualTo(2);
        var last = imageUpdates[^1];
        last.GetProperty("content").GetProperty("interactive").GetBoolean().Should().BeTrue();
    }

    // ── Display.Plot ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Plot_EmitsVarPoint_WithCorrectNameAndValue()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Display.Plot(\"score\", 42.5);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "var_point" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "score");

        msg.GetProperty("value").GetDouble().Should().BeApproximately(42.5, 0.001);
    }

    [Fact]
    public async Task Plot_PlotModeValue_EmitsRawValue()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Display.Plot(\"x\", 99.0, PlotMode.Value);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "var_point" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "x");

        msg.GetProperty("value").GetDouble().Should().BeApproximately(99.0, 0.001);
    }

    [Fact]
    public async Task Plot_PlotModeRateOfChange_FirstCallEmitsZero()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Display.Plot(\"v\", 10.0, PlotMode.RateOfChange);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "var_point" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "v");

        msg.GetProperty("value").GetDouble().Should().BeApproximately(0.0, 0.001);
    }

    [Fact]
    public async Task Plot_PlotModeRateOfChange_SecondCallEmitsDelta()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new
        {
            type = "execute", id,
            code = "Display.Plot(\"dv\", 10.0, PlotMode.RateOfChange);\nDisplay.Plot(\"dv\", 25.0, PlotMode.RateOfChange);",
        });

        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        var points = _k.GetMessages()
            .Where(el => el.TryGetProperty("type", out var t) && t.GetString() == "var_point"
                      && el.TryGetProperty("name", out var n) && n.GetString() == "dv")
            .ToList();

        points.Should().HaveCount(2);
        points[0].GetProperty("value").GetDouble().Should().BeApproximately(0.0,  0.001, "first call has no prior value");
        points[1].GetProperty("value").GetDouble().Should().BeApproximately(15.0, 0.001, "second call = 25 - 10 = 15");
    }

    [Fact]
    public async Task Plot_IndependentNames_TrackSeparately()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new
        {
            type = "execute", id,
            code = "Display.Plot(\"a\", 5.0, PlotMode.RateOfChange);\nDisplay.Plot(\"b\", 100.0, PlotMode.RateOfChange);",
        });

        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        var points = _k.GetMessages().Where(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "var_point").ToList();

        points.Should().HaveCount(2);
        points.All(p => p.GetProperty("value").GetDouble() == 0.0).Should().BeTrue();
    }

    // ── Display.Markdown ──────────────────────────────────────────────────────

    [Fact]
    public async Task Markdown_EmitsDisplayMessage_WithMarkdownFormat()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Display.Markdown(\"# Hello World\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "markdown");

        msg.GetProperty("content").GetString().Should().Be("# Hello World");
    }

    [Fact]
    public async Task Markdown_PreservesContentVerbatim()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Display.Markdown(\"## Section with **bold** text\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "markdown",
            timeoutMs: 15_000);

        msg.GetProperty("content").GetString().Should().Contain("bold");
    }

    // ── Display.DatePicker ────────────────────────────────────────────────────

    [Fact]
    public async Task DatePicker_EmitsWidgetDisplay_WithDatepickerType()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Display.DatePicker(\"Pick a date\", defaultValue: \"2025-01-01\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "widget");

        var content = msg.GetProperty("content");
        content.GetProperty("widgetType").GetString().Should().Be("datepicker");
        content.GetProperty("label").GetString().Should().Be("Pick a date");
    }

    [Fact]
    public async Task DatePicker_DefaultValue_IsUsedAsInitialValue()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Display.DatePicker(\"Date\", defaultValue: \"2025-06-15\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "widget");

        msg.GetProperty("content").GetProperty("value").GetString()
            .Should().Be("2025-06-15");
    }

    // ── Display.ClearGraph ────────────────────────────────────────────────────

    [Fact]
    public async Task ClearGraph_EmitsGraphClearMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Display.ClearGraph();" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "graph_clear",
            timeoutMs: 15_000);

        msg.ValueKind.Should().NotBe(JsonValueKind.Undefined);
    }
}
