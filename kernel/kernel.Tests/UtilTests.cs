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
/// Integration tests for the Util scripting global —
/// uses a shared kernel process and resets state between tests.
/// </summary>
public class UtilTests : IClassFixture<KernelFixture>, IAsyncLifetime
{
    private readonly KernelFixture _k;

    public UtilTests(KernelFixture fixture, ITestOutputHelper _) => _k = fixture;

    public Task InitializeAsync() => _k.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── .Dump() alias ────────────────────────────────────────────────────────

    [Fact]
    public async Task Dump_ProducesDisplayMessage_LikeDisplay()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "\"hello world\".Dump();" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display",
            timeoutMs: 15_000);

        msg.GetProperty("format").GetString().Should().Be("html");
        msg.GetProperty("content").GetString().Should().Contain("hello world");
    }

    // ── Util.Time ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Time_Action_EmitsHtmlWithElapsedMs()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "Util.Time(() => System.Threading.Thread.Sleep(10), \"myLabel\");" });

        var msg = await _k.WaitForMessageAsync(el =>
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
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code = "var x = Util.Time(() => 42, \"compute\");" });

        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 15_000);

        var all = _k.GetMessages();
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
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id,
            code = "Util.Cmd(\"echo\", \"hello from util cmd\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "html",
            timeoutMs: 15_000);

        msg.GetProperty("content").GetString()!.Should().Contain("hello from util cmd");
    }

    // ── Util.Dif ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Dif_ShowsAddedAndRemovedLines()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id,
            code = "Util.Dif(\"a\\nb\\nc\", \"a\\nX\\nc\", \"before\", \"after\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "html",
            timeoutMs: 15_000);

        var content = msg.GetProperty("content").GetString()!;
        content.Should().Contain("diff-del");
        content.Should().Contain("diff-add");
        content.Should().Contain("before");
        content.Should().Contain("after");
    }

    // ── Util.Cache ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Cache_ReturnsCachedValue_OnSecondCall()
    {
        var id1 = KernelFixture.NewId();
        _k.ClearMessages();

        await _k.SendAsync(new { type = "execute", id = id1,
            code = "var counter = 0;\nvar v1 = Util.Cache(\"testKey\", () => { counter++; return 99; });\nvar v2 = Util.Cache(\"testKey\", () => { counter++; return 99; });" });

        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id1,
            timeoutMs: 15_000);

        var all = _k.GetMessages();
        var varsMsg = all.LastOrDefault(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "vars_update");
        var vars = varsMsg.GetProperty("vars").EnumerateArray().ToList();
        var counterVar = vars.FirstOrDefault(v => v.GetProperty("name").GetString() == "counter");
        counterVar.GetProperty("value").GetString().Should().Be("1");
    }

    // ── Util.ConfirmAsync ─────────────────────────────────────────────────────

    [Fact]
    public async Task ConfirmAsync_OkResponse_ReturnsTrue()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();

        var executeTask = _k.SendAsync(new { type = "execute", id,
            code = "var result = await Util.ConfirmAsync(\"Delete all?\", \"Confirm\");\nresult.Display();" });

        var confirmMsg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "confirm",
            timeoutMs: 15_000);

        var requestId = confirmMsg.GetProperty("content").GetProperty("requestId").GetString()!;
        confirmMsg.GetProperty("content").GetProperty("message").GetString().Should().Be("Delete all?");
        confirmMsg.GetProperty("content").GetProperty("title").GetString().Should().Be("Confirm");

        await _k.SendAsync(new { type = "confirm_response", requestId, confirmed = true });

        var complete = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 10_000);

        complete.GetProperty("success").GetBoolean().Should().BeTrue();

        var all = _k.GetMessages();
        var displayMsgs = all.Where(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "html").ToList();
        displayMsgs.Should().Contain(el =>
            el.GetProperty("content").GetString()!.Contains("True"));
    }

    [Fact]
    public async Task ConfirmAsync_CancelResponse_ReturnsFalse()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();

        var executeTask = _k.SendAsync(new { type = "execute", id,
            code = "var result = await Util.ConfirmAsync(\"Proceed?\");\nresult.Display();" });

        var confirmMsg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "confirm",
            timeoutMs: 15_000);

        var requestId = confirmMsg.GetProperty("content").GetProperty("requestId").GetString()!;

        await _k.SendAsync(new { type = "confirm_response", requestId, confirmed = false });

        var complete = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id,
            timeoutMs: 10_000);

        complete.GetProperty("success").GetBoolean().Should().BeTrue();

        var all = _k.GetMessages();
        var displayMsgs = all.Where(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "html").ToList();
        displayMsgs.Should().Contain(el =>
            el.GetProperty("content").GetString()!.Contains("False"));
    }

    // ── Util.HorizontalRun ────────────────────────────────────────────────────

    [Fact]
    public async Task HorizontalRun_EmitsHorizontalDisplayMessage()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id,
            code = "Util.HorizontalRun(\"16px\", \"left\", \"right\");" });

        var msg = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "display" &&
            el.TryGetProperty("format", out var f) && f.GetString() == "horizontal",
            timeoutMs: 15_000);

        msg.GetProperty("separator").GetString().Should().Be("16px");
        msg.GetProperty("content").GetArrayLength().Should().Be(2);
    }

    // ── Util.Release ──────────────────────────────────────────────────────────

    private async Task ExecuteAsync(string code)
    {
        var id = KernelFixture.NewId();
        await _k.SendAsync(new { type = "execute", id, code });
        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);
    }

    private async Task<JsonElement> RunAndGetVarsAsync(string code)
    {
        _k.ClearMessages();
        await ExecuteAsync(code);
        return await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "vars_update");
    }

    private static JsonElement Var(JsonElement vu, string name) =>
        vu.GetProperty("vars").EnumerateArray().First(v => v.GetProperty("name").GetString() == name);

    [Fact]
    public async Task Release_FreesReferenceVariable_AndReturnsCount()
    {
        await ExecuteAsync("var big = new byte[100_000]; var keep = new byte[10];");
        var vu = await RunAndGetVarsAsync("var freed = Util.Release(\"big\");");

        Var(vu, "freed").GetProperty("value").GetString().Should().Be("1");
        Var(vu, "big").GetProperty("isNull").GetBoolean().Should().BeTrue();
        Var(vu, "keep").GetProperty("isNull").GetBoolean().Should().BeFalse(); // untouched
    }

    [Fact]
    public async Task Release_MultipleNames_CountsOnlyFreed()
    {
        await ExecuteAsync("var a = new int[10]; var b = new int[10]; var v = 42;");
        // a and b are freed; v is a value type (skipped); ghost doesn't exist.
        var vu = await RunAndGetVarsAsync("var freed = Util.Release(\"a\", \"b\", \"v\", \"ghost\");");

        Var(vu, "freed").GetProperty("value").GetString().Should().Be("2");
        Var(vu, "a").GetProperty("isNull").GetBoolean().Should().BeTrue();
        Var(vu, "b").GetProperty("isNull").GetBoolean().Should().BeTrue();
        Var(vu, "v").GetProperty("value").GetString().Should().Be("42"); // value type untouched
    }

    [Fact]
    public async Task Release_ReadsAsNullAfterwardsInLaterCells()
    {
        await ExecuteAsync("var data = new List<int> { 1, 2, 3 };");
        await ExecuteAsync("Util.Release(\"data\");");
        var vu = await RunAndGetVarsAsync("var isGone = data == null;");
        Var(vu, "isGone").GetProperty("value").GetString().Should().Be("True");
    }
}
