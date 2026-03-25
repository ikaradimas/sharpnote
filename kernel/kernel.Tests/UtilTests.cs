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
/// Integration tests for the Util scripting global —
/// spawns the actual kernel and verifies the JSON-line protocol messages emitted.
/// </summary>
public class UtilTests : IAsyncDisposable
{
    private readonly ITestOutputHelper _out;
    private Process? _proc;
    private StreamWriter? _stdin;
    private readonly List<JsonElement> _received = new();
    private readonly SemaphoreSlim _messageSignal = new(0);
    private Task? _readerTask;
    private bool _running;

    public UtilTests(ITestOutputHelper output) => _out = output;

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

    // ── .Dump() alias ────────────────────────────────────────────────────────

    [Fact]
    public async Task Dump_ProducesDisplayMessage_LikeDisplay()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "\"hello world\".Dump();" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display",
            timeoutMs: 15_000);

        msg.GetProperty("format").GetString().Should().Be("html");
        msg.GetProperty("content").GetString().Should().Contain("hello world");
    }

    // ── Util.Time ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Time_Action_EmitsHtmlWithElapsedMs()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Util.Time(() => System.Threading.Thread.Sleep(10), \"myLabel\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "html",
            timeoutMs: 15_000);

        var content = msg.GetProperty("content").GetString()!;
        content.Should().Contain("util-time");
        content.Should().Contain("myLabel");
    }

    [Fact]
    public async Task Time_Func_ReturnsValue()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "var x = Util.Time(() => 42, \"compute\");" });

        await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        // Variable x should equal 42
        List<JsonElement> all;
        lock (_received) { all = _received.ToList(); }
        var varsMsg = all.FirstOrDefault(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "vars_update");
        varsMsg.ValueKind.Should().NotBe(JsonValueKind.Undefined);
        var vars = varsMsg.GetProperty("vars").EnumerateArray();
        var x = vars.FirstOrDefault(v => v.GetProperty("name").GetString() == "x");
        x.ValueKind.Should().NotBe(JsonValueKind.Undefined);
        x.GetProperty("value").GetString().Should().Be("42");
    }

    // ── Util.Cmd ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Cmd_CapturesCommandOutput()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        // Use 'echo' which is available on all platforms
        await SendAsync(new { type = "execute", id,
            code = "Util.Cmd(\"echo\", \"hello from util cmd\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "html",
            timeoutMs: 15_000);

        msg.GetProperty("content").GetString()!.Should().Contain("hello from util cmd");
    }

    // ── Util.Dif ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Dif_ShowsAddedAndRemovedLines()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id,
            code = "Util.Dif(\"a\\nb\\nc\", \"a\\nX\\nc\", \"before\", \"after\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "html",
            timeoutMs: 15_000);

        var content = msg.GetProperty("content").GetString()!;
        content.Should().Contain("diff-del");   // removed line
        content.Should().Contain("diff-add");   // added line
        content.Should().Contain("before");
        content.Should().Contain("after");
    }

    // ── Util.Cache ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Cache_ReturnsCachedValue_OnSecondCall()
    {
        await StartKernelAsync();
        var id1 = NewId();
        ClearMessages();

        // First call: counter increments to 1 and caches
        await SendAsync(new { type = "execute", id = id1,
            code = "var counter = 0;\nvar v1 = Util.Cache(\"testKey\", () => { counter++; return 99; });\nvar v2 = Util.Cache(\"testKey\", () => { counter++; return 99; });" });

        await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id1,
            timeoutMs: 15_000);

        List<JsonElement> all;
        lock (_received) { all = _received.ToList(); }
        var varsMsg = all.LastOrDefault(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "vars_update");
        var vars = varsMsg.GetProperty("vars").EnumerateArray().ToList();
        // counter should be 1 (factory only called once)
        var counterVar = vars.FirstOrDefault(v => v.GetProperty("name").GetString() == "counter");
        counterVar.GetProperty("value").GetString().Should().Be("1");
    }

    // ── Util.HorizontalRun ────────────────────────────────────────────────────

    [Fact]
    public async Task HorizontalRun_EmitsHorizontalDisplayMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id,
            code = "Util.HorizontalRun(\"16px\", \"left\", \"right\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "horizontal",
            timeoutMs: 15_000);

        msg.GetProperty("separator").GetString().Should().Be("16px");
        msg.GetProperty("content").GetArrayLength().Should().Be(2);
    }
}
