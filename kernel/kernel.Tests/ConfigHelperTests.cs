using System.Collections.Generic;
using System.IO;
using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

/// <summary>
/// Unit tests for <see cref="ConfigHelper"/> typed getters (GetInt, GetDouble, GetBool).
/// </summary>
public class ConfigHelperTests
{
    private static ConfigHelper Create(Dictionary<string, string> values) =>
        new(values, TextWriter.Null);

    // ── GetInt ────────────────────────────────────────────────────────────────

    [Fact]
    public void GetInt_ValidInt_ReturnsValue()
    {
        var helper = Create(new() { ["port"] = "8080" });
        helper.GetInt("port").Should().Be(8080);
    }

    [Fact]
    public void GetInt_InvalidString_ReturnsDefault()
    {
        var helper = Create(new() { ["port"] = "not-a-number" });
        helper.GetInt("port", 3000).Should().Be(3000);
    }

    [Fact]
    public void GetInt_MissingKey_ReturnsDefault()
    {
        var helper = Create(new());
        helper.GetInt("missing", 42).Should().Be(42);
    }

    // ── GetDouble ─────────────────────────────────────────────────────────────

    [Fact]
    public void GetDouble_ValidDouble_ReturnsValue()
    {
        var helper = Create(new() { ["rate"] = "3.14" });
        helper.GetDouble("rate").Should().BeApproximately(3.14, 0.001);
    }

    [Fact]
    public void GetDouble_InvariantCultureDecimal_ParsesCorrectly()
    {
        // Invariant culture uses '.' as decimal separator
        var helper = Create(new() { ["val"] = "1.5" });
        helper.GetDouble("val").Should().BeApproximately(1.5, 0.001);
    }

    [Fact]
    public void GetDouble_MissingKey_ReturnsDefault()
    {
        var helper = Create(new());
        helper.GetDouble("missing", 9.99).Should().BeApproximately(9.99, 0.001);
    }

    // ── GetBool ───────────────────────────────────────────────────────────────

    [Fact]
    public void GetBool_TrueLowercase_ReturnsTrue()
    {
        var helper = Create(new() { ["flag"] = "true" });
        helper.GetBool("flag").Should().BeTrue();
    }

    [Fact]
    public void GetBool_TrueUppercase_ReturnsTrue()
    {
        var helper = Create(new() { ["flag"] = "TRUE" });
        helper.GetBool("flag").Should().BeTrue();
    }

    [Fact]
    public void GetBool_One_ReturnsTrue()
    {
        var helper = Create(new() { ["flag"] = "1" });
        helper.GetBool("flag").Should().BeTrue();
    }

    [Fact]
    public void GetBool_Yes_ReturnsTrue()
    {
        var helper = Create(new() { ["flag"] = "yes" });
        helper.GetBool("flag").Should().BeTrue();
    }

    [Fact]
    public void GetBool_False_ReturnsFalse()
    {
        var helper = Create(new() { ["flag"] = "false" });
        helper.GetBool("flag").Should().BeFalse();
    }

    [Fact]
    public void GetBool_MissingKey_ReturnsDefault()
    {
        var helper = Create(new());
        helper.GetBool("missing", true).Should().BeTrue();
        helper.GetBool("missing", false).Should().BeFalse();
    }

    [Fact]
    public void GetBool_UnrecognizedString_ReturnsFalse()
    {
        var helper = Create(new() { ["flag"] = "banana" });
        helper.GetBool("flag").Should().BeFalse();
    }
}
