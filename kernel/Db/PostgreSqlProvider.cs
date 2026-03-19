using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Npgsql;

namespace SharpNoteKernel.Db;

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
