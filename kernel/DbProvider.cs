using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.Data.SqlClient;
using Npgsql;
using StackExchange.Redis;

// ── Schema models ─────────────────────────────────────────────────────────────

public record DbSchema(string ConnectionId, string DatabaseName, List<TableSchema> Tables);
public record TableSchema(string Schema, string Name, List<ColumnSchema> Columns);
public record ColumnSchema(string Name, string DbType, string CSharpType,
    bool IsPrimaryKey, bool IsNullable, bool IsIdentity);

// ── Assembly loader helper ────────────────────────────────────────────────────

internal static class AssemblyLoader
{
    public static Assembly? TryLoad(string name)
    {
        // Check if already loaded first
        var loaded = AppDomain.CurrentDomain.GetAssemblies()
            .FirstOrDefault(a => a.GetName().Name == name);
        if (loaded != null) return loaded;
        try { return Assembly.Load(name); }
        catch { return null; }
    }
}

// ── IDbProvider interface ─────────────────────────────────────────────────────

public interface IDbProvider
{
    string Key { get; }
    string DisplayName { get; }
    IEnumerable<Assembly> RequiredAssemblies { get; }
    string GetUsingDirectives();
    string GetConfigureCallCode(string csVar);
    Task<DbSchema> IntrospectAsync(string connectionId, string connectionString, CancellationToken ct = default);

    /// <summary>True for SQL databases that use EF Core + DbContext codegen.</summary>
    bool IsRelational => true;

    /// <summary>True when the generated DbContext takes a persistent SqliteConnection instead of a string.</summary>
    bool UsesPersistentConnection => false;

    /// <summary>Normalizes a provider-specific connection string before it is stored and used.</summary>
    string NormalizeConnectionString(string connectionId, string connectionString) => connectionString;
}

// ── SQLite provider ───────────────────────────────────────────────────────────

public class SqliteProvider : IDbProvider
{
    public string Key => "sqlite";
    public string DisplayName => "SQLite";

    public IEnumerable<Assembly> RequiredAssemblies
    {
        get
        {
            yield return typeof(Microsoft.EntityFrameworkCore.DbContext).Assembly;
            yield return typeof(Microsoft.Data.Sqlite.SqliteConnection).Assembly;
            var prov = AssemblyLoader.TryLoad("Microsoft.EntityFrameworkCore.Sqlite");
            if (prov != null) yield return prov;
        }
    }

    public string GetUsingDirectives() =>
        "using Microsoft.EntityFrameworkCore;";

    public string GetConfigureCallCode(string csVar) =>
        $"b.UseSqlite({csVar})";

    public async Task<DbSchema> IntrospectAsync(string connectionId, string connectionString, CancellationToken ct = default)
    {
        var tables = new List<TableSchema>();
        using var conn = new SqliteConnection(connectionString);
        await conn.OpenAsync(ct);

        var dbName = System.IO.Path.GetFileNameWithoutExtension(connectionString
            .Split(';')
            .FirstOrDefault(p => p.TrimStart().StartsWith("Data Source", StringComparison.OrdinalIgnoreCase))
            ?.Split('=').LastOrDefault()?.Trim() ?? "db");

        // Get all user tables
        var tableNames = new List<string>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name";
            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                tableNames.Add(reader.GetString(0));
        }

