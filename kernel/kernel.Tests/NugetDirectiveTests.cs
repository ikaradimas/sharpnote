using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

public class NugetDirectiveTests
{
    // ParseNugetDirectives is internal static on class Program
    private static (string cleanCode, System.Collections.Generic.List<(string id, string? version)> refs)
        Parse(string code) => Program.ParseNugetDirectives(code);

    [Fact]
    public void ParsesVersionedPackage()
    {
        var (clean, refs) = Parse("#r \"nuget: Newtonsoft.Json, 13.0.3\"");
        refs.Should().HaveCount(1);
        refs[0].id.Should().Be("Newtonsoft.Json");
        refs[0].version.Should().Be("13.0.3");
    }

    [Fact]
    public void ParsesVersionlessPackage()
    {
        var (clean, refs) = Parse("#r \"nuget: Humanizer\"");
        refs.Should().HaveCount(1);
        refs[0].id.Should().Be("Humanizer");
        refs[0].version.Should().BeNull();
    }

    [Fact]
    public void StrippedCodePreservesLineNumbers()
    {
        var code = "line one\n#r \"nuget: Foo, 1.0\"\nline three";
        var (clean, refs) = Parse(code);
        var lines = clean.Split('\n');
        lines.Should().HaveCount(3);
        // Directive line replaced with blank
        lines[1].Should().BeEmpty();
        // Other lines preserved
        lines[0].Should().Be("line one");
        lines[2].Should().Be("line three");
    }

    [Fact]
    public void NoDirectives_ReturnsEmptyRefsAndUnchangedCode()
    {
        var code = "var x = 1;\nConsole.WriteLine(x);";
        var (clean, refs) = Parse(code);
        refs.Should().BeEmpty();
        clean.Should().Be(code);
    }

    [Fact]
    public void MultipleDirectives_ParsedAll()
    {
        var code = "#r \"nuget: PackageA, 1.0\"\n#r \"nuget: PackageB\"";
        var (clean, refs) = Parse(code);
        refs.Should().HaveCount(2);
        refs[0].id.Should().Be("PackageA");
        refs[1].id.Should().Be("PackageB");
    }

    [Fact]
    public void ParseIsCaseInsensitive()
    {
        // The regex uses IgnoreCase
        var (clean, refs) = Parse("#R \"nuget: Foo, 1.0\"");
        refs.Should().HaveCount(1);
    }
}
