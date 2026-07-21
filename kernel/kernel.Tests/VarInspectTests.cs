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
            string? missing = null;" });
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
