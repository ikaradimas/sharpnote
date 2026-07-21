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
            var oneGuid = Guid.Parse(""33333333-3333-3333-3333-333333333333"");" });
        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);
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
}
