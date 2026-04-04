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

        // Sample up to 500 keys and build a namespace tree
        var keys  = new List<(string key, string type)>();
        var count = 0;

        await foreach (var redisKey in server.KeysAsync(pattern: "*", pageSize: 500))
        {
            if (ct.IsCancellationRequested || ++count > 500) break;
            var k     = redisKey.ToString();
            var ktype = (await db.KeyTypeAsync(redisKey)).ToString().ToLowerInvariant();
            keys.Add((k, ktype));
        }

        var tables = BuildNamespaceTree(keys);
        return new DbSchema(connectionId, dbName, tables);
    }

    /// <summary>
    /// Builds a namespace tree from colon-delimited Redis keys.
    /// Each namespace prefix becomes a TableSchema whose columns are the leaf
    /// keys (or sub-namespaces with a trailing ':') under that prefix.
    /// </summary>
    internal static List<TableSchema> BuildNamespaceTree(List<(string key, string type)> keys)
    {
        // Build a trie of namespace segments
        var root = new NsNode();
        foreach (var (key, type) in keys)
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
        }

        // Flatten the trie into TableSchema entries
        var tables = new List<TableSchema>();
        FlattenNode(root, "", tables);

        // If nothing was produced (all keys are top-level with no colons), put them under "(keys)"
        if (tables.Count == 0 && keys.Count > 0)
        {
            var cols = keys
                .OrderBy(k => k.key)
                .Select(k => new ColumnSchema(k.key, k.type, RedisTypeToCSharp(k.type), false, false, false))
                .ToList();
            tables.Add(new TableSchema("", "(keys)", cols));
        }

        return tables;
    }

    private static void FlattenNode(NsNode node, string prefix, List<TableSchema> tables)
    {
        // Collect leaf children and namespace children at this level
        var leafCols = new List<ColumnSchema>();
        var nsChildren = new List<(string seg, NsNode child)>();

        foreach (var (seg, child) in node.Children.OrderBy(kv => kv.Key))
        {
            if (child.IsLeaf)
            {
                leafCols.Add(new ColumnSchema(
                    seg, child.LeafType!, RedisTypeToCSharp(child.LeafType!), false, false, false));
            }
            else
            {
                nsChildren.Add((seg, child));
            }
        }

        // If this node has leaf keys, emit a table for them
        if (leafCols.Count > 0)
        {
            var tableName = string.IsNullOrEmpty(prefix) ? "(keys)" : prefix;
            tables.Add(new TableSchema("", tableName, leafCols));
        }

        // Recurse into namespace children
        foreach (var (seg, child) in nsChildren)
        {
            var childPrefix = string.IsNullOrEmpty(prefix) ? seg : $"{prefix}:{seg}";

            // If a namespace child has only one child that's also a namespace,
            // collapse it (e.g. "a:b:c" with only one path doesn't need 3 levels)
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

    private static string RedisTypeToCSharp(string redisType) => redisType switch
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
        public bool IsLeaf => LeafType != null && Children.Count == 0;
    }
}
