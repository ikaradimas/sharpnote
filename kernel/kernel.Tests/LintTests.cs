using System.Linq;
using FluentAssertions;
using Xunit;

namespace kernel.Tests;

public class LintTests
{
    // GetLintDiagnostics is internal static on class Program
    private static System.Collections.Generic.List<object> Lint(string code)
        => Program.GetLintDiagnostics(code);

    [Fact]
    public void ValidExpression_ZeroDiagnostics()
    {
        var result = Lint("1 + 1");
        result.Should().BeEmpty();
    }

    [Fact]
    public void SyntaxError_ReturnsAtLeastOneDiagnostic()
    {
        var result = Lint("var x = ;");
        result.Should().NotBeEmpty();
    }

    [Fact]
    public void DiagnosticHasPositiveOffsets()
    {
        var result = Lint("var x = ;");
        result.Should().NotBeEmpty();

        // Each diagnostic is an anonymous object with from/to/severity/message
        // Use reflection to read properties
        foreach (var diag in result)
        {
            var type = diag.GetType();
            var from = (int)type.GetProperty("from")!.GetValue(diag)!;
            var to   = (int)type.GetProperty("to")!.GetValue(diag)!;
            from.Should().BeGreaterThanOrEqualTo(0);
            to.Should().BeGreaterThanOrEqualTo(from);
        }
    }

    [Fact]
    public void SyntaxError_DiagnosticSeverityIsError()
    {
        var result = Lint("var x = ;");
        result.Should().NotBeEmpty();
        var first = result[0];
        var severity = (string)first.GetType().GetProperty("severity")!.GetValue(first)!;
        severity.Should().Be("error");
    }

    [Fact]
    public void DiagnosticHasNonEmptyMessage()
    {
        var result = Lint("var x = ;");
        result.Should().NotBeEmpty();
        var message = (string)result[0].GetType().GetProperty("message")!.GetValue(result[0])!;
        message.Should().NotBeNullOrWhiteSpace();
    }
}
