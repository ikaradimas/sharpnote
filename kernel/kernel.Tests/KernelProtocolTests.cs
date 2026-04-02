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
/// Subprocess integration tests — uses a shared kernel process and
/// communicates via JSON-line protocol over stdin/stdout.
/// </summary>
public class KernelProtocolTests : IClassFixture<KernelFixture>, IAsyncLifetime
{
    private readonly KernelFixture _k;

    public KernelProtocolTests(KernelFixture fixture, ITestOutputHelper _) => _k = fixture;

    public Task InitializeAsync() => _k.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── Tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Execute_SimpleExpression_CompletesSuccessfully()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "1+1" });

        var complete = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);

        complete.GetProperty("success").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Execute_DisplayHtml_EmitsDisplayMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Display.Html(\"<b>hi</b>\")" });

        var display = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "html");

        display.GetProperty("content").GetString().Should().Contain("hi");
    }

    [Fact]
    public async Task Execute_SharedState_SecondCellSeesFirstVariable()
    {
        var id1 = KernelFixture.NewId(); var id2 = KernelFixture.NewId();

        await _k.SendAsync(new { type = "execute", id = id1, code = "var sharedX = 42;" });
        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id1);

        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id = id2, code = "sharedX" });

        var display = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id2);

        display.GetProperty("content").GetString().Should().Contain("42");
    }

    [Fact]
    public async Task Execute_InvalidCode_EmitsErrorAndFailsComplete()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "invalid c# @@@" });

        var complete = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        complete.GetProperty("success").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Reset_ClearsVariables()
    {
        var id1 = KernelFixture.NewId();

        // Define a variable
        await _k.SendAsync(new { type = "execute", id = id1, code = "var resetTestVar = 99;" });
        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id1);

        // Reset
        _k.ClearMessages();
        await _k.SendAsync(new { type = "reset" });
        var resetComplete = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "reset_complete");
        resetComplete.ValueKind.Should().NotBe(JsonValueKind.Undefined);

        // Try to access the variable — should error
        var id2 = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id = id2, code = "resetTestVar" });
        var complete = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id2,
            timeoutMs: 15_000);
        complete.GetProperty("success").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Lint_SyntaxError_ReturnsDiagnostics()
    {
        var requestId = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "lint", requestId, code = "var x = ;" });

        var result = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "lint_result" &&
            el.TryGetProperty("requestId", out var r) && r.GetString() == requestId);

        var diags = result.GetProperty("diagnostics").EnumerateArray().ToList();
        diags.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Autocomplete_MemberAccess_ReturnsItems()
    {
        var code = "Console.";
        var requestId = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "autocomplete", requestId, code, position = code.Length });

        var result = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "autocomplete_result" &&
            el.TryGetProperty("requestId", out var r) && r.GetString() == requestId);

        var items = result.GetProperty("items").EnumerateArray().ToList();
        items.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Execute_Success_EmitsVarsUpdate()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "var myTestVar = 123;" });

        var varsUpdate = await _k.WaitForMessageAsync(el =>
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
