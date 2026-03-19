using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;

namespace PolyglotKernel.Db;

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
