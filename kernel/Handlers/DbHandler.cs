using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using SharpNoteKernel;
using SharpNoteKernel.Db;

namespace SharpNoteKernel;

partial class Program
{
    // Helper: inject a DB variable into the script state.
    // Handles three cases:
    //   1. Non-relational (Redis)     — injects ConnectionMultiplexer + IDatabase
    //   2. Persistent-connection      — injects keeper SqliteConnection + connection-based DbContext
    //   3. Regular relational (default) — injects string-based DbContext
    internal static async Task InjectDbContextAsync(
        DbConnectionInfo info, ScriptOptions options, ScriptGlobals globals, bool isReconnect = false)
    {
        var provider = DbProviders.Get(info.Provider);
        var opts     = options.AddReferences(dbMetaRefs);
        // On reconnect: skip 'var' (variable already exists in script state) and
        // cast through dynamic (new type is in a unique namespace to avoid CS0433,
        // but the old variable was declared with the previous namespace's type).
        var decl = isReconnect ? "" : "var ";
        var cast = isReconnect ? "(dynamic)" : "";
        string code;

        if (!provider.IsRelational)
        {
            // Redis: inject a ConnectionMultiplexer and expose GetDatabase() as the variable
            var muxVar = $"__{info.VarName}_mux";
            code = $"{decl}{muxVar} = {cast}StackExchange.Redis.ConnectionMultiplexer.Connect({S(info.ConnectionString)});\n" +
                   $"{decl}{info.VarName} = {muxVar}.GetDatabase();";
        }
        else if (provider.UsesPersistentConnection)
        {
            // In-memory SQLite: open a keeper connection to prevent the shared-cache DB from vanishing,
            // then create a DbContext that reuses that same connection.
            var ctx       = info.ContextTypeName ?? DbCodeGen.ContextTypeName(info.Name);
            var keeperVar = $"__{info.VarName}_conn";
            code = $"{decl}{keeperVar} = {cast}new Microsoft.Data.Sqlite.SqliteConnection({S(info.ConnectionString)});\n" +
                   $"{keeperVar}.Open();\n" +
                   $"{decl}{info.VarName} = {cast}new {ctx}({keeperVar});";
        }
        else
        {
            // Regular relational: string-based DbContext
            var ctx = info.ContextTypeName ?? DbCodeGen.ContextTypeName(info.Name);
            code = $"{decl}{info.VarName} = {cast}new {ctx}({S(info.ConnectionString)}, {S(info.Provider)});";
        }

        script = script == null
            ? await CSharpScript.RunAsync<object?>(code, opts, globals, typeof(ScriptGlobals))
            : await script.ContinueWithAsync<object?>(code, opts);
    }

    // Safe C# string literal
    private static string S(string value) => JsonSerializer.Serialize(value);

    private static string BuildDbPreamble()
    {
        var sb = new StringBuilder();
        foreach (var info in attachedDbs.Values)
        {
            var provider = DbProviders.Get(info.Provider);
            var typeName = !provider.IsRelational
                ? "StackExchange.Redis.IDatabase"
                : info.ContextTypeName ?? DbCodeGen.ContextTypeName(info.Name);
            sb.AppendLine($"{typeName} {info.VarName} = default!;");
        }
        return sb.ToString();
    }

    // ── db_connect handler ────────────────────────────────────────────────────

