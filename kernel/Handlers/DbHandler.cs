using System;
using System.IO;
using System.Linq;
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
    internal static async Task InjectDbContextAsync(DbConnectionInfo info, ScriptOptions options, ScriptGlobals globals)
    {
        var provider = DbProviders.Get(info.Provider);
        var opts     = options.AddReferences(dbMetaRefs);
        string code;

        if (!provider.IsRelational)
        {
            // Redis: inject a ConnectionMultiplexer and expose GetDatabase() as the variable
            var muxVar = $"__{info.VarName}_mux";
            code = $"var {muxVar} = StackExchange.Redis.ConnectionMultiplexer.Connect({S(info.ConnectionString)});\n" +
                   $"var {info.VarName} = {muxVar}.GetDatabase();";
        }
        else if (provider.UsesPersistentConnection)
        {
            // In-memory SQLite: open a keeper connection to prevent the shared-cache DB from vanishing,
            // then create a DbContext that reuses that same connection.
            var ns        = $"DynDb_{DbCodeGen.SanitizeTypeName(info.Name)}";
            var ctx       = $"{ns}.{DbCodeGen.SanitizeTypeName(info.Name)}DbContext";
            var keeperVar = $"__{info.VarName}_conn";
            code = $"var {keeperVar} = new Microsoft.Data.Sqlite.SqliteConnection({S(info.ConnectionString)});\n" +
                   $"{keeperVar}.Open();\n" +
                   $"var {info.VarName} = new {ctx}({keeperVar});";
        }
        else
        {
            // Regular relational: string-based DbContext
            var ns  = $"DynDb_{DbCodeGen.SanitizeTypeName(info.Name)}";
            var ctx = $"{ns}.{DbCodeGen.SanitizeTypeName(info.Name)}DbContext";
            code = $"var {info.VarName} = new {ctx}({S(info.ConnectionString)}, {S(info.Provider)});";
        }

        script = script == null
            ? await CSharpScript.RunAsync<object?>(code, opts, globals, typeof(ScriptGlobals))
            : await script.ContinueWithAsync<object?>(code, opts);
    }

    // Safe C# string literal
    private static string S(string value) => JsonSerializer.Serialize(value);

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
                    }).ToList(),
                }).ToList(),
            };
            lock (realStdout) { realStdout.WriteLine(JsonSerializer.Serialize(schemaPayload)); }

            MetadataReference metaRef;
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
                var source = DbCodeGen.GenerateSource(connName, provider, schema);
                (_, metaRef) = DbCodeGen.Compile(source, provider);
            }

            // 4. Update state
            if (attachedDbs.TryGetValue(connectionId, out var existing))
                dbMetaRefs.Remove(existing.MetaRef);
            dbMetaRefs.Add(metaRef);

            var info = new DbConnectionInfo(connectionId, connName, providerKey, effectiveCs, varName, metaRef, schema);
            attachedDbs[connectionId] = info;

            // 5. Inject variable
            await InjectDbContextAsync(info, options, globals);

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
}
