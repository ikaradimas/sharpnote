using System;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Serialization;
using StreamJsonRpc;

namespace SharpNoteKernel;

// ── LSP parameter records ─────────────────────────────────────────────────────
// Newtonsoft.Json with CamelCasePropertyNamesContractResolver maps camelCase
// JSON keys (LSP wire format) to PascalCase record constructor parameters.

public sealed record LspPosition(int Line, int Character);
public sealed record LspTextDocumentItem(string Uri, string LanguageId, int Version, string Text);
public sealed record LspVersionedTextDocumentIdentifier(string Uri, int Version);
public sealed record LspTextDocumentIdentifier(string Uri);
public sealed record LspContentChangeEvent(string Text);
public sealed record LspDidOpenParams(LspTextDocumentItem TextDocument);
public sealed record LspDidChangeParams(
    LspVersionedTextDocumentIdentifier TextDocument,
    LspContentChangeEvent[] ContentChanges);
public sealed record LspCompletionParams(LspTextDocumentIdentifier TextDocument, LspPosition Position);
public sealed record LspSignatureHelpParams(LspTextDocumentIdentifier TextDocument, LspPosition Position);

// ── LspServer ─────────────────────────────────────────────────────────────────
//
// Exposes WorkspaceManager over a named pipe using LSP JSON-RPC 2.0.
// One instance per kernel process, started during init.
// The kernel's existing stdin/stdout protocol is unaffected.

public sealed class LspServer : IDisposable
{
    private readonly WorkspaceManager _wm;
    private readonly string _pipeName;
    private readonly CancellationTokenSource _cts = new();

    /// <summary>Path clients use to connect (OS-specific named pipe or socket path).</summary>
    public string ConnectPath { get; }

    public LspServer(WorkspaceManager wm)
    {
        _wm = wm;
        _pipeName = $"sharpnote-lsp-{Environment.ProcessId}";

        // On Unix, .NET creates a domain socket at GetTempPath()/CoreFxPipe_{name}
        ConnectPath = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? $"\\\\.\\pipe\\{_pipeName}"
            : Path.Combine(Path.GetTempPath(), $"CoreFxPipe_{_pipeName}");
    }

    public void Start() => _ = RunAsync(_cts.Token);

    private async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await using var pipe = new NamedPipeServerStream(
                    _pipeName,
                    PipeDirection.InOut,
                    NamedPipeServerStream.MaxAllowedServerInstances,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous);

                await pipe.WaitForConnectionAsync(ct);

                var handlers  = new LspHandlers(_wm);
                var formatter = new JsonMessageFormatter();
                formatter.JsonSerializer.ContractResolver =
                    new CamelCasePropertyNamesContractResolver();

                var msgHandler = new HeaderDelimitedMessageHandler(pipe, formatter);
                var rpc        = new JsonRpc(msgHandler);
                rpc.AddLocalRpcTarget(handlers, new JsonRpcTargetOptions
                {
                    UseSingleObjectParameterDeserialization = true,
                });
                handlers.SetRpc(rpc);
                rpc.StartListening();
                await rpc.Completion;
            }
            catch (OperationCanceledException) { break; }
            catch { /* client disconnected — loop back to accept next */ }
        }
    }

    public void Dispose() => _cts.Cancel();
}

// ── LspHandlers ───────────────────────────────────────────────────────────────

internal sealed class LspHandlers
{
    private readonly WorkspaceManager _wm;
    private JsonRpc? _rpc;
    private string _documentText = "";
    private string _documentUri  = "file:///script.csx";

    public LspHandlers(WorkspaceManager wm) => _wm = wm;
    public void SetRpc(JsonRpc rpc) => _rpc = rpc;

    [JsonRpcMethod("initialize")]
    public object Initialize(object? @params = null) => new
    {
        capabilities = new
        {
            textDocumentSync = 1, // TextDocumentSyncKind.Full
            completionProvider = new
            {
                triggerCharacters = new[] { ".", " " },
                resolveProvider   = false,
            },
            signatureHelpProvider = new
            {
                triggerCharacters = new[] { "(", "," },
            },
        },
        serverInfo = new { name = "SharpNote", version = "1.0" }
    };