    internal static async Task HandleDbConnect(
        JsonElement msg,
        ScriptOptions options,
        ScriptGlobals globals,
        TextWriter realStdout)
    {
        var connectionId  = msg.GetProperty("connectionId").GetString()!;
        var connName      = msg.GetProperty("name").GetString()!;
        var providerKey   = msg.GetProperty("provider").GetString()!;
        var connString    = msg.GetProperty("connectionString").GetString()!;
        var varName       = msg.TryGetProperty("varName", out var vnProp)
            ? vnProp.GetString() ?? DbCodeGen.SanitizeVarName(connName)
            : DbCodeGen.SanitizeVarName(connName);
        var cellId        = msg.TryGetProperty("cellId", out var cidProp) ? cidProp.GetString() : null;

        try
        {
            var provider = DbProviders.Get(providerKey);

            // Normalize the connection string (e.g. adds Mode=Memory for in-memory SQLite)
            var effectiveCs = provider.NormalizeConnectionString(connectionId, connString);

            // 1. Introspect schema
            var schema = await provider.IntrospectAsync(connectionId, effectiveCs);

            // 2. Send schema to renderer for tree display
            var schemaPayload = new
            {
                type         = "db_schema",
                connectionId,
                databaseName = schema.DatabaseName,
                redisCursor  = schema.RedisCursor,
                tables       = schema.Tables.Select(t => new
                {
                    schema   = t.Schema,
                    name     = t.Name,
                    columns  = t.Columns.Select(c => new
                    {
                        name        = c.Name,
                        dbType      = c.DbType,
                        csharpType  = c.CSharpType,
                        isPrimaryKey= c.IsPrimaryKey,
                        isNullable  = c.IsNullable,
                        isIdentity  = c.IsIdentity,
                        sampleValue = c.SampleValue,
                    }).ToList(),
                }).ToList(),
            };
            lock (realStdout) { realStdout.WriteLine(JsonSerializer.Serialize(schemaPayload)); }

            MetadataReference metaRef;
            string? contextTypeName = null;
            if (!provider.IsRelational)
            {
                // Non-relational (Redis): skip EF Core codegen; add the provider's assembly
                // to the script references so StackExchange.Redis types resolve in user code.
                var provAsm = provider.RequiredAssemblies.FirstOrDefault();
                metaRef = provAsm != null && !string.IsNullOrEmpty(provAsm.Location)
                    ? MetadataReference.CreateFromFile(provAsm.Location)
                    : MetadataReference.CreateFromFile(typeof(object).Assembly.Location);
            }
            else
            {
                // 3. Generate + compile DbContext
                // Use a unique namespace suffix on reconnect so the new type doesn't
                // collide with the old (still loaded) assembly in the Roslyn script state.
                var isRecompile = attachedDbs.ContainsKey(connectionId);
                var nsSuffix = isRecompile ? Guid.NewGuid().ToString("N")[..8] : null;
                var source = DbCodeGen.GenerateSource(connName, provider, schema, nsSuffix);
                (_, metaRef) = DbCodeGen.Compile(source, provider);
                contextTypeName = DbCodeGen.ContextTypeName(connName, nsSuffix);
            }

            // 4. Update state
            var isReconnect = attachedDbs.TryGetValue(connectionId, out var existing);
            if (isReconnect)
                dbMetaRefs.Remove(existing!.MetaRef);
            dbMetaRefs.Add(metaRef);
            _workspaceManager.ReplaceReference(existing?.MetaRef, metaRef);

            var info = new DbConnectionInfo(connectionId, connName, providerKey, effectiveCs, varName, metaRef, schema, contextTypeName);
            attachedDbs[connectionId] = info;
            _workspaceManager.SetDynamicPreamble(BuildDbPreamble());

            // 5. Inject variable (skip 'var' on reconnect to avoid duplicate declaration)
            await InjectDbContextAsync(info, options, globals, isReconnect);

            // 6. Confirm ready
            lock (realStdout) { realStdout.WriteLine(JsonSerializer.Serialize(new { type = "db_ready", connectionId, varName })); }
        }
        catch (Exception ex)
        {
            lock (realStdout) { realStdout.WriteLine(JsonSerializer.Serialize(new { type = "db_error", connectionId, cellId, message = ex.Message })); }
        }
    }

    // ── db_disconnect handler ─────────────────────────────────────────────────

    internal static void HandleDbDisconnect(JsonElement msg, TextWriter realStdout)
    {
        var connectionId = msg.GetProperty("connectionId").GetString()!;
        if (attachedDbs.TryGetValue(connectionId, out var info))
        {
            dbMetaRefs.Remove(info.MetaRef);
            attachedDbs.Remove(connectionId);
            _workspaceManager.SetDynamicPreamble(BuildDbPreamble());
        }
        lock (realStdout) { realStdout.WriteLine(JsonSerializer.Serialize(new { type = "db_disconnected", connectionId })); }
    }

    // ── db_refresh handler ────────────────────────────────────────────────────

