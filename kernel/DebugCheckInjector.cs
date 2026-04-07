using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace SharpNoteKernel;

// ── Debug-check injector ─────────────────────────────────────────────────────
// Rewrites user code by inserting __dbg__.Check(lineNumber) before every
// top-level statement and every statement inside blocks. This allows the
// DebugContext to pause execution at breakpoints or when stepping.

class DebugCheckInjector : CSharpSyntaxRewriter
{
    private readonly int _lineOffset;

    public DebugCheckInjector(int lineOffset = 0)
    {
        _lineOffset = lineOffset;
    }

    private int OriginalLine(SyntaxNode node) =>
        node.GetLocation().GetLineSpan().StartLinePosition.Line + 1 - _lineOffset;

    private static StatementSyntax MakeCheck(int line) =>
        SyntaxFactory.ParseStatement($"__dbg__.Check({line});\n");

    /// <summary>
    /// Entry point: rewrite a script compilation unit with debug checks.
    /// Must be called BEFORE any other rewriters mutate the tree.
    /// </summary>
    public CompilationUnitSyntax Rewrite(CompilationUnitSyntax root)
    {
        var newMembers = new SyntaxList<MemberDeclarationSyntax>();

        foreach (var member in root.Members)
        {
            if (member is GlobalStatementSyntax gs)
            {
                // Record original line BEFORE visiting (rewriting inner blocks)
                var line = OriginalLine(gs);
                // Visit the inner statement to inject checks into nested blocks
                var visited = (StatementSyntax)VisitStatement(gs.Statement);
                var check = SyntaxFactory.GlobalStatement(MakeCheck(line));
                newMembers = newMembers.Add(check);
                newMembers = newMembers.Add(gs.WithStatement(visited));
            }
            else
            {
                // In script mode, top-level var declarations are FieldDeclarationSyntax
                // and method declarations are wrapped in GlobalStatementSyntax with
                // LocalFunctionStatementSyntax. Inject check before fields too.
                var line = OriginalLine(member);
                var check = SyntaxFactory.GlobalStatement(MakeCheck(line));
                newMembers = newMembers.Add(check);
                newMembers = newMembers.Add(member);
            }
        }

        return root.WithMembers(newMembers);
    }

    /// <summary>Visit a statement, recursing into blocks to inject checks.</summary>
    private StatementSyntax VisitStatement(StatementSyntax stmt)
    {
        return stmt switch
        {
            BlockSyntax block => InjectIntoBlock(block),
            IfStatementSyntax ifStmt => ifStmt
                .WithStatement(VisitStatement(ifStmt.Statement))
                .WithElse(ifStmt.Else != null
                    ? ifStmt.Else.WithStatement(VisitStatement(ifStmt.Else.Statement))
                    : ifStmt.Else),
            WhileStatementSyntax ws => ws.WithStatement(VisitStatement(ws.Statement)),
            ForStatementSyntax fs => fs.WithStatement(VisitStatement(fs.Statement)),
            ForEachStatementSyntax fes => fes.WithStatement(VisitStatement(fes.Statement)),
            DoStatementSyntax ds => ds.WithStatement(VisitStatement(ds.Statement)),
            TryStatementSyntax ts => ts
                .WithBlock(InjectIntoBlock(ts.Block))
                .WithCatches(new SyntaxList<CatchClauseSyntax>(
                    ts.Catches.Select(c => c.WithBlock(InjectIntoBlock(c.Block)))))
                .WithFinally(ts.Finally != null
                    ? ts.Finally.WithBlock(InjectIntoBlock(ts.Finally.Block))
                    : ts.Finally),
            UsingStatementSyntax us when us.Statement != null =>
                us.WithStatement(VisitStatement(us.Statement)),
            SwitchStatementSyntax ss => ss.WithSections(
                new SyntaxList<SwitchSectionSyntax>(
                    ss.Sections.Select(sec => sec.WithStatements(
                        new SyntaxList<StatementSyntax>(
                            sec.Statements.SelectMany(s =>
                                new[] { MakeCheck(OriginalLine(s)), VisitStatement(s) })))))),
            _ => stmt, // leaf statements — no inner blocks to recurse into
        };
    }

    private BlockSyntax InjectIntoBlock(BlockSyntax block)
    {
        var newStatements = new SyntaxList<StatementSyntax>();
        foreach (var stmt in block.Statements)
        {
            var line = OriginalLine(stmt);
            newStatements = newStatements.Add(MakeCheck(line));
            newStatements = newStatements.Add(VisitStatement(stmt));
        }
        return block.WithStatements(newStatements);
    }
}