    [JsonRpcMethod("initialized")]
    public void Initialized() { }

    [JsonRpcMethod("shutdown")]
    public object? Shutdown() => null;

    [JsonRpcMethod("exit")]
    public void Exit() { }

    [JsonRpcMethod("textDocument/didOpen")]
    public void DidOpen(LspDidOpenParams @params)
    {
        _documentUri  = @params.TextDocument.Uri;
        _documentText = @params.TextDocument.Text;
        _wm.UpdateDocument(_documentText);
    }

    [JsonRpcMethod("textDocument/didChange")]
    public async Task DidChangeAsync(LspDidChangeParams @params)
    {
        _documentUri  = @params.TextDocument.Uri;
        _documentText = @params.ContentChanges.LastOrDefault()?.Text ?? "";
        _wm.UpdateDocument(_documentText);
        await PushDiagnosticsAsync();
    }

    [JsonRpcMethod("textDocument/completion")]
    public async Task<object> CompletionAsync(LspCompletionParams @params)
    {
        var offset = ToOffset(@params.Position);
        var items  = await _wm.GetCompletionsAsync(offset);
        return new
        {
            isIncomplete = false,
            items = items.Select(c => new
            {
                label    = c.Label,
                kind     = MapCompletionKind(c.Kind),
                detail   = c.Detail,
                sortText = c.SortText,
            }).ToList()
        };
    }

    [JsonRpcMethod("textDocument/signatureHelp")]
    public async Task<object?> SignatureHelpAsync(LspSignatureHelpParams @params)
    {
        var offset = ToOffset(@params.Position);
        var help   = await _wm.GetSignatureHelpAsync(offset);
        if (help.Signatures.Count == 0) return null;
        return new
        {
            signatures = help.Signatures.Select(s => new
            {
                label      = s.Label,
                parameters = s.Parameters.Select(p => new { label = p.Label }).ToList()
            }).ToList(),
            activeSignature = 0,
            activeParameter = help.ActiveParameter,
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task PushDiagnosticsAsync()
    {
        if (_rpc is null) return;
        try
        {
            var diags = await _wm.GetDiagnosticsAsync();
            await _rpc.NotifyAsync("textDocument/publishDiagnostics", new
            {
                uri = _documentUri,
                diagnostics = diags.Select(d =>
                {
                    var (sl, sc) = ToLineChar(d.From);
                    var (el, ec) = ToLineChar(d.To);
                    return new
                    {
                        range = new
                        {
                            start = new { line = sl, character = sc },
                            end   = new { line = el, character = ec },
                        },
                        severity = d.Severity == "error" ? 1 : 2,
                        message  = d.Message,
                    };
                }).ToList()
            });
        }
        catch { /* connection may have closed between didChange and push */ }
    }

    /// <summary>Converts an LSP {line, character} position to a flat char offset.</summary>
    private int ToOffset(LspPosition pos)
    {
        var offset = 0;
        var line   = 0;
        foreach (var ch in _documentText)
        {
            if (line == pos.Line) break;
            offset++;
            if (ch == '\n') line++;
        }
        return offset + pos.Character;
    }

    /// <summary>Converts a flat char offset to an LSP {line, character} position.</summary>
    private (int line, int character) ToLineChar(int offset)
    {
        var line      = 0;
        var lineStart = 0;
        for (var i = 0; i < Math.Min(offset, _documentText.Length); i++)
        {
            if (_documentText[i] == '\n') { line++; lineStart = i + 1; }
        }
        return (line, offset - lineStart);
    }

    private static int MapCompletionKind(string kind) => kind switch
    {
        "function"  => 3,   // Function
        "property"  => 10,  // Property
        "variable"  => 6,   // Variable
        "class"     => 7,   // Class
        "interface" => 8,   // Interface
        "enum"      => 13,  // Enum
        "keyword"   => 14,  // Keyword
        "namespace" => 9,   // Module
        "constant"  => 21,  // Constant
        _           => 1,   // Text
    };
}
