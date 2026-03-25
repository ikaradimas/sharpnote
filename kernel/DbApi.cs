using System;
using System.Collections.Concurrent;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SharpNoteKernel;

/// <summary>Database provider string constants — pass to <see cref="DbHelper.Add"/>.</summary>
public static class DbProvider
{
    public const string Sqlite       = "sqlite";
    public const string SqliteMemory = "sqlite_memory";
    public const string SqlServer    = "sqlserver";
    public const string PostgreSql   = "postgresql";
    public const string Redis        = "redis";
}

/// <summary>Describes one entry in the global database connection list.</summary>
/// <param name="Name">The connection name / variable prefix used in scripts.</param>
/// <param name="Provider">Provider key — one of the <see cref="DbProvider"/> constants.</param>
/// <param name="IsAttached">True when the connection is currently attached to the active notebook.</param>
public record DbEntry(string Name, string Provider, bool IsAttached);

/// <summary>
/// Manages database connections from within a script.
/// Exposed to scripts as the global <c>Db</c> variable.
/// </summary>
public class DbHelper
{
    private readonly TextWriter _out;
    private readonly ConcurrentDictionary<string, TaskCompletionSource<DbEntry[]>> _pending    = new();
    private readonly ConcurrentDictionary<string, TaskCompletionSource<string?>>   _pendingAdd = new();

    public DbHelper(TextWriter output) => _out = output;

    // ── Request / response ─────────────────────────────────────────────────────

    /// <summary>
    /// Adds a new connection to the global connection list visible in the DB panel.
    /// The connection is not attached to any notebook automatically — call
    /// <see cref="Attach"/> afterwards.
    /// </summary>
    /// <exception cref="InvalidOperationException">Thrown if a connection with <paramref name="name"/> already exists.</exception>
    /// <exception cref="TimeoutException">Thrown if the renderer does not respond within 10 seconds.</exception>
    public async Task AddAsync(string name, string provider, string connectionString)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];
        var tcs = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pendingAdd[requestId] = tcs;
        Send(new { type = "db_add", requestId, name, provider, connectionString });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        cts.Token.Register(() =>
        {
            if (_pendingAdd.TryRemove(requestId, out var t))
                t.TrySetException(new TimeoutException("Db.AddAsync() timed out waiting for a response."));
        });

        var error = await tcs.Task.ConfigureAwait(false);
        if (error != null)
            throw new InvalidOperationException(error);
    }

    /// <summary>Called by Program.cs when a <c>db_add_result</c> arrives on stdin.</summary>
    internal void ReceiveAddResult(string requestId, string? error)
    {
        if (_pendingAdd.TryRemove(requestId, out var tcs))
            tcs.TrySetResult(error);
    }

    // ── Fire-and-forget operations ─────────────────────────────────────────────

    /// <summary>
    /// Removes the named connection from the global connection list.
    /// Any notebooks that have it attached will have it detached automatically.
    /// </summary>
    public void Remove(string name) =>
        Send(new { type = "db_remove", name });

    /// <summary>
    /// Attaches the named connection to the active notebook, triggering schema
    /// introspection and DbContext code generation. The connection must already
    /// exist in the global list (add it with <see cref="Add"/> first if needed).
    /// </summary>
    public void Attach(string name) =>
        Send(new { type = "db_attach", name, cellId = Program.CurrentCellId });

    /// <summary>Detaches the named connection from the active notebook.</summary>
    public void Detach(string name) =>
        Send(new { type = "db_detach", name });

    // ── Request / response ─────────────────────────────────────────────────────

    /// <summary>
    /// Returns all connections in the global list, each annotated with whether
    /// it is currently attached to the active notebook.
    /// </summary>
    /// <exception cref="TimeoutException">Thrown if the renderer does not respond within 10 seconds.</exception>
    public async Task<DbEntry[]> ListAsync()
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];
        var tcs = new TaskCompletionSource<DbEntry[]>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[requestId] = tcs;
        Send(new { type = "db_list_request", requestId });

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        cts.Token.Register(() =>
        {
            if (_pending.TryRemove(requestId, out var t))
                t.TrySetException(new TimeoutException("Db.ListAsync() timed out waiting for a response."));
        });

        return await tcs.Task.ConfigureAwait(false);
    }

    /// <summary>Called by Program.cs when a <c>db_list_response</c> arrives on stdin.</summary>
    internal void ReceiveListResponse(string requestId, DbEntry[] connections)
    {
        if (_pending.TryRemove(requestId, out var tcs))
            tcs.TrySetResult(connections);
    }

    private void Send(object payload) =>
        _out.WriteLine(JsonSerializer.Serialize(payload));
}
