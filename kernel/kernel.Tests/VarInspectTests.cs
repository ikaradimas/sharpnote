using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;
using Xunit.Abstractions;

namespace kernel.Tests;

/// <summary>
/// Tests the display-inference mode of var_inspect (used by the per-cell variable
/// inspector popups): the kernel runs the value through AutoDisplay — the same
/// type dispatch as the .Display() family — and returns a { format, content }
/// payload. A collection → table, a string/primitive → html, a POCO → tree.
/// </summary>
public class VarInspectTests : IClassFixture<KernelFixture>, IAsyncLifetime
{
    private readonly KernelFixture _k;

    public VarInspectTests(KernelFixture fixture, ITestOutputHelper _) => _k = fixture;

    public Task InitializeAsync() => _k.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<JsonElement> InspectDisplayAsync(string name)
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "var_inspect", name, display = true });
        return await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "var_display_result" &&
            el.TryGetProperty("name", out var n) && n.GetString() == name);
    }

    private async Task DefineVariablesAsync()
    {
        var id = KernelFixture.NewId();
        await _k.SendAsync(new { type = "execute", id, code = @"
            var nums = new[] { 1, 2, 3 };
            var greeting = ""hello world"";
            var count = 42;
            var person = new { Name = ""Ada"", Age = 36 };
            string? missing = null;
            var guids = new List<Guid> { Guid.Parse(""11111111-1111-1111-1111-111111111111""), Guid.Parse(""22222222-2222-2222-2222-222222222222"") };
            var dates = new List<DateTime> { new DateTime(2026, 1, 2, 3, 4, 5) };
            var days = new List<DayOfWeek> { DayOfWeek.Monday, DayOfWeek.Friday };
            var oneGuid = Guid.Parse(""33333333-3333-3333-3333-333333333333"");
            var longStr = new string('x', 500);" });
        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);
    }

    private async Task ExecuteAsync(string code)
    {
        var id = KernelFixture.NewId();
        await _k.SendAsync(new { type = "execute", id, code });
        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);
    }

    [Fact]
    public async Task RedeclaredVariable_InspectsLatestValue()
    {
        // Re-running a cell re-declares its `var`s; the inspector must show the
        // current binding, not the stale original (Roslyn keeps every submission's).
        await ExecuteAsync("var rv = 1;");
        await ExecuteAsync("var rv = 2;");
        await ExecuteAsync("var rv = 99;");

        var res = await InspectDisplayAsync("rv");
        res.GetProperty("content").GetString().Should().Contain("99");
    }

    [Fact]
    public async Task VarsUpdate_DeduplicatesRedeclaredVariable()
    {
        await ExecuteAsync("var dv = 1;");
        _k.ClearMessages();
        await ExecuteAsync("var dv = 2;");

        var vu = _k.GetMessages().First(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "vars_update");
        var dvs = vu.GetProperty("vars").EnumerateArray()
            .Where(v => v.GetProperty("name").GetString() == "dv").ToList();
        dvs.Should().HaveCount(1);                       // deduped, not one-per-submission
        dvs[0].GetProperty("value").GetString().Should().Be("2");
    }

    [Fact]
    public async Task Collection_InfersTableFormat()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("nums");
        res.GetProperty("format").GetString().Should().Be("table");
        res.GetProperty("isNull").GetBoolean().Should().BeFalse();
        // content is an array of {index, value} row dicts
        res.GetProperty("content").ValueKind.Should().Be(JsonValueKind.Array);
        res.GetProperty("content").GetArrayLength().Should().Be(3);
    }

    [Fact]
    public async Task String_InfersHtmlFormat()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("greeting");
        res.GetProperty("format").GetString().Should().Be("html");
        res.GetProperty("content").GetString().Should().Contain("hello world");
    }

    [Fact]
    public async Task LongString_WrapsAndShowsCharacterCount()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("longStr");
        res.GetProperty("format").GetString().Should().Be("html");
        var html = res.GetProperty("content").GetString();
        html.Should().Contain("sn-scalar");   // wrap class
        html.Should().Contain("500 characters"); // clear length indicator
    }

    [Fact]
    public async Task ShortString_HasNoCharacterCountIndicator()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("greeting");
        res.GetProperty("content").GetString().Should().NotContain("characters");
    }

    [Fact]
    public async Task Primitive_InfersHtmlFormat()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("count");
        res.GetProperty("format").GetString().Should().Be("html");
        res.GetProperty("content").GetString().Should().Contain("42");
    }

    [Fact]
    public async Task Poco_InfersTreeFormat()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("person");
        res.GetProperty("format").GetString().Should().Be("tree");
        // tree content is a JSON string
        res.GetProperty("content").GetString().Should().Contain("Ada");
    }

    [Fact]
    public async Task GuidList_RendersAsTextNotReflectedColumns()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("guids");
        res.GetProperty("format").GetString().Should().Be("table");
        var first = res.GetProperty("content")[0];
        // The value cell is the guid's textual form …
        first.GetProperty("value").GetString().Should().Be("11111111-1111-1111-1111-111111111111");
        // … not Guid's reflected properties (Variant/Version), which is the bug this fixes.
        first.TryGetProperty("Variant", out _).Should().BeFalse();
        first.TryGetProperty("Version", out _).Should().BeFalse();
    }

    [Fact]
    public async Task DateTimeList_RendersAsSingleValueColumn()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("dates");
        res.GetProperty("format").GetString().Should().Be("table");
        var first = res.GetProperty("content")[0];
        first.TryGetProperty("value", out _).Should().BeTrue();
        // Not the dozens of DateTime sub-properties.
        first.TryGetProperty("Ticks", out _).Should().BeFalse();
        first.TryGetProperty("DayOfWeek", out _).Should().BeFalse();
    }

    [Fact]
    public async Task EnumList_RendersNamesNotNumbers()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("days");
        res.GetProperty("content")[0].GetProperty("value").GetString().Should().Be("Monday");
    }

    [Fact]
    public async Task SingleGuid_RendersAsHtmlText()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("oneGuid");
        res.GetProperty("format").GetString().Should().Be("html");
        res.GetProperty("content").GetString().Should().Contain("33333333-3333-3333-3333-333333333333");
    }

    [Fact]
    public async Task NullVariable_ReportsIsNull()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("missing");
        res.GetProperty("isNull").GetBoolean().Should().BeTrue();
        res.GetProperty("format").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task UnknownVariable_ReportsIsNull()
    {
        await DefineVariablesAsync();
        var res = await InspectDisplayAsync("doesNotExist");
        res.GetProperty("isNull").GetBoolean().Should().BeTrue();
    }

    // ── Compiled-script cache for expression/watch inspection ───────────────
    // Expression mode compiles the watch once and re-runs it; it must NOT cache the
    // VALUE (each evaluation reflects current state), and repeatedly inspecting the same
    // expression must reuse the compiled assembly instead of emitting a new one per call
    // (the old EvaluateAsync path leaked an assembly on every refresh).

    private async Task<string> InspectExprJsonAsync(string expr)
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "var_inspect", name = expr, expression = true });
        var el = await _k.WaitForMessageAsync(e =>
            e.TryGetProperty("type", out var t) && t.GetString() == "var_inspect_result" &&
            e.TryGetProperty("name", out var n) && n.GetString() == expr);
        return el.GetProperty("json").GetString()!;
    }

    [Fact]
    public async Task ExpressionInspect_ReRunsForFreshValue_DoesNotCacheTheValue()
    {
        await ExecuteAsync("var _warm = 1;"); // var_inspect requires a non-null script
        var a = await InspectExprJsonAsync("System.Guid.NewGuid().ToString()");
        var b = await InspectExprJsonAsync("System.Guid.NewGuid().ToString()");
        // Same expression, cached compilation — but each run must produce a fresh value.
        a.Should().NotBe(b);
    }

    [Fact]
    public async Task ExpressionInspect_RepeatedSameExpression_ReusesCompilation()
    {
        await ExecuteAsync("var _warm = 1;");
        const string expr = "System.AppDomain.CurrentDomain.GetAssemblies().Length";
        var counts = new System.Collections.Generic.List<int>();
        for (int i = 0; i < 8; i++)
            counts.Add(int.Parse(await InspectExprJsonAsync(expr)));

        // With the compiled-script cache, the first inspection compiles+emits once and the
        // rest reuse it, so the loaded-assembly count stays essentially flat. The old
        // EvaluateAsync path emitted a fresh assembly per call, climbing by ~1 each time
        // (growth ≈ 7 over 8 calls). A generous margin keeps this robust against unrelated
        // lazy loads while still failing loudly if per-call emission regresses.
        var growthAfterFirst = counts[^1] - counts[1];
        growthAfterFirst.Should().BeLessThan(3);
    }
}
