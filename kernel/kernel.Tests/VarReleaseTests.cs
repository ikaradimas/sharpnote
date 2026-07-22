using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;
using Xunit.Abstractions;

namespace kernel.Tests;

/// <summary>
/// Tests the var_release handler: freeing a variable's current value by running a
/// synthetic `name = null;` submission so the object it held can be collected without a
/// kernel restart. Must be safe for value types / const (graceful no-op) and must reject
/// non-identifier names (the name is interpolated into compiled source).
/// </summary>
public class VarReleaseTests : IClassFixture<KernelFixture>, IAsyncLifetime
{
    private readonly KernelFixture _k;
    public VarReleaseTests(KernelFixture fixture, ITestOutputHelper _) => _k = fixture;
    public Task InitializeAsync() => _k.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private async Task ExecuteAsync(string code)
    {
        var id = KernelFixture.NewId();
        await _k.SendAsync(new { type = "execute", id, code });
        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);
    }

    private async Task<JsonElement> ReleaseAsync(string name)
    {
        _k.ClearMessages();
        await _k.SendAsync(new { type = "var_release", name });
        return await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "vars_update");
    }

    private static JsonElement Var(JsonElement varsUpdate, string name) =>
        varsUpdate.GetProperty("vars").EnumerateArray().First(x => x.GetProperty("name").GetString() == name);

    [Fact]
    public async Task Release_ReferenceVariable_SetsItNull()
    {
        await ExecuteAsync("var big = new int[1000];");
        var vu = await ReleaseAsync("big");
        Var(vu, "big").GetProperty("isNull").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Release_ValueType_IsGracefulNoOp()
    {
        await ExecuteAsync("var n = 42;");
        // A value type can't be assigned null; the synthetic submission compile-errors and
        // is caught, leaving state untouched. The handler still emits a vars_update.
        var vu = await ReleaseAsync("n");
        var n = Var(vu, "n");
        n.GetProperty("isNull").GetBoolean().Should().BeFalse();
        n.GetProperty("value").GetString().Should().Be("42");
    }

    [Fact]
    public async Task Release_KeywordNamedVariable_IsFreed()
    {
        // A variable declared with a verbatim keyword name has Name == "class"; the handler
        // must emit "@class = null;" (not "class = null;") so it actually frees, not a no-op.
        await ExecuteAsync("var @class = new int[1000];");
        var vu = await ReleaseAsync("class");
        Var(vu, "class").GetProperty("isNull").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Release_NonExistentVariable_IsNoOp()
    {
        await ExecuteAsync("var present = 1;");
        _k.ClearMessages();
        await _k.SendAsync(new { type = "var_release", name = "ghost" });
        await Task.Delay(300);
        // Nothing to free → no vars_update emitted, kernel unaffected.
        _k.GetMessages().Any(el => el.TryGetProperty("type", out var t) && t.GetString() == "vars_update")
            .Should().BeFalse();
        await ExecuteAsync("var stillAlive = 2;"); // kernel remains responsive
    }

    [Fact]
    public async Task Release_NonIdentifierName_IsRejected_NoSideEffect()
    {
        await ExecuteAsync("var a = new int[10];");
        _k.ClearMessages();
        // Injection-shaped name: the identifier guard rejects it before building source,
        // so nothing runs (no vars_update) and `a` is left intact.
        await _k.SendAsync(new { type = "var_release", name = "a = null; a" });
        await Task.Delay(300);
        _k.GetMessages().Any(el => el.TryGetProperty("type", out var t) && t.GetString() == "vars_update")
            .Should().BeFalse();
        // Confirm `a` was NOT freed.
        var vu = await ReleaseAsync("a");
        Var(vu, "a").GetProperty("isNull").GetBoolean().Should().BeTrue(); // now it frees cleanly
    }
}
