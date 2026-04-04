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

    public const int DefaultPageSize = 100;

    public async Task<DbSchema> IntrospectAsync(string connectionId, string connectionString, CancellationToken ct = default)
    {
        return await ScanKeysAsync(connectionId, connectionString, 0, DefaultPageSize, ct);
    }

    /// <summary>
    /// Scans Redis keys starting from <paramref name="cursor"/>, reads up to <paramref name="pageSize"/> keys
    /// with their values, and returns a namespace-tree schema with the continuation cursor.
    /// </summary>
    public static async Task<DbSchema> ScanKeysAsync(
        string connectionId, string connectionString, long cursor, int pageSize, CancellationToken ct = default)
    {
        using var mux    = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var db           = mux.GetDatabase();
        var endpoints    = mux.GetEndPoints();
        var server       = mux.GetServer(endpoints.First());
        var dbName       = endpoints.First().ToString() ?? connectionString;

        var keys   = new List<(string key, string type, string? value)>();
        var count  = 0;
        long nextCursor = 0;

        await foreach (var redisKey in server.KeysAsync(pattern: "*", pageSize: pageSize, cursor: (int)cursor))
        {
            if (ct.IsCancellationRequested) break;
            if (++count > pageSize)
            {
                // We got more than a page — record that there are more keys
                nextCursor = -1; // sentinel: more keys available
                break;
            }
            var k     = redisKey.ToString();
            var ktype = (await db.KeyTypeAsync(redisKey)).ToString().ToLowerInvariant();
            var val   = await ReadValuePreviewAsync(db, redisKey, ktype);
            keys.Add((k, ktype, val));
        }

        // If we consumed exactly pageSize and didn't overflow, there might still be more.
        // Redis SCAN doesn't give us a reliable "done" signal via KeysAsync, so we use a
        // heuristic: if we got exactly pageSize keys, assume there could be more.
        if (nextCursor == 0 && count == pageSize)
            nextCursor = -1;

        var tables = BuildNamespaceTree(keys);
        return new DbSchema(connectionId, dbName, tables, nextCursor);
    }

    private static async Task<string?> ReadValuePreviewAsync(IDatabase db, RedisKey key, string type)
    {
        const int maxLen = 120;
        try
        {
            switch (type)
            {
                case "string":
                    var sv = await db.StringGetAsync(key);
                    var s = sv.ToString();
                    return s.Length > maxLen ? s[..maxLen] + "…" : s;
                case "hash":
                    var hlen = await db.HashLengthAsync(key);
                    var hSample = await db.HashGetAllAsync(key);
                    var hPreview = string.Join(", ", hSample.Take(3).Select(e => $"{e.Name}={e.Value}"));
                    if (hlen > 3) hPreview += ", …";
                    return $"({hlen} fields) {hPreview}";
                case "list":
                    var llen = await db.ListLengthAsync(key);
                    var lSample = await db.ListRangeAsync(key, 0, 2);
                    var lPreview = string.Join(", ", lSample.Select(v => v.ToString()));
                    if (llen > 3) lPreview += ", …";
                    return $"({llen} items) [{lPreview}]";
                case "set":
                    var slen = await db.SetLengthAsync(key);
                    var sSample = await db.SetMembersAsync(key);
                    var sPreview = string.Join(", ", sSample.Take(3).Select(v => v.ToString()));
                    if (slen > 3) sPreview += ", …";
                    return $"({slen} members) {{{sPreview}}}";
                case "zset":
                    var zlen = await db.SortedSetLengthAsync(key);
                    var zSample = await db.SortedSetRangeByRankWithScoresAsync(key, 0, 2);
                    var zPreview = string.Join(", ", zSample.Select(e => $"{e.Element}:{e.Score}"));
                    if (zlen > 3) zPreview += ", …";
                    return $"({zlen} entries) {zPreview}";
                default:
                    return null;
            }
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Builds a namespace tree from colon-delimited Redis keys.
    /// Each namespace prefix becomes a TableSchema whose columns are the leaf
    /// keys (or sub-namespaces with a trailing ':') under that prefix.
    /// </summary>
    internal static List<TableSchema> BuildNamespaceTree(List<(string key, string type)> keys) =>
        BuildNamespaceTree(keys.Select(k => (k.key, k.type, (string?)null)).ToList());

    internal static List<TableSchema> BuildNamespaceTree(List<(string key, string type, string? value)> keys)
    {
        var root = new NsNode();
        foreach (var (key, type, value) in keys)
        {
            var segments = key.Split(':');
            var node = root;
            for (int i = 0; i < segments.Length; i++)
            {
                var seg = segments[i];
                if (!node.Children.TryGetValue(seg, out var child))
                {
                    child = new NsNode();
                    node.Children[seg] = child;
                }
                node = child;
            }
            node.LeafType = type;
            node.FullKey = key;
            node.Value = value;
        }

        var tables = new List<TableSchema>();
        FlattenNode(root, "", tables);

        if (tables.Count == 0 && keys.Count > 0)
        {
            var cols = keys
                .OrderBy(k => k.key)
                .Select(k => new ColumnSchema(k.key, k.type, RedisTypeToCSharp(k.type), false, false, false, k.value))
                .ToList();
            tables.Add(new TableSchema("", "(keys)", cols));
        }

        return tables;
    }

    private static void FlattenNode(NsNode node, string prefix, List<TableSchema> tables)
    {
        var leafCols = new List<ColumnSchema>();
        var nsChildren = new List<(string seg, NsNode child)>();

        foreach (var (seg, child) in node.Children.OrderBy(kv => kv.Key))
        {
            if (child.IsLeaf)
            {
                leafCols.Add(new ColumnSchema(
                    seg, child.LeafType!, RedisTypeToCSharp(child.LeafType!), false, false, false, child.Value));
            }
            else
            {
                nsChildren.Add((seg, child));
            }
        }

        if (leafCols.Count > 0)
        {
            var tableName = string.IsNullOrEmpty(prefix) ? "(keys)" : prefix;
            tables.Add(new TableSchema("", tableName, leafCols));
        }

        foreach (var (seg, child) in nsChildren)
        {
            var childPrefix = string.IsNullOrEmpty(prefix) ? seg : $"{prefix}:{seg}";

            var cur = child;
            var curPrefix = childPrefix;
            while (cur.Children.Count == 1 && !cur.Children.Values.First().IsLeaf
                   && cur.LeafType == null)
            {
                var only = cur.Children.First();
                curPrefix = $"{curPrefix}:{only.Key}";
                cur = only.Value;
            }

            FlattenNode(cur, curPrefix, tables);
        }
    }

    internal static string RedisTypeToCSharp(string redisType) => redisType switch
    {
        "string" => "RedisValue",
        "hash"   => "HashEntry[]",
        "list"   => "RedisValue[]",
        "set"    => "RedisValue[]",
        "zset"   => "SortedSetEntry[]",
        _        => "RedisValue",
    };

    private class NsNode
    {
        public Dictionary<string, NsNode> Children { get; } = new(StringComparer.Ordinal);
        public string? LeafType { get; set; }
        public string? FullKey { get; set; }
        public string? Value { get; set; }
        public bool IsLeaf => LeafType != null && Children.Count == 0;
    }
}
