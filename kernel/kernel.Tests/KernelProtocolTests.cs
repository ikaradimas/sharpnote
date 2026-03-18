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
/// Subprocess integration tests — spawns the actual kernel process and
/// communicates via JSON-line protocol over stdin/stdout.
/// </summary>
public class KernelProtocolTests : IAsyncDisposable
{
    private readonly ITestOutputHelper _out;
    private Process? _proc;
    private StreamWriter? _stdin;
    private readonly List<JsonElement> _received = new();
    private readonly SemaphoreSlim _messageSignal = new(0);
    private Task? _readerTask;
    private bool _running;

    public KernelProtocolTests(ITestOutputHelper output) => _out = output;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    private async Task StartKernelAsync()
    {
        // Prefer prebuilt binary in bin/ for speed; fall back to dotnet run
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

        // Wait for 'ready' message (up to 30 s for first dotnet run with restore)
        await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "ready",
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

    public async ValueTask DisposeAsync()
    {
        _running = false;
        try { if (_stdin != null) await _stdin.WriteLineAsync(JsonSerializer.Serialize(new { type = "exit" })); } catch { }
        try { _proc?.Kill(entireProcessTree: true); } catch { }
        if (_readerTask != null) await _readerTask.WaitAsync(TimeSpan.FromSeconds(3)).ConfigureAwait(false);
        _proc?.Dispose();
        _stdin?.Dispose();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static string NewId() => Guid.NewGuid().ToString("N")[..8];

    // ── Tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Execute_SimpleExpression_CompletesSuccessfully()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "1+1" });

        var complete = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);

        complete.GetProperty("success").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Execute_DisplayHtml_EmitsDisplayMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Display.Html(\"<b>hi</b>\")" });

        var display = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "html");

        display.GetProperty("content").GetString().Should().Contain("hi");
    }

    [Fact]
    public async Task Execute_SharedState_SecondCellSeesFirstVariable()
    {
        await StartKernelAsync();
        var id1 = NewId(); var id2 = NewId();

        await SendAsync(new { type = "execute", id = id1, code = "var sharedX = 42;" });
        await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id1);

        ClearMessages();
        await SendAsync(new { type = "execute", id = id2, code = "sharedX" });

        // Expression results are emitted as display/html (e.g. <pre>42</pre>)
        var display = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id2);

        display.GetProperty("content").GetString().Should().Contain("42");
    }

    [Fact]
    public async Task Execute_InvalidCode_EmitsErrorAndFailsComplete()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "invalid c# @@@" });

        var complete = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        complete.GetProperty("success").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Reset_ClearsVariables()
    {
        await StartKernelAsync();
        var id1 = NewId();

        // Define a variable
        await SendAsync(new { type = "execute", id = id1, code = "var resetTestVar = 99;" });
        await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id1);

        // Reset
        ClearMessages();
        await SendAsync(new { type = "reset" });
        var resetComplete = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "reset_complete");
        resetComplete.ValueKind.Should().NotBe(JsonValueKind.Undefined);

        // Try to access the variable — should error
        var id2 = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id = id2, code = "resetTestVar" });
        var complete = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id2,
            timeoutMs: 15_000);
        complete.GetProperty("success").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Lint_SyntaxError_ReturnsDiagnostics()
    {
        await StartKernelAsync();
        var requestId = NewId();
        ClearMessages();
        await SendAsync(new { type = "lint", requestId, code = "var x = ;" });

        var result = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "lint_result" &&
            el.TryGetProperty("requestId", out var r) && r.GetString() == requestId);

        var diags = result.GetProperty("diagnostics").EnumerateArray().ToList();
        diags.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Autocomplete_MemberAccess_ReturnsItems()
    {
        await StartKernelAsync();
        var code = "Console.";
        var requestId = NewId();
        ClearMessages();
        await SendAsync(new { type = "autocomplete", requestId, code, position = code.Length });

        var result = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "autocomplete_result" &&
            el.TryGetProperty("requestId", out var r) && r.GetString() == requestId);

        var items = result.GetProperty("items").EnumerateArray().ToList();
        items.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Execute_Success_EmitsVarsUpdate()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "var myTestVar = 123;" });

        var varsUpdate = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "vars_update",
            timeoutMs: 15_000);

        var vars = varsUpdate.GetProperty("vars").EnumerateArray().ToList();
        var hasMyVar = vars.Any(v =>
        {
            if (!v.TryGetProperty("name", out var n)) return false;
            return n.GetString() == "myTestVar";
        });
        hasMyVar.Should().BeTrue("expected vars_update to include myTestVar");
    }
}