        // Get PKs and columns per table
        foreach (var tableName in tableNames)
        {
            var pkCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var pragmaCmd = conn.CreateCommand())
            {
                pragmaCmd.CommandText = $"PRAGMA table_info(\"{tableName.Replace("\"", "\"\"")}\")";
                using var pkReader = await pragmaCmd.ExecuteReaderAsync(ct);
                while (await pkReader.ReadAsync(ct))
                    if (pkReader.GetInt32(5) > 0) // pk column
                        pkCols.Add(pkReader.GetString(1));
            }

            var columns = new List<ColumnSchema>();
            using (var pragmaCmd = conn.CreateCommand())
            {
                pragmaCmd.CommandText = $"PRAGMA table_info(\"{tableName.Replace("\"", "\"\"")}\")";
                using var colReader = await pragmaCmd.ExecuteReaderAsync(ct);
                while (await colReader.ReadAsync(ct))
                {
                    var colName  = colReader.GetString(1);
                    var dbType   = colReader.GetString(2).ToUpperInvariant();
                    var notNull  = colReader.GetInt32(3) != 0;
                    var isPk     = pkCols.Contains(colName);
                    var isNull   = !notNull && !isPk;
                    var csType   = MapSqliteType(dbType, isNull, isPk);
                    columns.Add(new ColumnSchema(colName, dbType, csType, isPk, isNull, isPk && dbType.Contains("INT")));
                }
            }
            tables.Add(new TableSchema("", tableName, columns));
        }

        return new DbSchema(connectionId, dbName, tables);
    }

    private static string MapSqliteType(string affinity, bool isNullable, bool isPk)
    {
        string cs;
        if      (affinity.Contains("INT"))                              cs = "long";
        else if (affinity.Contains("CHAR") || affinity.Contains("TEXT") || affinity.Contains("CLOB")) cs = "string";
        else if (affinity.Contains("REAL") || affinity.Contains("FLOA") || affinity.Contains("DOUB")) cs = "double";
        else if (affinity.Contains("BLOB"))                             cs = "byte[]";
        else                                                            cs = "string";

        // Reference types don't need nullable marker; value types do
        if (isNullable && !isPk && cs != "string" && cs != "byte[]")
            cs += "?";
        return cs;
    }
}

// ── SQL Server provider ───────────────────────────────────────────────────────

public class SqlServerProvider : IDbProvider
{
    public string Key => "sqlserver";
    public string DisplayName => "SQL Server";

    public IEnumerable<Assembly> RequiredAssemblies
    {
        get
        {
            yield return typeof(Microsoft.EntityFrameworkCore.DbContext).Assembly;
            yield return typeof(Microsoft.Data.SqlClient.SqlConnection).Assembly;
            var prov = AssemblyLoader.TryLoad("Microsoft.EntityFrameworkCore.SqlServer");
            if (prov != null) yield return prov;
        }
    }

    public string GetUsingDirectives() =>
        "using Microsoft.EntityFrameworkCore;";

    public string GetConfigureCallCode(string csVar) =>
        $"b.UseSqlServer({csVar})";

    public async Task<DbSchema> IntrospectAsync(string connectionId, string connectionString, CancellationToken ct = default)
    {
        var tables = new List<TableSchema>();
        using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        var dbName = conn.Database;

        // Get PKs
        var pkLookup = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        const string pkSql = @"
            SELECT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
              ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
             AND tc.TABLE_SCHEMA    = kcu.TABLE_SCHEMA
             AND tc.TABLE_NAME      = kcu.TABLE_NAME
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'";

        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = pkSql;
            using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var key = $"{r.GetString(0)}.{r.GetString(1)}";
                if (!pkLookup.ContainsKey(key)) pkLookup[key] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                pkLookup[key].Add(r.GetString(2));
            }
        }

        // Get columns
        const string colSql = @"
            SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE,
                   IS_NULLABLE, COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA+'.'+TABLE_NAME), COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
            FROM INFORMATION_SCHEMA.COLUMNS
            ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION";

        var tableMap = new Dictionary<string, (string schema, string name, List<ColumnSchema> cols)>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = colSql;
            using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var schema   = r.GetString(0);
                var table    = r.GetString(1);
                var col      = r.GetString(2);
                var dbType   = r.GetString(3);
                var nullable = r.GetString(4) == "YES";
                var identity = !r.IsDBNull(5) && r.GetInt32(5) == 1;
                var tKey     = $"{schema}.{table}";
                var isPk     = pkLookup.TryGetValue(tKey, out var pks) && pks.Contains(col);
                var csType   = MapSqlServerType(dbType, nullable && !isPk, isPk);

                if (!tableMap.ContainsKey(tKey))
                    tableMap[tKey] = (schema, table, new List<ColumnSchema>());
                tableMap[tKey].cols.Add(new ColumnSchema(col, dbType, csType, isPk, nullable && !isPk, identity));
            }
        }

        foreach (var (_, v) in tableMap)
            tables.Add(new TableSchema(v.schema, v.name, v.cols));

        return new DbSchema(connectionId, dbName, tables);
    }

    private static string MapSqlServerType(string dbType, bool isNullable, bool isPk)
    {
        var cs = dbType.ToLowerInvariant() switch
        {
            "int"              => "int",
            "bigint"           => "long",
            "smallint"         => "short",
            "tinyint"          => "byte",
            "bit"              => "bool",
            "datetime"         => "DateTime",
            "datetime2"        => "DateTime",
            "date"             => "DateTime",
            "smalldatetime"    => "DateTime",
            "datetimeoffset"   => "DateTimeOffset",
            "uniqueidentifier" => "Guid",
            "decimal"          => "decimal",
            "numeric"          => "decimal",
            "money"            => "decimal",
            "smallmoney"       => "decimal",
            "float"            => "double",
            "real"             => "float",
            "varbinary"        => "byte[]",
            "binary"           => "byte[]",
            "image"            => "byte[]",
            _                  => "string",
        };
        if (isNullable && !isPk && cs != "string" && cs != "byte[]")
            cs += "?";
        return cs;
    }
}

