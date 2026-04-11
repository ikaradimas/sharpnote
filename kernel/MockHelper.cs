using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SharpNoteKernel;

/// <summary>
/// Scripting API for controlling mock API servers from C# code cells.
/// Mock servers run in the Electron main process; this helper communicates
/// via the kernel's stdout/stdin message protocol.
/// </summary>
public class MockHelper
{
    private readonly TextWriter _out;
    private CancellationToken _currentToken;
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonElement>> _pending = new();

    public MockHelper(TextWriter output) => _out = output;

    internal void SetCancellationToken(CancellationToken ct) => _currentToken = ct;

    /// <summary>Start a mock server for the given API definition. Returns the assigned port.</summary>
    public async Task<int> StartAsync(object apiDef, int port = 0)
    {
        var resp = await RequestAsync("start", new { apiDef, port });
        if (resp.TryGetProperty("error", out var errProp))
            throw new InvalidOperationException($"Mock server start failed: {errProp.GetString()}");
        return resp.GetProperty("port").GetInt32();
    }

    /// <summary>Stop a mock server by ID.</summary>
    public async Task StopAsync(string id)
    {
        await RequestAsync("stop", new { id });
    }

    /// <summary>Stop all running mock servers.</summary>
    public async Task StopAllAsync()
    {
        await RequestAsync("stop_all", new { });
    }

    /// <summary>List all running mock servers.</summary>
    public async Task<List<MockServerInfo>> ListAsync()
    {
        var resp = await RequestAsync("list", new { });
        var list = new List<MockServerInfo>();
        if (resp.TryGetProperty("servers", out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                list.Add(new MockServerInfo(
                    item.TryGetProperty("id", out var idp) ? idp.GetString() ?? "" : "",
                    item.TryGetProperty("port", out var pp) ? pp.GetInt32() : 0,
                    item.TryGetProperty("title", out var tp) ? tp.GetString() ?? "" : ""
                ));
            }
        }
        return list;
    }

    private async Task<JsonElement> RequestAsync(string action, object payload)
    {
        var requestId = Guid.NewGuid().ToString("N")[..12];
        var tcs = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[requestId] = tcs;

        lock (_out)
        {
            _out.WriteLine(JsonSerializer.Serialize(new
            {
                type = "mock_request",
                requestId,
                action,
                payload,
            }));
        }

        try
        {
            return await tcs.Task.WaitAsync(_currentToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        finally
        {
            _pending.TryRemove(requestId, out _);
        }
    }

    /// <summary>Called by the stdin reader when a mock_response arrives.</summary>
    internal void ReceiveResponse(string requestId, JsonElement data)
    {
        if (_pending.TryGetValue(requestId, out var tcs))
            tcs.TrySetResult(data);
    }
}

public record MockServerInfo(string Id, int Port, string Title);
