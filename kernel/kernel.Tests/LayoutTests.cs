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

public class LayoutTests : IAsyncDisposable
{
    private readonly ITestOutputHelper _out;
    private Process? _proc;
    private StreamWriter? _stdin;
    private readonly List<JsonElement> _received = new();
    private readonly SemaphoreSlim _messageSignal = new(0);
    private Task? _readerTask;
    private bool _running;

    public LayoutTests(ITestOutputHelper output) => _out = output;

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

    // ── Tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Layout_EmitsLayoutFormat_WithColumnCount()
    {
        await StartKernelAsync();
        ClearMessages();
        await SendAsync(new { type = "execute", id = NewId(),
            code = "Display.Layout(3, \"hello\", 42, \"world\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        msg.GetProperty("columns").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task Layout_CellCount_MatchesItemCount()
    {
        await StartKernelAsync();
        ClearMessages();
        await SendAsync(new { type = "execute", id = NewId(),
            code = "Display.Layout(2, \"a\", \"b\", \"c\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        msg.GetProperty("cells").GetArrayLength().Should().Be(3);
    }

    [Fact]
    public async Task Layout_CellTitle_IsPreserved()
    {
        await StartKernelAsync();
        ClearMessages();
        await SendAsync(new { type = "execute", id = NewId(),
            code = "Display.Layout(1, Display.Cell(\"My Title\", 42));" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cell = msg.GetProperty("cells")[0];
        cell.GetProperty("title").GetString().Should().Be("My Title");
    }

    [Fact]
    public async Task Layout_StringItem_RendersAsHtml()
    {
        await StartKernelAsync();
        ClearMessages();
        await SendAsync(new { type = "execute", id = NewId(),
            code = "Display.Layout(1, \"hello world\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cellContent = msg.GetProperty("cells")[0].GetProperty("content");
        cellContent.GetProperty("format").GetString().Should().Be("html");
    }

    [Fact]
    public async Task Layout_EnumerableItem_RendersAsTable()
    {
        await StartKernelAsync();
        ClearMessages();
        // Cast to object so C# does not unpack the array via params covariance
        await SendAsync(new { type = "execute", id = NewId(),
            code = "var rows = new[] { new { Name = \"Alice\", Score = 95 } }; Display.Layout(1, (object)rows);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cellContent = msg.GetProperty("cells")[0].GetProperty("content");
        cellContent.GetProperty("format").GetString().Should().Be("table");
    }

    [Fact]
    public async Task Layout_ComplexObjectItem_RendersAsTree()
    {
        await StartKernelAsync();
        ClearMessages();
        await SendAsync(new { type = "execute", id = NewId(),
            code = "Display.Layout(1, new { Name = \"Alice\", Score = 95 });" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cellContent = msg.GetProperty("cells")[0].GetProperty("content");
        cellContent.GetProperty("format").GetString().Should().Be("tree");
    }

    [Fact]
    public async Task Layout_NoTitle_TitleIsNull()
    {
        await StartKernelAsync();
        ClearMessages();
        await SendAsync(new { type = "execute", id = NewId(),
            code = "Display.Layout(1, \"plain\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("format", out var f) && f.GetString() == "layout");

        var cell = msg.GetProperty("cells")[0];
        cell.GetProperty("title").ValueKind.Should().Be(JsonValueKind.Null);
    }
}