// ── PostgreSQL provider ───────────────────────────────────────────────────────

public class PostgreSqlProvider : IDbProvider
{
    public string Key => "postgresql";
    public string DisplayName => "PostgreSQL";

    public IEnumerable<Assembly> RequiredAssemblies
    {
        get
        {
            yield return typeof(Microsoft.EntityFrameworkCore.DbContext).Assembly;
            yield return typeof(Npgsql.NpgsqlConnection).Assembly;
            var prov = AssemblyLoader.TryLoad("Npgsql.EntityFrameworkCore.PostgreSQL");
            if (prov != null) yield return prov;
        }
    }

    public string GetUsingDirectives() =>
        "using Microsoft.EntityFrameworkCore;";

    public string GetConfigureCallCode(string csVar) =>
        $"b.UseNpgsql({csVar})";

    public async Task<DbSchema> IntrospectAsync(string connectionId, string connectionString, CancellationToken ct = default)
    {
        var tables = new List<TableSchema>();
        using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(ct);
        var dbName = conn.Database;

        // Get PKs
        var pkLookup = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        const string pkSql = @"
            SELECT kcu.table_schema, kcu.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
             AND tc.table_name      = kcu.table_name
            WHERE tc.constraint_type = 'PRIMARY KEY'";

        using (var cmd = new NpgsqlCommand(pkSql, conn))
        using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                var key = $"{r.GetString(0)}.{r.GetString(1)}";
                if (!pkLookup.ContainsKey(key)) pkLookup[key] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                pkLookup[key].Add(r.GetString(2));
            }
        }

        // Get columns
        const string colSql = @"
            SELECT table_schema, table_name, column_name, udt_name, data_type,
                   is_nullable, is_identity
            FROM information_schema.columns
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name, ordinal_position";

        var tableMap = new Dictionary<string, (string schema, string name, List<ColumnSchema> cols)>();
        using (var cmd = new NpgsqlCommand(colSql, conn))
        using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                var schema   = r.GetString(0);
                var table    = r.GetString(1);
                var col      = r.GetString(2);
                var udtName  = r.GetString(3);
                var dataType = r.GetString(4);
                var nullable = r.GetString(5) == "YES";
                var identity = r.GetString(6) == "YES";
                var tKey     = $"{schema}.{table}";
                var isPk     = pkLookup.TryGetValue(tKey, out var pks) && pks.Contains(col);
                var csType   = MapPgType(dataType, udtName, nullable && !isPk, isPk);

                if (!tableMap.ContainsKey(tKey))
                    tableMap[tKey] = (schema, table, new List<ColumnSchema>());
                tableMap[tKey].cols.Add(new ColumnSchema(col, dataType, csType, isPk, nullable && !isPk, identity));
            }
        }

        foreach (var (_, v) in tableMap)
            tables.Add(new TableSchema(v.schema, v.name, v.cols));

        return new DbSchema(connectionId, dbName, tables);
    }

    private static string MapPgType(string dataType, string udtName, bool isNullable, bool isPk)
    {
        var cs = dataType.ToLowerInvariant() switch
        {
            "integer"                     => "int",
            "bigint"                      => "long",
            "smallint"                    => "short",
            "boolean"                     => "bool",
            "character varying"           => "string",
            "text"                        => "string",
            "character"                   => "string",
            "timestamp without time zone" => "DateTime",
            "timestamp with time zone"    => "DateTimeOffset",
            "date"                        => "DateTime",
            "uuid"                        => "Guid",
            "bytea"                       => "byte[]",
            "numeric"                     => "decimal",
            "double precision"            => "double",
            "real"                        => "float",
            "json"                        => "string",
            "jsonb"                       => "string",
            "xml"                         => "string",
            "array"                       => MapPgArrayType(udtName),
            _                             => "string",
        };
        // Arrays and reference types (string, byte[], T[]) don't need nullable marker
        if (isNullable && !isPk && cs != "string" && !cs.EndsWith("[]"))
            cs += "?";
        return cs;
    }

    private static string MapPgArrayType(string udtName)
    {
        // PostgreSQL udt_name for arrays starts with '_'; strip it to get element type
        var elem = udtName.TrimStart('_').ToLowerInvariant();
        var elemCs = elem switch
        {
            "int4" or "integer" => "int",
            "int8"              => "long",
            "int2"              => "short",
            "varchar" or "text" or "bpchar" => "string",
            "bool"              => "bool",
            "float4"            => "float",
            "float8"            => "double",
            "numeric"           => "decimal",
            "uuid"              => "Guid",
            "timestamptz"       => "DateTimeOffset",
            "timestamp"         => "DateTime",
            "date"              => "DateTime",
            _                   => "string",
        };
        return elemCs + "[]";
    }
}

