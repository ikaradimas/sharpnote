using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;

namespace SharpNoteKernel.Db;

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
