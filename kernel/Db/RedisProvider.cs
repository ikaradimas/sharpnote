using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using StackExchange.Redis;

namespace SharpNoteKernel.Db;

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