// ── SQLite In-Memory provider ─────────────────────────────────────────────────

public class SqliteInMemoryProvider : IDbProvider
{
    public string Key         => "sqlite_memory";
    public string DisplayName => "SQLite (In-Memory)";
    public bool UsesPersistentConnection => true;

    public IEnumerable<Assembly> RequiredAssemblies
    {
        get
        {
            yield return typeof(Microsoft.EntityFrameworkCore.DbContext).Assembly;
            yield return typeof(Microsoft.Data.Sqlite.SqliteConnection).Assembly;
            var prov = AssemblyLoader.TryLoad("Microsoft.EntityFrameworkCore.Sqlite");
            if (prov != null) yield return prov;
        }
    }

    public string GetUsingDirectives()   => "using Microsoft.EntityFrameworkCore;";
    public string GetConfigureCallCode(string csVar) => $"b.UseSqlite({csVar})";  // unused for persistent-connection path

    /// <summary>
    /// Ensures the connection string uses SQLite's in-memory shared-cache mode.
    /// If the user leaves it blank, a unique named database is generated from the connectionId.
    /// </summary>
    public string NormalizeConnectionString(string connectionId, string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
            return $"Data Source=__mem_{connectionId.Replace("-", "")};Mode=Memory;Cache=Shared";
        if (!connectionString.Contains("Mode=Memory", StringComparison.OrdinalIgnoreCase))
            return connectionString.TrimEnd(';') + ";Mode=Memory;Cache=Shared";
        return connectionString;
    }

    public async Task<DbSchema> IntrospectAsync(string connectionId, string connectionString, CancellationToken ct = default)
    {
        var tables = new List<TableSchema>();
        using var conn = new SqliteConnection(connectionString);
        await conn.OpenAsync(ct);

        var dbName = connectionString
            .Split(';')
            .FirstOrDefault(p => p.TrimStart().StartsWith("Data Source", StringComparison.OrdinalIgnoreCase))
            ?.Split('=').LastOrDefault()?.Trim() ?? "memory";

        var tableNames = new List<string>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name";
            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                tableNames.Add(reader.GetString(0));
        }

