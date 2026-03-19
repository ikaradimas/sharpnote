using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace SharpNoteKernel;

// ── Cancellation-check injector ───────────────────────────────────────────────
// Rewrites user code by inserting __ct__.ThrowIfCancellationRequested() at the
// top of every loop body so that SIGINT can stop tight synchronous loops cleanly.

class CancellationCheckInjector : CSharpSyntaxRewriter
{
    private readonly StatementSyntax _check =
        SyntaxFactory.ParseStatement("__ct__.ThrowIfCancellationRequested();");

    private BlockSyntax Wrap(StatementSyntax body)
    {
        if (body is BlockSyntax block)
            return block.WithStatements(block.Statements.Insert(0, _check));
        return SyntaxFactory.Block(_check, body);
    }

    public override Microsoft.CodeAnalysis.SyntaxNode? VisitWhileStatement(WhileStatementSyntax node)
    {
        var v = (WhileStatementSyntax)base.VisitWhileStatement(node)!;
        return v.WithStatement(Wrap(v.Statement));
    }
    public override Microsoft.CodeAnalysis.SyntaxNode? VisitForStatement(ForStatementSyntax node)
    {
        var v = (ForStatementSyntax)base.VisitForStatement(node)!;
        return v.WithStatement(Wrap(v.Statement));
    }
    public override Microsoft.CodeAnalysis.SyntaxNode? VisitDoStatement(DoStatementSyntax node)
    {
        var v = (DoStatementSyntax)base.VisitDoStatement(node)!;
        return v.WithStatement(Wrap(v.Statement));
    }
    public override Microsoft.CodeAnalysis.SyntaxNode? VisitForEachStatement(ForEachStatementSyntax node)
    {
        var v = (ForEachStatementSyntax)base.VisitForEachStatement(node)!;
        return v.WithStatement(Wrap(v.Statement));
    }
}
