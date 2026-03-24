using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;
using Xunit.Abstractions;

namespace kernel.Tests;

/// <summary>
/// Integration tests for Display.Plot, Display.Markdown, and Display.DatePicker —
/// spawns the actual kernel and verifies the JSON-line protocol messages emitted.
/// </summary>
public class DisplayTests : IAsyncDisposable
{
    private readonly ITestOutputHelper _out;
    private Process? _proc;
    private StreamWriter? _stdin;
    private readonly List<JsonElement> _received = new();
    private readonly SemaphoreSlim _messageSignal = new(0);
    private Task? _readerTask;
    private bool _running;

    public DisplayTests(ITestOutputHelper output) => _out = output;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    private async Task StartKernelAsync()
    {
        var kernelDir   = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var projectPath = Path.Combine(kernelDir, "kernel.csproj");

        var psi = new ProcessStartInfo
        {
            FileName               = "dotnet",
            Arguments              = $"run --project \"{projectPath}\" --no-launch-profile",
            RedirectStandardInput  = true,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            WorkingDirectory       = kernelDir,
        };

        _proc = Process.Start(psi)!;
        _stdin = new StreamWriter(_proc.StandardInput.BaseStream, System.Text.Encoding.UTF8)
            { AutoFlush = true };

        _running = true;
        _readerTask = Task.Run(async () =>
        {
            var reader = new StreamReader(_proc.StandardOutput.BaseStream);
            while (_running && !_proc.HasExited)
            {
                var line = await reader.ReadLineAsync();
                if (line is null) break;
                try
                {
                    var el = JsonSerializer.Deserialize<JsonElement>(line);
                    lock (_received) _received.Add(el);
                    _messageSignal.Release();
                    _out.WriteLine($"<< {line}");
                }
                catch { /* skip non-JSON lines */ }
            }
        });

        await WaitForMessageAsync(
            el => el.TryGetProperty("type", out var t) && t.GetString() == "ready",
            timeoutMs: 30_000);
    }

    private async Task<JsonElement> WaitForMessageAsync(
        Func<JsonElement, bool> predicate, int timeoutMs = 10_000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            lock (_received)
            {
                var match = _received.FirstOrDefault(predicate);
                if (match.ValueKind != JsonValueKind.Undefined) return match;
            }
            await _messageSignal.WaitAsync(500);
        }
        throw new TimeoutException($"Timed out waiting for kernel message (timeout={timeoutMs}ms)");
    }

    private async Task SendAsync(object msg)
    {
        var json = JsonSerializer.Serialize(msg);
        _out.WriteLine($">> {json}");
        await _stdin!.WriteLineAsync(json);
    }

    private void ClearMessages() { lock (_received) _received.Clear(); }

    private static string NewId() => Guid.NewGuid().ToString("N")[..8];

    public async ValueTask DisposeAsync()
    {
        _running = false;
        try { if (_stdin != null) await _stdin.WriteLineAsync(JsonSerializer.Serialize(new { type = "exit" })); } catch { }
        try { _proc?.Kill(entireProcessTree: true); } catch { }
        if (_readerTask != null) await _readerTask.WaitAsync(TimeSpan.FromSeconds(3)).ConfigureAwait(false);
        _proc?.Dispose();
        _stdin?.Dispose();
    }

    // ── Display.Plot ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Plot_EmitsVarPoint_WithCorrectNameAndValue()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Display.Plot(\"score\", 42.5);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "var_point" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "score");

        msg.GetProperty("value").GetDouble().Should().BeApproximately(42.5, 0.001);
    }

    [Fact]
    public async Task Plot_PlotModeValue_EmitsRawValue()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Display.Plot(\"x\", 99.0, PlotMode.Value);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "var_point" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "x");

        msg.GetProperty("value").GetDouble().Should().BeApproximately(99.0, 0.001);
    }

    [Fact]
    public async Task Plot_PlotModeRateOfChange_FirstCallEmitsZero()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        // First RateOfChange call for a new name always emits 0 (no previous value).
        await SendAsync(new { type = "execute", id, code = "Display.Plot(\"v\", 10.0, PlotMode.RateOfChange);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "var_point" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "v");

        msg.GetProperty("value").GetDouble().Should().BeApproximately(0.0, 0.001);
    }

    [Fact]
    public async Task Plot_PlotModeRateOfChange_SecondCallEmitsDelta()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        // Execute both calls in one cell so state is carried across within the same DisplayHelper.
        await SendAsync(new
        {
            type = "execute", id,
            code = "Display.Plot(\"dv\", 10.0, PlotMode.RateOfChange);\nDisplay.Plot(\"dv\", 25.0, PlotMode.RateOfChange);",
        });

        // Collect all var_point messages for "dv"
        await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        List<JsonElement> points;
        lock (_received)
        {
            points = _received
                .Where(el => el.TryGetProperty("type", out var t) && t.GetString() == "var_point"
                          && el.TryGetProperty("name", out var n) && n.GetString() == "dv")
                .ToList();
        }

        points.Should().HaveCount(2);
        points[0].GetProperty("value").GetDouble().Should().BeApproximately(0.0,  0.001, "first call has no prior value");
        points[1].GetProperty("value").GetDouble().Should().BeApproximately(15.0, 0.001, "second call = 25 - 10 = 15");
    }

    [Fact]
    public async Task Plot_IndependentNames_TrackSeparately()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new
        {
            type = "execute", id,
            code = "Display.Plot(\"a\", 5.0, PlotMode.RateOfChange);\nDisplay.Plot(\"b\", 100.0, PlotMode.RateOfChange);",
        });

        await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        List<JsonElement> points;
        lock (_received) { points = _received.Where(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "var_point").ToList(); }

        // Both are first calls for their respective names — both should emit 0
        points.Should().HaveCount(2);
        points.All(p => p.GetProperty("value").GetDouble() == 0.0).Should().BeTrue();
    }

    // ── Display.Markdown ──────────────────────────────────────────────────────

    [Fact]
    public async Task Markdown_EmitsDisplayMessage_WithMarkdownFormat()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Display.Markdown(\"# Hello World\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "markdown");

        msg.GetProperty("content").GetString().Should().Be("# Hello World");
    }

    [Fact]
    public async Task Markdown_PreservesContentVerbatim()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Display.Markdown(\"## Section with **bold** text\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "markdown",
            timeoutMs: 15_000);

        msg.GetProperty("content").GetString().Should().Contain("bold");
    }

    // ── Display.DatePicker ────────────────────────────────────────────────────

    [Fact]
    public async Task DatePicker_EmitsWidgetDisplay_WithDatepickerType()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Display.DatePicker(\"Pick a date\", defaultValue: \"2025-01-01\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "widget");

        var content = msg.GetProperty("content");
        content.GetProperty("widgetType").GetString().Should().Be("datepicker");
        content.GetProperty("label").GetString().Should().Be("Pick a date");
    }

    [Fact]
    public async Task DatePicker_DefaultValue_IsUsedAsInitialValue()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        // Verifies the parameter is named 'defaultValue', not 'defaultDate' (regression guard).
        await SendAsync(new { type = "execute", id, code = "Display.DatePicker(\"Date\", defaultValue: \"2025-06-15\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "widget");

        msg.GetProperty("content").GetProperty("value").GetString()
            .Should().Be("2025-06-15");
    }
}
