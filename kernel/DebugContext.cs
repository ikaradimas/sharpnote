using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;

namespace SharpNoteKernel;

/// <summary>
/// Provides pause/resume/step debugging for injected __dbg__.Check(line) calls.
/// The Check method blocks the script thread when a breakpoint hits or stepping is
/// active, sending a paused message and waiting for Resume()/Step() from the
/// background reader thread.
/// </summary>
public class DebugContext
{
    private readonly HashSet<int> _breakpoints = new();
    private readonly ManualResetEventSlim _gate = new(true); // starts signaled (running)
    private volatile bool _stepping;
    private readonly TextWriter _output;
    private readonly string _cellId;
    private readonly CancellationToken _ct;
    private readonly Func<List<object>>? _varSnapshot;

    public DebugContext(TextWriter output, string cellId, CancellationToken ct,
                        IEnumerable<int>? breakpoints = null,
                        Func<List<object>>? varSnapshot = null)
    {
        _output = output;
        _cellId = cellId;
        _ct = ct;
        _varSnapshot = varSnapshot;
        if (breakpoints != null)
            foreach (var line in breakpoints)
                _breakpoints.Add(line);
    }

    /// <summary>
    /// Called from injected code before each statement. Fast path when no
    /// breakpoints are set and not stepping — single volatile read + HashSet check.
    /// </summary>
    public void Check(int line)
    {
        _ct.ThrowIfCancellationRequested();

        if (!_stepping && _breakpoints.Count == 0)
            return; // fast path: no debugging active

        if (!_stepping && !_breakpoints.Contains(line))
            return; // not at a breakpoint

        // Pause execution
        _stepping = false;
        _gate.Reset();
        SendPaused(line);
        _gate.Wait(_ct); // blocks until Resume()/Step() or cancellation
    }

    /// <summary>Resume execution, clearing step mode.</summary>
    public void Resume()
    {
        _stepping = false;
        _gate.Set();
    }

    /// <summary>Resume and pause again at the next Check() call.</summary>
    public void Step()
    {
        _stepping = true;
        _gate.Set();
    }

    /// <summary>Replace the set of active breakpoints.</summary>
    public void SetBreakpoints(IEnumerable<int> lines)
    {
        lock (_breakpoints)
        {
            _breakpoints.Clear();
            foreach (var line in lines)
                _breakpoints.Add(line);
        }
    }

    private void SendPaused(int line)
    {
        var variables = _varSnapshot?.Invoke() ?? new List<object>();
        _output.WriteLine(JsonSerializer.Serialize(new
        {
            type = "paused",
            id = _cellId,
            line,
            variables,
        }));
    }
}
