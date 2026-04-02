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
/// Integration tests for Panels, Db, and Config scripting APIs —
/// uses a shared kernel process and resets state between tests.
/// </summary>
public class PanelControlTests : IClassFixture<KernelFixture>, IAsyncLifetime
{
    private readonly KernelFixture _k;

    public PanelControlTests(KernelFixture fixture, ITestOutputHelper _) => _k = fixture;

    public Task InitializeAsync() => _k.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── Panels.Open ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Open_EmitsPanelOpenMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Panels.Open(PanelId.Graph);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_open" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "graph");

        msg.GetProperty("panel").GetString().Should().Be("graph");
    }

    // ── Panels.Close ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Close_EmitsPanelCloseMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Panels.Close(PanelId.Log);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_close" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "log");

        msg.GetProperty("panel").GetString().Should().Be("log");
    }

    // ── Panels.Toggle ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Toggle_EmitsPanelToggleMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Panels.Toggle(PanelId.Config);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_toggle" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "config");

        msg.GetProperty("panel").GetString().Should().Be("config");
    }

    // ── Db.Add ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_Add_EmitsDbAddMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new
        {
            type = "execute", id,
            code = "await Db.AddAsync(\"mydb\", DbProvider.Sqlite, \"Data Source=test.db\");",
        });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "db_add" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "mydb");

        msg.GetProperty("name").GetString().Should().Be("mydb");
        msg.GetProperty("provider").GetString().Should().Be("sqlite");
        msg.GetProperty("connectionString").GetString().Should().Be("Data Source=test.db");

        var requestId = msg.GetProperty("requestId").GetString()!;
        await _k.SendAsync(new { type = "db_add_result", requestId });

        var complete = await _k.WaitForMessageAsync(
            el => el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
                  el.TryGetProperty("id",   out var i) && i.GetString() == id,
            timeoutMs: 15_000);
        complete.GetProperty("success").GetBoolean().Should().BeTrue();
    }

    // ── Db.Remove ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_Remove_EmitsDbRemoveMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Db.Remove(\"mydb\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "db_remove" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "mydb");

        msg.GetProperty("name").GetString().Should().Be("mydb");
    }

    // ── Db.Attach ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_Attach_EmitsDbAttachMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Db.Attach(\"mydb\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "db_attach" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "mydb");

        msg.GetProperty("name").GetString().Should().Be("mydb");
    }

    // ── Db.Detach ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_Detach_EmitsDbDetachMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Db.Detach(\"mydb\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "db_detach" &&
            el.TryGetProperty("name", out var n) && n.GetString() == "mydb");

        msg.GetProperty("name").GetString().Should().Be("mydb");
    }

    // ── Db.ListAsync ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Db_ListAsync_SendsRequestAndResolvesOnResponse()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new
        {
            type = "execute", id,
            code = "var conns = await Db.ListAsync(); Console.WriteLine(conns.Length);",
        });

        var requestMsg = await _k.WaitForMessageAsync(
            el => el.TryGetProperty("type", out var t) && t.GetString() == "db_list_request",
            timeoutMs: 5_000);

        var requestId = requestMsg.GetProperty("requestId").GetString()!;

        await _k.SendAsync(new
        {
            type        = "db_list_response",
            requestId,
            connections = new object[0],
        });

        var complete = await _k.WaitForMessageAsync(
            el => el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
                  el.TryGetProperty("id",   out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        complete.GetProperty("success").GetBoolean().Should().BeTrue();
    }

    // ── Config.Set ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Config_Set_EmitsConfigSetAndUpdatesLocalValue()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new
        {
            type = "execute", id,
            code = "Config.Set(\"env\", \"staging\"); Console.WriteLine(Config[\"env\"]);",
        });

        var configMsg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "config_set" &&
            el.TryGetProperty("key",  out var k) && k.GetString() == "env",
            timeoutMs: 15_000);

        configMsg.GetProperty("key").GetString().Should().Be("env");
        configMsg.GetProperty("value").GetString().Should().Be("staging");

        var stdoutMsg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "stdout" &&
            el.TryGetProperty("content", out var c) && (c.GetString() ?? "").Contains("staging"),
            timeoutMs: 15_000);

        stdoutMsg.GetProperty("content").GetString().Should().Contain("staging");
    }

    // ── Config.Remove ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Config_Remove_EmitsConfigRemoveMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Config.Remove(\"mykey\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "config_remove" &&
            el.TryGetProperty("key",  out var k) && k.GetString() == "mykey");

        msg.GetProperty("key").GetString().Should().Be("mykey");
    }

    // ── Panels.CloseAll ───────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_CloseAll_EmitsPanelCloseAllMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Panels.CloseAll();" });

        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_close_all");
    }

    // ── Panels.Dock ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Dock_EmitsPanelDockMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Panels.Dock(PanelId.Graph, DockZone.Right);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_dock" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "graph");

        msg.GetProperty("panel").GetString().Should().Be("graph");
        msg.GetProperty("zone").GetString().Should().Be("right");
        msg.GetProperty("size").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task Panels_Dock_WithFractionalSize_EmitsSize()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Panels.Dock(PanelId.Log, DockZone.Bottom, 0.35);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_dock" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "log");

        msg.GetProperty("zone").GetString().Should().Be("bottom");
        msg.GetProperty("size").GetDouble().Should().BeApproximately(0.35, 0.001);
    }

    [Fact]
    public async Task Panels_Dock_WithAbsoluteSize_EmitsSize()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Panels.Dock(PanelId.Db, DockZone.Left, 340.0);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_dock" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "db");

        msg.GetProperty("zone").GetString().Should().Be("left");
        msg.GetProperty("size").GetDouble().Should().BeApproximately(340.0, 0.001);
    }

    // ── Panels.Float ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Panels_Float_EmitsPanelFloatMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Panels.Float(PanelId.Variables);" });

        var msg = await _k.WaitForMessageAsync(el =>
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
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Panels.Float(PanelId.Graph, x: 300, y: 150, width: 480, height: 360);" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "panel_float" &&
            el.TryGetProperty("panel", out var p) && p.GetString() == "graph");

        msg.GetProperty("x").GetInt32().Should().Be(300);
        msg.GetProperty("y").GetInt32().Should().Be(150);
        msg.GetProperty("w").GetInt32().Should().Be(480);
        msg.GetProperty("h").GetInt32().Should().Be(360);
    }
}
