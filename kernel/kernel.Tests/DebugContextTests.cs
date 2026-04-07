using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

public class DebugContextTests
{
    private static DebugContext MakeCtx(
        TextWriter? output = null,
        CancellationToken ct = default,
        IEnumerable<int>? breakpoints = null,
        Func<List<object>>? varSnapshot = null)
    {
        return new DebugContext(
            output ?? TextWriter.Null,
            "test-cell",
            ct,
            breakpoints,
            varSnapshot);
    }

    [Fact]
    public void Check_NoBreakpoints_DoesNotBlock()
    {
        var ctx = MakeCtx();
        // Should return immediately
        ctx.Check(1);
        ctx.Check(2);
        ctx.Check(3);
    }

    [Fact]
    public void Check_AtBreakpoint_BlocksUntilResume()
    {
        var ctx = MakeCtx(breakpoints: [5]);
        var paused = false;
        var resumed = false;

        var thread = new Thread(() =>
        {
            ctx.Check(1); // should not block
            ctx.Check(5); // should block
            resumed = true;
        });
        thread.Start();

        // Give thread time to hit the breakpoint
        Thread.Sleep(100);
        paused = !resumed;
        paused.Should().BeTrue("Check(5) should block at breakpoint");

        ctx.Resume();
        thread.Join(2000);
        resumed.Should().BeTrue("Resume should unblock the thread");
    }

    [Fact]
    public void Step_PausesAtNextCheck()
    {
        var ctx = MakeCtx(breakpoints: [1]);
        var hitLine = -1;
        var pauseCount = 0;

        var thread = new Thread(() =>
        {
            ctx.Check(1); // blocks at breakpoint
            pauseCount++;
            ctx.Check(2); // should block again (step mode)
            pauseCount++;
            ctx.Check(3); // runs freely after resume
        });
        thread.Start();

        Thread.Sleep(100);
        pauseCount.Should().Be(0, "should be paused at line 1");

        ctx.Step(); // resume but pause at next Check
        Thread.Sleep(100);
        pauseCount.Should().Be(1, "should have passed line 1 and paused at line 2");

        ctx.Resume(); // resume fully
        thread.Join(2000);
        pauseCount.Should().Be(2, "should have completed all checks");
    }

    [Fact]
    public void CancellationToken_InterruptsPausedWait()
    {
        using var cts = new CancellationTokenSource();
        var ctx = MakeCtx(ct: cts.Token, breakpoints: [1]);

        var threw = false;
        var thread = new Thread(() =>
        {
            try
            {
                ctx.Check(1); // blocks at breakpoint
            }
            catch (OperationCanceledException)
            {
                threw = true;
            }
        });
        thread.Start();

        Thread.Sleep(100);
        cts.Cancel();
        thread.Join(2000);
        threw.Should().BeTrue("cancellation should throw OperationCanceledException");
    }

    [Fact]
    public void SetBreakpoints_DynamicallyUpdates()
    {
        var ctx = MakeCtx(breakpoints: [10]);

        // Line 10 is a breakpoint but line 5 is not
        ctx.Check(5); // should not block

        // Now add line 5 as a breakpoint
        ctx.SetBreakpoints([5]);
        var blocked = false;
        var thread = new Thread(() =>
        {
            ctx.Check(5); // should now block
            blocked = true;
        });
        thread.Start();

        Thread.Sleep(100);
        blocked.Should().BeFalse("should be paused at the new breakpoint");
        ctx.Resume();
        thread.Join(2000);
        blocked.Should().BeTrue();
    }

    [Fact]
    public void SendsPausedMessage_WithVariables()
    {
        var sw = new StringWriter();
        var ctx = MakeCtx(
            output: sw,
            breakpoints: [1],
            varSnapshot: () => new List<object>
            {
                new { name = "x", typeName = "Int32", value = "42" }
            });

        var thread = new Thread(() => ctx.Check(1));
        thread.Start();
        Thread.Sleep(100);

        var output = sw.ToString();
        output.Should().Contain("\"type\":\"paused\"");
        output.Should().Contain("\"line\":1");
        output.Should().Contain("\"name\":\"x\"");

        ctx.Resume();
        thread.Join(2000);
    }
}
