using System.Collections.Generic;

namespace PolyglotKernel.Db;

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
