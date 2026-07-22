using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;
using Xunit.Abstractions;

namespace kernel.Tests;

/// <summary>
/// Tests the var_release handler and shadowed-binding pruning: variables are freed by
/// nulling their bindings directly on the script state (ScriptVariable.Value writes
/// through to the submission field) — no synthetic submission, no chain growth. Must be
/// safe for value types (graceful no-op on the current binding), free keyword-named
/// variables, and — via the automatic post-execution prune — stop re-runs of a declaring
/// cell from accumulating the previous runs' copies.
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
        // Expression-shaped name: release matches variables by exact name (never compiled
        // as source), so this matches nothing — no vars_update, `a` left intact.
        await _k.SendAsync(new { type = "var_release", name = "a = null; a" });
        await Task.Delay(300);
        _k.GetMessages().Any(el => el.TryGetProperty("type", out var t) && t.GetString() == "vars_update")
            .Should().BeFalse();
        // Confirm `a` was NOT freed.
        var vu = await ReleaseAsync("a");
        Var(vu, "a").GetProperty("isNull").GetBoolean().Should().BeTrue(); // now it frees cleanly
    }

    // ── Automatic shadowed-binding pruning ────────────────────────────────────

    private async Task<double> HeapMbAsync()
    {
        var id = KernelFixture.NewId();
        _k.ClearMessages();
        await _k.SendAsync(new { type = "execute", id, code =
            "System.GC.Collect(); System.GC.WaitForPendingFinalizers(); System.GC.Collect();" +
            "Console.WriteLine((System.GC.GetTotalMemory(true) / 1048576.0).ToString(\"F1\", System.Globalization.CultureInfo.InvariantCulture));" });
        var so = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "stdout" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);
        await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "complete" &&
            el.TryGetProperty("id", out var i) && i.GetString() == id);
        return double.Parse(so.GetProperty("content").GetString()!.Trim(),
            System.Globalization.CultureInfo.InvariantCulture);
    }

    [Fact]
    public async Task ReRunningDeclaringCell_DoesNotAccumulateShadowedCopies()
    {
        var before = await HeapMbAsync();
        // Re-declare a 30 MB buffer five times — the exact re-run pattern that used to
        // retain every copy (~150 MB). With post-execution pruning only the current copy
        // stays live.
        for (var i = 0; i < 5; i++)
            await ExecuteAsync("var blob = new byte[30 * 1024 * 1024]; for (int k = 0; k < blob.Length; k += 4096) blob[k] = 1;");
        var after = await HeapMbAsync();

        // One live copy ≈ 30 MB plus a few MB of compilation state; without pruning the
        // delta is ~150 MB. 90 MB splits the outcomes with wide margins on both sides.
        (after - before).Should().BeLessThan(90);
    }

    [Fact]
    public async Task Pruning_PreservesTheCurrentBinding()
    {
        await ExecuteAsync("var pv = \"first\";");
        await ExecuteAsync("var pv = \"second\";");
        // The current binding survives pruning intact — readable AND writable.
        _k.ClearMessages();
        await ExecuteAsync("pv += \"!\";");
        var vu = await _k.WaitForMessageAsync(el =>
            el.TryGetProperty("type", out var t) && t.GetString() == "vars_update");
        Var(vu, "pv").GetProperty("value").GetString().Should().Be("second!");
    }
}