        foreach (var tableName in tableNames)
        {
            var pkCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var pragmaCmd = conn.CreateCommand())
            {
                pragmaCmd.CommandText = $"PRAGMA table_info(\"{tableName.Replace("\"", "\"\"")}\")";
                using var pkReader = await pragmaCmd.ExecuteReaderAsync(ct);
                while (await pkReader.ReadAsync(ct))
                    if (pkReader.GetInt32(5) > 0)
                        pkCols.Add(pkReader.GetString(1));
            }

            var columns = new List<ColumnSchema>();
            using (var pragmaCmd = conn.CreateCommand())
            {
                pragmaCmd.CommandText = $"PRAGMA table_info(\"{tableName.Replace("\"", "\"\"")}\")";
                using var colReader = await pragmaCmd.ExecuteReaderAsync(ct);
                while (await colReader.ReadAsync(ct))
                {
                    var colName = colReader.GetString(1);
                    var dbType  = colReader.GetString(2).ToUpperInvariant();
                    var notNull = colReader.GetInt32(3) != 0;
                    var isPk    = pkCols.Contains(colName);
                    var isNull  = !notNull && !isPk;
                    var csType  = MapSqliteType(dbType, isNull, isPk);
                    columns.Add(new ColumnSchema(colName, dbType, csType, isPk, isNull, isPk && dbType.Contains("INT")));
                }
            }
            tables.Add(new TableSchema("", tableName, columns));
        }

        return new DbSchema(connectionId, dbName, tables);
    }

    private static string MapSqliteType(string affinity, bool isNullable, bool isPk)
    {
        string cs;
        if      (affinity.Contains("INT"))                              cs = "long";
        else if (affinity.Contains("CHAR") || affinity.Contains("TEXT") || affinity.Contains("CLOB")) cs = "string";
        else if (affinity.Contains("REAL") || affinity.Contains("FLOA") || affinity.Contains("DOUB")) cs = "double";
        else if (affinity.Contains("BLOB"))                             cs = "byte[]";
        else                                                            cs = "string";

        if (isNullable && !isPk && cs != "string" && cs != "byte[]")
            cs += "?";
        return cs;
    }
}

// ── Redis provider ────────────────────────────────────────────────────────────

public class RedisProvider : IDbProvider
{
    public string Key         => "redis";
    public string DisplayName => "Redis";
    public bool IsRelational  => false;

    public IEnumerable<Assembly> RequiredAssemblies
    {
        get
        {
            var asm = AssemblyLoader.TryLoad("StackExchange.Redis");
            if (asm != null) yield return asm;
        }
    }

    public string GetUsingDirectives()              => "using StackExchange.Redis;";
    public string GetConfigureCallCode(string csVar) => "";  // not used — non-relational provider

    public async Task<DbSchema> IntrospectAsync(string connectionId, string connectionString, CancellationToken ct = default)
    {
        using var mux    = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var db           = mux.GetDatabase();
        var endpoints    = mux.GetEndPoints();
        var server       = mux.GetServer(endpoints.First());
        var dbName       = endpoints.First().ToString() ?? connectionString;

        // Sample up to 200 keys and group them by prefix (first colon-delimited segment)
        var prefixTypes = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        var count       = 0;

        await foreach (var redisKey in server.KeysAsync(pattern: "*", pageSize: 200))
        {
            if (ct.IsCancellationRequested || ++count > 200) break;
            var k      = redisKey.ToString();
            var prefix = k.Contains(':') ? k[..k.IndexOf(':')] : "(no prefix)";
            var ktype  = (await db.KeyTypeAsync(redisKey)).ToString().ToLowerInvariant();

            if (!prefixTypes.TryGetValue(prefix, out var types))
                prefixTypes[prefix] = types = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            types.Add(ktype);
        }

        var tables = prefixTypes
            .OrderBy(kv => kv.Key)
            .Select(kv => new TableSchema(
                "",
                kv.Key,
                kv.Value
                    .OrderBy(t => t)
                    .Select(t => new ColumnSchema($"({t})", t, RedisTypeToCSharp(t), false, false, false))
                    .ToList()))
            .ToList();

        return new DbSchema(connectionId, dbName, tables);
    }

    private static string RedisTypeToCSharp(string redisType) => redisType switch
    {
        "string" => "RedisValue",
        "hash"   => "HashEntry[]",
        "list"   => "RedisValue[]",
        "set"    => "RedisValue[]",
        "zset"   => "SortedSetEntry[]",
        _        => "RedisValue",
    };
}

// ── Provider registry ─────────────────────────────────────────────────────────

public static class DbProviders
{
    private static readonly Dictionary<string, IDbProvider> All = new()
    {
        ["sqlite"]        = new SqliteProvider(),
        ["sqlite_memory"] = new SqliteInMemoryProvider(),
        ["sqlserver"]     = new SqlServerProvider(),
        ["postgresql"]    = new PostgreSqlProvider(),
        ["redis"]         = new RedisProvider(),
    };

    public static IDbProvider Get(string key) => All[key];
    public static IEnumerable<IDbProvider> ListAll() => All.Values;
}
