using System;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using FluentAssertions;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using SharpNoteKernel;
using StreamJsonRpc;
using Xunit;

namespace kernel.Tests;

public class LspServerTests
{
    [Fact]
    public void LspServer_ConnectPath_IsNonEmpty()
    {
        using var wm = new WorkspaceManager();
        using var server = new LspServer(wm);
        server.ConnectPath.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void LspServer_ConnectPath_IsOsAppropriate()
    {
        using var wm = new WorkspaceManager();
        using var server = new LspServer(wm);

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            server.ConnectPath.Should().StartWith("\\\\.\\pipe\\");
        else
            server.ConnectPath.Should().Contain("CoreFxPipe_sharpnote-lsp-");
    }

    [Fact]
    public async Task LspServer_Start_AcceptsConnection()
    {
        using var wm = new WorkspaceManager();
        using var server = new LspServer(wm);
        server.Start();

        // Allow the background WaitForConnectionAsync to begin
        await Task.Delay(100);

        using var client = new NamedPipeClientStream(
            ".", $"sharpnote-lsp-{Environment.ProcessId}",
            PipeDirection.InOut, PipeOptions.Asynchronous);

        await client.ConnectAsync(3000);
        client.IsConnected.Should().BeTrue();
    }

    [Fact]
    public async Task LspServer_Initialize_ReturnsCapabilities()
    {
        using var wm = new WorkspaceManager();
        using var server = new LspServer(wm);
        server.Start();

        await Task.Delay(100);

        using var client = new NamedPipeClientStream(
            ".", $"sharpnote-lsp-{Environment.ProcessId}",
            PipeDirection.InOut, PipeOptions.Asynchronous);
        await client.ConnectAsync(3000);

        var formatter = new JsonMessageFormatter();
        formatter.JsonSerializer.ContractResolver =
            new CamelCasePropertyNamesContractResolver();
        var msgHandler = new HeaderDelimitedMessageHandler(client, formatter);
        using var rpc = new JsonRpc(msgHandler);
        rpc.StartListening();

        var result = await rpc.InvokeAsync<JObject>("initialize",
            new JObject { ["capabilities"] = new JObject() });

        result.Should().NotBeNull();
        result["capabilities"].Should().NotBeNull();
        result["capabilities"]!["completionProvider"].Should().NotBeNull();
        result["capabilities"]!["signatureHelpProvider"].Should().NotBeNull();
    }

    [Fact]
    public async Task LspServer_DidChange_CompletionReturnsItems()
    {
        using var wm = new WorkspaceManager();
        using var server = new LspServer(wm);
        server.Start();

        await Task.Delay(100);

        using var client = new NamedPipeClientStream(
            ".", $"sharpnote-lsp-{Environment.ProcessId}",
            PipeDirection.InOut, PipeOptions.Asynchronous);
        await client.ConnectAsync(3000);

        var formatter = new JsonMessageFormatter();
        formatter.JsonSerializer.ContractResolver =
            new CamelCasePropertyNamesContractResolver();
        var msgHandler = new HeaderDelimitedMessageHandler(client, formatter);
        using var rpc = new JsonRpc(msgHandler);
        rpc.StartListening();

        await rpc.InvokeAsync<JObject>("initialize",
            new JObject { ["capabilities"] = new JObject() });

        await rpc.NotifyAsync("textDocument/didOpen", new JObject
        {
            ["textDocument"] = new JObject
            {
                ["uri"]        = "file:///script.csx",
                ["languageId"] = "csharp",
                ["version"]    = 1,
                ["text"]       = "Console."
            }
        });

        var completions = await rpc.InvokeAsync<JObject>("textDocument/completion", new JObject
        {
            ["textDocument"] = new JObject { ["uri"] = "file:///script.csx" },
            ["position"]     = new JObject { ["line"] = 0, ["character"] = 8 }
        });

        completions.Should().NotBeNull();
        var items = completions["items"] as JArray;
        items.Should().NotBeNullOrEmpty();
    }
}
