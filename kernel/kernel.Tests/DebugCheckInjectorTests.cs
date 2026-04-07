using FluentAssertions;
using Microsoft.CodeAnalysis.CSharp;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

public class DebugCheckInjectorTests
{
    private static string Inject(string code, int lineOffset = 0)
    {
        var parseOptions = new CSharpParseOptions(LanguageVersion.Latest,
            documentationMode: Microsoft.CodeAnalysis.DocumentationMode.None,
            kind: Microsoft.CodeAnalysis.SourceCodeKind.Script);
        var tree = CSharpSyntaxTree.ParseText(code, parseOptions);
        var root = (Microsoft.CodeAnalysis.CSharp.Syntax.CompilationUnitSyntax)tree.GetRoot();
        var injector = new DebugCheckInjector(lineOffset);
        var rewritten = injector.Rewrite(root);
        return rewritten.ToFullString();
    }

    [Fact]
    public void InjectsCheckBeforeEachStatement()
    {
        var code = "var x = 1;\nvar y = 2;";
        var result = Inject(code);
        var count = System.Text.RegularExpressions.Regex
            .Matches(result, @"__dbg__\.Check\(\d+\)").Count;
        count.Should().BeGreaterThanOrEqualTo(2, $"Result was: [{result}]");
    }

    [Fact]
    public void CheckContainsCorrectLineNumbers()
    {
        var code = "var x = 1;\nvar y = 2;\nvar z = 3;";
        var result = Inject(code);
        result.Should().Contain("__dbg__.Check(1)");
        result.Should().Contain("__dbg__.Check(2)");
        result.Should().Contain("__dbg__.Check(3)");
    }

    [Fact]
    public void InjectsInsideBlocks()
    {
        var code = "if (true) { var a = 1; var b = 2; }";
        var result = Inject(code);
        // Should have checks inside the block too
        var count = System.Text.RegularExpressions.Regex
            .Matches(result, @"__dbg__\.Check\(\d+\)").Count;
        count.Should().BeGreaterThanOrEqualTo(2);
    }

    [Fact]
    public void LineOffsetSubtractsFromLineNumbers()
    {
        var code = "var x = 1;\nvar y = 2;";
        var result = Inject(code, lineOffset: 5);
        result.Should().Contain("__dbg__.Check(-4)");
        result.Should().Contain("__dbg__.Check(-3)");
    }

    [Fact]
    public void EmptyCode_RemainsEmpty()
    {
        var result = Inject("");
        result.Should().NotContain("__dbg__");
    }

    [Fact]
    public void NestedBlocks_InjectChecksAtAllLevels()
    {
        var code = "if (true) { if (false) { var x = 1; } }";
        var result = Inject(code);
        var count = System.Text.RegularExpressions.Regex
            .Matches(result, @"__dbg__\.Check\(\d+\)").Count;
        count.Should().BeGreaterThanOrEqualTo(2);
    }

    [Fact]
    public void MethodDeclarations_NotInjectedAtTopLevel()
    {
        // Method declarations are MemberDeclarations, not GlobalStatements
        var code = "void Foo() { var x = 1; }";
        var result = Inject(code);
        // Should inject inside the method body block but the method decl itself
        // is a MemberDeclaration, not a GlobalStatement
        result.Should().Contain("__dbg__.Check");
    }
}
