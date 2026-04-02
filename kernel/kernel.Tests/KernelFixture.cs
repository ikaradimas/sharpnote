using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace kernel.Tests;

/// <summary>
/// Shared kernel process fixture — starts a single kernel per test class and
/// resets state between tests instead of spawning a new process each time.
/// Implement <c>IClassFixture&lt;KernelFixture&gt;</c> on your test class to use.
/// </summary>
public class KernelFixture : IAsyncLifetime
{
    private Process? _proc;
    private StreamWriter? _stdin;
    private readonly List<JsonElement> _received = new();
    private readonly SemaphoreSlim _messageSignal = new(0);
    private Task? _readerTask;
    private bool _running;

    // ── Lifecycle (called once per test class) ───────────────────────────────

    public async Task InitializeAsync()
    {
        var kernelDir   = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var projectPath = Path.Combine(kernelDir, "kernel.csproj");

        var psi = new ProcessStartInfo
        {
            FileName               = "dotnet",
            Arguments              = $"run --project \"{projectPath}\" --no-launch-profile",
            RedirectStandardInput  = true,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            WorkingDirectory       = kernelDir,
        };

        _proc = Process.Start(psi)!;
        _stdin = new StreamWriter(_proc.StandardInput.BaseStream, System.Text.Encoding.UTF8)
            { AutoFlush = true };

        _running = true;
        _readerTask = Task.Run(async () =>
        {
            var reader = new StreamReader(_proc.StandardOutput.BaseStream);
            while (_running && !_proc.HasExited)
            {
                var line = await reader.ReadLineAsync();
                if (line is null) break;
                try
                {
                    var el = JsonSerializer.Deserialize<JsonElement>(line);
                    lock (_received) _received.Add(el);
                    _messageSignal.Release();
                }
                catch { /* skip non-JSON lines */ }
            }
        });

        // Wait for 'ready' message (up to 30 s for first dotnet run with restore)
        await WaitForMessageAsync(
            el => el.TryGetProperty("type", out var t) && t.GetString() == "ready",
            timeoutMs: 30_000);
    }

    public async Task DisposeAsync()
    {
        _running = false;
        try { if (_stdin != null) await _stdin.WriteLineAsync(JsonSerializer.Serialize(new { type = "exit" })); } catch { }
        try { _proc?.Kill(entireProcessTree: true); } catch { }
        if (_readerTask != null) await _readerTask.WaitAsync(TimeSpan.FromSeconds(3)).ConfigureAwait(false);
        _proc?.Dispose();
        _stdin?.Dispose();
    }

    // ── Public API for test methods ──────────────────────────────────────────

    /// <summary>Sends a reset message and waits for reset_complete, then clears buffers.</summary>
    public async Task ResetAsync()
    {
        await SendAsync(new { type = "reset" });
        await WaitForMessageAsync(
            el => el.TryGetProperty("type", out var t) && t.GetString() == "reset_complete",
            timeoutMs: 10_000);
        ClearMessages();
    }

    public async Task SendAsync(object msg)
    {
        var json = JsonSerializer.Serialize(msg);
        await _stdin!.WriteLineAsync(json);
    }

    public async Task<JsonElement> WaitForMessageAsync(
        Func<JsonElement, bool> predicate, int timeoutMs = 10_000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            lock (_received)
            {
                var match = _received.FirstOrDefault(predicate);
                if (match.ValueKind != JsonValueKind.Undefined) return match;
            }
            await _messageSignal.WaitAsync(500);
        }
        throw new TimeoutException($"Timed out waiting for kernel message (timeout={timeoutMs}ms)");
    }

    public void ClearMessages() { lock (_received) _received.Clear(); }

    public List<JsonElement> GetMessages()
    {
        lock (_received) return _received.ToList();
    }

    public static string NewId() => Guid.NewGuid().ToString("N")[..8];
}
