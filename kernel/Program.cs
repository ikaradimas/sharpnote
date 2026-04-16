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

    // Roslyn workspace — shared across all handlers for completions, diagnostics, and signature help
    private static readonly WorkspaceManager _workspaceManager = new();

    // LSP server — exposes workspace over a named pipe; started during init
    private static readonly LspServer _lspServer = new(_workspaceManager);

    // ID of the cell currently being executed — set by HandleExecute, read by DbHelper
    internal static string? CurrentCellId;
    private static readonly Dictionary<string, JsonElement> _widgetValues = new();

    // Debug context for the currently executing cell — set by HandleExecute, used
    // by inline debug message handlers (resume/step/set_breakpoints).
    internal static DebugContext? _currentDebugCtx;

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

        var display = new DisplayHelper(realStdout, _widgetValues);
        var panels  = new PanelsHelper(realStdout);
        var db      = new DbHelper(realStdout);
        var data    = new DataHelper();
        var docker  = new DockerHelper(realStdout);
        var mock    = new MockHelper(realStdout);
        var files   = new FilesHelper(realStdout);
        var util    = new UtilHelper(realStdout);
        UtilContext.Current = util;
        var globals = new ScriptGlobals { Display = display, Panels = panels, Db = db, Data = data, Docker = docker, Mock = mock, Files = files };

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
                "System.Net.Http",
                "SharpNoteKernel",
                "Microsoft.EntityFrameworkCore"
            )
            .AddReferences(
                typeof(object).Assembly,
                typeof(Enumerable).Assembly,
                typeof(System.Net.WebUtility).Assembly,
                typeof(System.Net.Http.HttpClient).Assembly,
                typeof(DisplayHelper).Assembly,
                typeof(Microsoft.EntityFrameworkCore.DbContext).Assembly,
                typeof(Microsoft.EntityFrameworkCore.RelationalDatabaseFacadeExtensions).Assembly
            );

        // PosixSignalRegistration works for piped (non-terminal) processes,
        // unlike Console.CancelKeyPress which requires stdin to be a TTY.
        // The 'using var' keeps the registration alive for the kernel's lifetime.
        using var _sigIntReg = PosixSignalRegistration.Create(PosixSignal.SIGINT, ctx =>
        {
            ctx.Cancel = true;  // prevent default process termination
            _execCts?.Cancel();
        });

        _lspServer.Start();
        realStdout.WriteLine(JsonSerializer.Serialize(new { type = "ready", lspPipe = _lspServer.ConnectPath }));

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
                    var gcTotal = GC.CollectionCount(0) + GC.CollectionCount(1) + GC.CollectionCount(2);
                    var json = JsonSerializer.Serialize(new { type = "memory_mb", mb, gc = gcTotal });
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
                        // Interrupt and db_list_response are handled inline so they
                        // fire even while the main channel loop is blocked awaiting execution.
                        if (root.TryGetProperty("type", out var tp))
                        {
                            var msgType = tp.GetString();
                            if (msgType == "interrupt")
                            {
                                _execCts?.Cancel();
                            }
                            else if (msgType == "debug_resume")
                            {
                                _currentDebugCtx?.Resume();
                            }
                            else if (msgType == "debug_step")
                            {
                                _currentDebugCtx?.Step();
                            }
                            else if (msgType == "set_breakpoints")
                            {
                                var lines = root.TryGetProperty("lines", out var linesProp)
                                    ? linesProp.EnumerateArray()
                                        .Where(l => l.TryGetInt32(out _))
                                        .Select(l => l.GetInt32())
                                    : Array.Empty<int>();
                                _currentDebugCtx?.SetBreakpoints(lines);
                            }
                            else if (msgType == "db_list_response"
                                && root.TryGetProperty("requestId", out var ridProp))
                            {
                                var requestId = ridProp.GetString()!;
                                var conns = root.TryGetProperty("connections", out var connsProp)
                                    ? connsProp.EnumerateArray()
                                        .Select(c => new DbEntry(
                                            c.GetProperty("name").GetString()!,
                                            c.GetProperty("provider").GetString()!,
                                            c.TryGetProperty("isAttached", out var ia) && ia.GetBoolean()))
                                        .ToArray()
                                    : Array.Empty<DbEntry>();
                                db.ReceiveListResponse(requestId, conns);
                            }
                            else if (msgType == "db_add_result"
                                && root.TryGetProperty("requestId", out var addRidProp))
                            {
                                var requestId = addRidProp.GetString()!;
                                var error = root.TryGetProperty("error", out var errProp)
                                    ? errProp.GetString()
                                    : null;
                                db.ReceiveAddResult(requestId, error);
                            }
                            else if (msgType == "confirm_response"
                                && root.TryGetProperty("requestId", out var cRidProp))
                            {
                                var requestId = cRidProp.GetString()!;
                                var confirmed = root.TryGetProperty("confirmed", out var confProp)
                                    && confProp.GetBoolean();
                                util.ReceiveConfirmResponse(requestId, confirmed);
                            }
                            else if (msgType == "mock_response"
                                && root.TryGetProperty("requestId", out var mRidProp))
                            {
                                var requestId = mRidProp.GetString()!;
                                var data = root.TryGetProperty("data", out var dataProp)
                                    ? dataProp.Clone()
                                    : default;
                                mock.ReceiveResponse(requestId, data);
                            }
                            else if (msgType == "prompt_response"
                                && root.TryGetProperty("requestId", out var pRidProp))
                            {
                                var requestId = pRidProp.GetString()!;
                                var value = root.TryGetProperty("value", out var valProp)
                                    && valProp.ValueKind == JsonValueKind.String
                                    ? valProp.GetString()
                                    : null;
                                util.ReceivePromptResponse(requestId, value);
                            }
                            else
                            {
                                await msgChannel.Writer.WriteAsync(root);
                            }
                        }
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
                    await HandleLint(msg, realStdout);
                    break;
                }

                case "format":
                {
                    await HandleFormat(msg, realStdout);
                    break;
                }

                case "autocomplete":
                {
                    await HandleAutocomplete(msg, realStdout);
                    break;
                }

                case "signature":
                {
                    HandleSignature(msg, realStdout);
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

                case "execute_sql":
                {
                    await HandleExecuteSql(msg, options, globals, realStdout);
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

                case "execute_http":
                {
                    await HandleExecuteHttp(msg, options, globals, realStdout);
                    break;
                }

                case "execute_shell":
                {
                    await HandleExecuteShell(msg, realStdout);
                    break;
                }

                case "execute_docker":
                {
                    await HandleExecuteDocker(msg, realStdout);
                    break;
                }

                case "stop_docker":
                {
                    await HandleStopDocker(msg, realStdout);
                    break;
                }

                case "docker_status":
                {
                    await HandleDockerStatus(msg, realStdout);
                    break;
                }

                case "docker_logs":
                {
                    await HandleDockerLogs(msg, realStdout);
                    break;
                }

                case "set_embedded_files":
                {
                    if (msg.TryGetProperty("files", out var filesArr))
                        files.LoadAll(filesArr);
                    break;
                }

                case "execute_check":
                {
                    await HandleExecuteCheck(msg, options, globals, realStdout);
                    break;
                }

                case "execute_decision":
                {
                    await HandleExecuteDecision(msg, options, globals, realStdout);
                    break;
                }

                case "db_test":
                {
                    await HandleDbTest(msg, realStdout);
                    break;
                }

                case "db_redis_scan":
                {
                    await HandleDbRedisScan(msg, realStdout);
                    break;
                }

                case "widget_change":
                {
                    if (msg.TryGetProperty("widgetKey", out var wkProp))
                    {
                        var widgetKey = wkProp.GetString();
                        if (widgetKey != null && msg.TryGetProperty("value", out var wvProp))
                            _widgetValues[widgetKey] = wvProp.Clone();
                    }
                    break;
                }

                case "var_inspect":
                {
                    HandleVarInspect(msg, realStdout);
                    break;
                }

                case "exit":
                    CleanupAllDockerContainers(realStdout);
                    memCts.Cancel();
                    return;
            }
        }
    }
}
