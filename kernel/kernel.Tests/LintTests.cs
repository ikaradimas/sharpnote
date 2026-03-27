using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

public class LintTests
{
    [Fact]
    public async Task ValidCode_ZeroDiagnostics()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("int x = 1 + 1;");
        var result = await wm.GetDiagnosticsAsync();

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task SyntaxError_ReturnsAtLeastOneDiagnostic()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("var x = ;");
        var result = await wm.GetDiagnosticsAsync();

        result.Should().NotBeEmpty();
    }

    [Fact]
    public async Task SemanticError_TypeMismatch_ReturnsDiagnostic()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("int x = \"hello\";");
        var result = await wm.GetDiagnosticsAsync();

        result.Should().NotBeEmpty();
        result.Should().Contain(d => d.Severity == "error");
    }

    [Fact]
    public async Task DiagnosticHasPositiveOffsets()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("var x = ;");
        var result = await wm.GetDiagnosticsAsync();

        result.Should().NotBeEmpty();
        result.Should().AllSatisfy(d =>
        {
            d.From.Should().BeGreaterThanOrEqualTo(0);
            d.To.Should().BeGreaterThanOrEqualTo(d.From);
        });
    }

    [Fact]
    public async Task SyntaxError_SeverityIsError()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("var x = ;");
        var result = await wm.GetDiagnosticsAsync();

        result.Should().NotBeEmpty();
        result[0].Severity.Should().Be("error");
    }

    [Fact]
    public async Task DiagnosticHasNonEmptyMessage()
    {
        using var wm = new WorkspaceManager();
        wm.UpdateDocument("var x = ;");
        var result = await wm.GetDiagnosticsAsync();

        result.Should().NotBeEmpty();
        result[0].Message.Should().NotBeNullOrWhiteSpace();
    }
}