    internal static async Task HandleDbRefresh(JsonElement msg, TextWriter realStdout)
    {
        var connectionId = msg.GetProperty("connectionId").GetString()!;
        if (!attachedDbs.TryGetValue(connectionId, out var info))
            return;

        try
        {
            var provider = DbProviders.Get(info.Provider);
            var schema   = await provider.IntrospectAsync(connectionId, info.ConnectionString);

            var schemaPayload = new
            {
                type         = "db_schema",
                connectionId,
                databaseName = schema.DatabaseName,
                tables       = schema.Tables.Select(t => new
                {
                    schema   = t.Schema,
                    name     = t.Name,
                    columns  = t.Columns.Select(c => new
                    {
                        name        = c.Name,
                        dbType      = c.DbType,
                        csharpType  = c.CSharpType,
                        isPrimaryKey= c.IsPrimaryKey,
                        isNullable  = c.IsNullable,
                        isIdentity  = c.IsIdentity,
                        sampleValue = c.SampleValue,
                    }).ToList(),
                }).ToList(),
            };
            lock (realStdout) { realStdout.WriteLine(JsonSerializer.Serialize(schemaPayload)); }
            attachedDbs[connectionId] = info with { Schema = schema };
        }
        catch (Exception ex)
        {
            lock (realStdout) { realStdout.WriteLine(JsonSerializer.Serialize(new { type = "db_error", connectionId, message = ex.Message })); }
        }
    }

    // ── db_test handler ──────────────────────────────────────────────────────

    /// <summary>
    /// Tests a database connection without attaching. Opens a connection,
    /// runs a lightweight check, closes it, and reports success or failure.
    /// </summary>
    internal static async Task HandleDbTest(JsonElement msg, TextWriter realStdout)
    {
        var providerKey = msg.GetProperty("provider").GetString()!;
        var connString  = msg.GetProperty("connectionString").GetString()!;
        var requestId   = msg.TryGetProperty("requestId", out var ridProp) ? ridProp.GetString() : null;

        try
        {
            var provider    = DbProviders.Get(providerKey);
            var effectiveCs = provider.NormalizeConnectionString("__test__", connString);

            // For Redis, just try to connect the multiplexer
            if (!provider.IsRelational)
            {
                var mux = await StackExchange.Redis.ConnectionMultiplexer.ConnectAsync(effectiveCs);
                await mux.DisposeAsync();
            }
            else
            {
                // Use the provider's IntrospectAsync which opens and queries the DB.
                // This is a thorough test — verifies both connectivity and permissions.
                await provider.IntrospectAsync("__test__", effectiveCs);
            }

            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "db_test_result", success = true, requestId }));
            }
        }
        catch (Exception ex)
        {
            lock (realStdout)
            {
                realStdout.WriteLine(JsonSerializer.Serialize(new
                    { type = "db_test_result", success = false, message = ex.Message, requestId }));
            }
        }
    }

    // ── db_redis_scan handler ────────────────────────────────────────────────

    internal static async Task HandleDbRedisScan(JsonElement msg, TextWriter realStdout)
    {
        var connectionId = msg.GetProperty("connectionId").GetString()!;
        var cursor       = msg.TryGetProperty("cursor", out var curProp) ? curProp.GetInt64() : 0;
        if (!attachedDbs.TryGetValue(connectionId, out var info))
            return;

        try
        {
            var schema = await RedisProvider.ScanKeysAsync(
                connectionId, info.ConnectionString, cursor, RedisProvider.DefaultPageSize);

            var payload = new
            {
                type         = "db_redis_page",
                connectionId,
                redisCursor  = schema.RedisCursor,
                tables       = schema.Tables.Select(t => new
                {
                    schema   = t.Schema,
                    name     = t.Name,
                    columns  = t.Columns.Select(c => new
                    {
                        name        = c.Name,
                        dbType      = c.DbType,
                        csharpType  = c.CSharpType,
                        isPrimaryKey= c.IsPrimaryKey,
                        isNullable  = c.IsNullable,
                        isIdentity  = c.IsIdentity,
                        sampleValue = c.SampleValue,
                    }).ToList(),
                }).ToList(),
            };
            lock (realStdout) { realStdout.WriteLine(JsonSerializer.Serialize(payload)); }
        }
        catch (Exception ex)
        {
            lock (realStdout) { realStdout.WriteLine(JsonSerializer.Serialize(new { type = "db_error", connectionId, message = ex.Message })); }
        }
    }
}
