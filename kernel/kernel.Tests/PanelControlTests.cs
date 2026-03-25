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
/// Integration tests for Panels, Db, and Config scripting APIs —
/// spawns the actual kernel and verifies the JSON-line protocol messages emitted.
/// </summary>
public class PanelControlTests : IAsyncDisposable
{
    private readonly ITestOutputHelper _out;
    private Process? _proc;
    private StreamWriter? _stdin;
    private readonly List<JsonElement> _received = new();
    private readonly SemaphoreSlim _messageSignal = new(0);
    private Task? _readerTask;
    private bool _running;

    public PanelControlTests(ITestOutputHelper output) => _out = output;

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

    // ── Panels.Open ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Open_EmitsPanelOpenMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Panels.Open(PanelId.Graph);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_open" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "graph");

        msg.GetProperty("panel").GetString().Should().Be("graph");
    }

    // ── Panels.Close ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Close_EmitsPanelCloseMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Panels.Close(PanelId.Log);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_close" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "log");

        msg.GetProperty("panel").GetString().Should().Be("log");
    }

    // ── Panels.Toggle ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Toggle_EmitsPanelToggleMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Panels.Toggle(PanelId.Config);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_toggle" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "config");

        msg.GetProperty("panel").GetString().Should().Be("config");
    }

    // ── Db.Add ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_Add_EmitsDbAddMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new
        {
            type = "execute", id,
            code = "await Db.AddAsync(\"mydb\", DbProvider.Sqlite, \"Data Source=test.db\");",
        });

        // Wait for the kernel to emit a db_add message with a requestId
        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "db_add" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "mydb");

        msg.GetProperty("name").GetString().Should().Be("mydb");
        msg.GetProperty("provider").GetString().Should().Be("sqlite");
        msg.GetProperty("connectionString").GetString().Should().Be("Data Source=test.db");

        // Send back a success result so the kernel completes
        var requestId = msg.GetProperty("requestId").GetString()!;
        await SendAsync(new { type = "db_add_result", requestId });

        var complete = await WaitForMessageAsync(
            el => el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
                  el.TryGetProperty("id",   out var i) && i.GetString() == id,
            timeoutMs: 15_000);
        complete.GetProperty("success").GetBoolean().Should().BeTrue();
    }

    // ── Db.Remove ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_Remove_EmitsDbRemoveMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Db.Remove(\"mydb\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "db_remove" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "mydb");

        msg.GetProperty("name").GetString().Should().Be("mydb");
    }

    // ── Db.Attach ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_Attach_EmitsDbAttachMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Db.Attach(\"mydb\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "db_attach" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "mydb");

        msg.GetProperty("name").GetString().Should().Be("mydb");
    }

    // ── Db.Detach ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_Detach_EmitsDbDetachMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Db.Detach(\"mydb\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "db_detach" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "mydb");

        msg.GetProperty("name").GetString().Should().Be("mydb");
    }

    // ── Db.ListAsync ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_ListAsync_SendsRequestAndResolvesOnResponse()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new
        {
            type = "execute", id,
            code = "var conns = await Db.ListAsync(); Console.WriteLine(conns.Length);",
        });

        // Wait for the kernel to emit a db_list_request
        var requestMsg = await WaitForMessageAsync(
            el => el.TryGetProperty("type", out var t) && t.GetString() == "db_list_request",
            timeoutMs: 5_000);

        var requestId = requestMsg.GetProperty("requestId").GetString()!;

        // Send back a fake db_list_response
        await SendAsync(new
        {
            type        = "db_list_response",
            requestId,
            connections = new object[0],
        });

        // Wait for the cell to complete successfully
        var complete = await WaitForMessageAsync(
            el => el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
                  el.TryGetProperty("id",   out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        complete.GetProperty("success").GetBoolean().Should().BeTrue();
    }

    // ── Config.Set ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Config_Set_EmitsConfigSetAndUpdatesLocalValue()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new
        {
            type = "execute", id,
            code = "Config.Set(\"env\", \"staging\"); Console.WriteLine(Config[\"env\"]);",
        });

        var configMsg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "config_set" &&
            el.TryGetProperty("key",  out var k) && k.GetString() == "env",
            timeoutMs: 15_000);

        configMsg.GetProperty("key").GetString().Should().Be("env");
        configMsg.GetProperty("value").GetString().Should().Be("staging");

        // Also verify that Console.WriteLine printed the value — check stdout message
        var stdoutMsg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "stdout" &&
            el.TryGetProperty("content", out var c) && (c.GetString() ?? "").Contains("staging"),
            timeoutMs: 15_000);

        stdoutMsg.GetProperty("content").GetString().Should().Contain("staging");
    }

    // ── Config.Remove ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Config_Remove_EmitsConfigRemoveMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Config.Remove(\"mykey\");" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "config_remove" &&
            el.TryGetProperty("key",  out var k) && k.GetString() == "mykey");

        msg.GetProperty("key").GetString().Should().Be("mykey");
    }

    // ── Panels.CloseAll ───────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_CloseAll_EmitsPanelCloseAllMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Panels.CloseAll();" });

        await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_close_all");
    }

    // ── Panels.Dock ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Dock_EmitsPanelDockMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Panels.Dock(PanelId.Graph, DockZone.Right);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_dock" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "graph");

        msg.GetProperty("panel").GetString().Should().Be("graph");
        msg.GetProperty("zone").GetString().Should().Be("right");
        msg.GetProperty("size").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task Panels_Dock_WithFractionalSize_EmitsSize()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Panels.Dock(PanelId.Log, DockZone.Bottom, 0.35);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_dock" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "log");

        msg.GetProperty("zone").GetString().Should().Be("bottom");
        msg.GetProperty("size").GetDouble().Should().BeApproximately(0.35, 0.001);
    }

    [Fact]
    public async Task Panels_Dock_WithAbsoluteSize_EmitsSize()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Panels.Dock(PanelId.Db, DockZone.Left, 340.0);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_dock" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "db");

        msg.GetProperty("zone").GetString().Should().Be("left");
        msg.GetProperty("size").GetDouble().Should().BeApproximately(340.0, 0.001);
    }

    // ── Panels.Float ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Float_EmitsPanelFloatMessage()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Panels.Float(PanelId.Variables);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_float" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "vars");

        msg.GetProperty("x").ValueKind.Should().Be(JsonValueKind.Null);
        msg.GetProperty("y").ValueKind.Should().Be(JsonValueKind.Null);
        msg.GetProperty("w").ValueKind.Should().Be(JsonValueKind.Null);
        msg.GetProperty("h").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task Panels_Float_WithPositionAndSize_EmitsCoordinates()
    {
        await StartKernelAsync();
        var id = NewId();
        ClearMessages();
        await SendAsync(new { type = "execute", id, code = "Panels.Float(PanelId.Graph, x: 300, y: 150, width: 480, height: 360);" });

        var msg = await WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_float" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "graph");

        msg.GetProperty("x").GetInt32().Should().Be(300);
        msg.GetProperty("y").GetInt32().Should().Be(150);
        msg.GetProperty("w").GetInt32().Should().Be(480);
        msg.GetProperty("h").GetInt32().Should().Be(360);
    }
}
