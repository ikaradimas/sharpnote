using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using SharpNoteKernel.Db;

namespace SharpNoteKernel;

// ── Kernel entry point ────────────────────────────────────────────────────────

partial class Program
{
    // ── Shared state accessible from all partial class handler files ──────────

    // Track loaded NuGet packages for the lifetime of this kernel process
    private static readonly HashSet<string> _loadedNugetKeys =
        new(StringComparer.OrdinalIgnoreCase);

    // Script state — the accumulated Roslyn script execution chain
    private static ScriptState<object?>? script;

    // DB connection state
    private static readonly Dictionary<string, DbConnectionInfo> attachedDbs = new();
    private static readonly List<MetadataReference> dbMetaRefs = new();

    // Cancellation token source for the current execution (set/cleared per execute)
    private static CancellationTokenSource? _execCts;

    // ── Entry point ───────────────────────────────────────────────────────────

    static async Task Main()
    {
        var realStdout = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
        Console.OutputEncoding = Encoding.UTF8;
        LogContext.Output = realStdout;

        // Allow Roslyn scripts to resolve dynamically compiled in-memory assemblies
        AppDomain.CurrentDomain.AssemblyResolve += (_, args) =>
        {
            var name = new AssemblyName(args.Name).Name;
            return AppDomain.CurrentDomain.GetAssemblies()
                .FirstOrDefault(a => a.GetName().Name == name);
        };

        var display = new DisplayHelper(realStdout);
        var globals = new ScriptGlobals { Display = display };

        var options = ScriptOptions.Default
            .AddImports(
                "System",
                "System.Collections",
                "System.Collections.Generic",
                "System.Linq",
                "System.Text",
                "System.IO",
                "System.Threading.Tasks",
                "System.Text.Json",
                "System.Net",
                "SharpNoteKernel"
            )
            .AddReferences(
                typeof(object).Assembly,
                typeof(Enumerable).Assembly,
                typeof(System.Net.WebUtility).Assembly,
                typeof(DisplayHelper).Assembly
            );

        // PosixSignalRegistration works for piped (non-terminal) processes,
        // unlike Console.CancelKeyPress which requires stdin to be a TTY.
        // The 'using var' keeps the registration alive for the kernel's lifetime.
        using var _sigIntReg = PosixSignalRegistration.Create(PosixSignal.SIGINT, ctx =>
        {
            ctx.Cancel = true;  // prevent default process termination
            _execCts?.Cancel();
        });

        realStdout.WriteLine(JsonSerializer.Serialize(new { type = "ready" }));

        // ── Background memory reporter ────────────────────────────────────────
        var memCts = new CancellationTokenSource();
        _ = Task.Run(async () =>
        {
            var proc = System.Diagnostics.Process.GetCurrentProcess();
            while (!memCts.Token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(3000, memCts.Token);
                    proc.Refresh();
                    var mb = Math.Round(proc.WorkingSet64 / (1024.0 * 1024.0), 1);
                    var json = JsonSerializer.Serialize(new { type = "memory_mb", mb });
                    lock (realStdout) { realStdout.WriteLine(json); }
                }
                catch (OperationCanceledException) { break; }
                catch { /* ignore transient errors */ }
            }
        });

        var stdin = new StreamReader(Console.OpenStandardInput());

        // A channel decouples stdin reading from message processing.
        // The background reader handles interrupt messages inline (cancels _execCts
        // immediately without queuing), so signals arrive even while the main loop
        // is blocked awaiting script execution.
        var msgChannel = Channel.CreateUnbounded<JsonElement>(
            new UnboundedChannelOptions { SingleReader = true });

        _ = Task.Run(async () =>
        {
            try
            {
                string? rawLine;
                while ((rawLine = await stdin.ReadLineAsync()) != null)
                {
                    if (string.IsNullOrWhiteSpace(rawLine)) continue;
                    try
                    {
                        using var doc = JsonDocument.Parse(rawLine);
                        var root = doc.RootElement.Clone();
                        // Interrupt is handled inline so it fires even mid-execution.
                        if (root.TryGetProperty("type", out var tp) && tp.GetString() == "interrupt")
                            _execCts?.Cancel();
                        else
                            await msgChannel.Writer.WriteAsync(root);
                    }
                    catch { }
                }
            }
            catch { }
            finally { msgChannel.Writer.TryComplete(); }
        });

        await foreach (var msg in msgChannel.Reader.ReadAllAsync())
        {
            var msgType = msg.TryGetProperty("type", out var typeEl) ? typeEl.GetString() : null;
            if (msgType == null) continue;

            switch (msgType)
            {
                case "execute":
                {
                    await HandleExecute(msg, options, globals, display, realStdout,
                        updatedOpts => options = updatedOpts);
                    break;
                }

                case "lint":
                {
                    HandleLint(msg, realStdout);
                    break;
                }

                case "autocomplete":
                {
                    HandleAutocomplete(msg, realStdout);
                    break;
                }

                case "preload_nugets":
                {
                    await HandlePreloadNugets(msg, options, realStdout,
                        updatedOpts => options = updatedOpts);
                    break;
                }

                case "reset":
                {
                    await HandleReset(options, globals, realStdout);
                    break;
                }

                case "db_connect":
                {
                    await HandleDbConnect(msg, options, globals, realStdout);
                    break;
                }

                case "db_disconnect":
                {
                    HandleDbDisconnect(msg, realStdout);
                    break;
                }

                case "db_refresh":
                {
                    await HandleDbRefresh(msg, realStdout);
                    break;
                }

                case "exit":
                    memCts.Cancel();
                    return;
            }
        }
    }
}
