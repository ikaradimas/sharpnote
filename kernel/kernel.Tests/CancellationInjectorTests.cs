using FluentAssertions;
using Microsoft.CodeAnalysis.CSharp;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

public class CancellationInjectorTests
{
    private static string Inject(string code)
    {
        var parseOptions = new CSharpParseOptions(LanguageVersion.Latest,
            documentationMode: Microsoft.CodeAnalysis.DocumentationMode.None,
            kind: Microsoft.CodeAnalysis.SourceCodeKind.Script);
        var tree = CSharpSyntaxTree.ParseText(code, parseOptions);
        var root = tree.GetRoot();
        var injector = new CancellationCheckInjector();
        var rewritten = injector.Visit(root);
        return rewritten?.ToFullString() ?? string.Empty;
    }

    [Fact]
    public void WhileLoop_InjectsThrowIfCancellationRequested()
    {
        var result = Inject("while(true){}");
        result.Should().Contain("ThrowIfCancellationRequested");
    }

    [Fact]
    public void InfiniteForLoop_InjectsCheck()
    {
        var result = Inject("for(var i=0;;i++){}");
        result.Should().Contain("ThrowIfCancellationRequested");
    }

    [Fact]
    public void ForEachLoop_InjectsCheck()
    {
        var result = Inject("var list = new int[]{1,2,3};\nforeach(var x in list){}");
        result.Should().Contain("ThrowIfCancellationRequested");
    }

    [Fact]
    public void DoWhileLoop_InjectsCheck()
    {
        var result = Inject("int i=0; do { i++; } while(i < 10);");
        result.Should().Contain("ThrowIfCancellationRequested");
    }

    [Fact]
    public void CodeWithNoLoops_RemainsUnchanged()
    {
        var code = "var x = 1 + 1;";
        var result = Inject(code);
        result.Should().NotContain("ThrowIfCancellationRequested");
    }

    [Fact]
    public void NestedLoops_InjectsCheckInBoth()
    {
        var code = "while(true){ for(int i=0;i<10;i++){} }";
        var result = Inject(code);
        // Both loops should have the check injected (at least 2 occurrences)
        var count = System.Text.RegularExpressions.Regex
            .Matches(result, "ThrowIfCancellationRequested").Count;
        count.Should().BeGreaterThanOrEqualTo(2);
    }
}
