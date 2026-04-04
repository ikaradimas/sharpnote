using System.Collections.Generic;
using System.Linq;
using SharpNoteKernel.Db;
using Xunit;
using FluentAssertions;

namespace SharpNoteKernel.Tests;

public class RedisNamespaceTests
{
    private static List<(string key, string type)> Keys(params (string key, string type)[] items) => items.ToList();

    [Fact]
    public void FlatKeys_GroupedUnderKeysTable()
    {
        var tables = RedisProvider.BuildNamespaceTree(Keys(
            ("alpha", "string"), ("beta", "hash")));

        tables.Should().HaveCount(1);
        tables[0].Name.Should().Be("(keys)");
        tables[0].Columns.Should().HaveCount(2);
        tables[0].Columns.Select(c => c.Name).Should().BeEquivalentTo(["alpha", "beta"]);
    }

    [Fact]
    public void SingleLevelNamespace_CreatesPrefixTable()
    {
        var tables = RedisProvider.BuildNamespaceTree(Keys(
            ("user:1", "string"), ("user:2", "string"), ("session:abc", "hash")));

        tables.Select(t => t.Name).Should().BeEquivalentTo(["session", "user"]);
        var userTable = tables.First(t => t.Name == "user");
        userTable.Columns.Select(c => c.Name).Should().BeEquivalentTo(["1", "2"]);
    }

    [Fact]
    public void MultiLevelNamespace_CreatesNestedPrefixes()
    {
        var tables = RedisProvider.BuildNamespaceTree(Keys(
            ("app:cache:user:1", "string"),
            ("app:cache:user:2", "string"),
            ("app:cache:session:abc", "hash"),
            ("app:config", "string")));

        var names = tables.Select(t => t.Name).ToList();
        // "app" should have leaf "config"
        names.Should().Contain("app");
        // "app:cache:user" and "app:cache:session" (or collapsed) should exist
        names.Should().Contain(n => n.StartsWith("app:cache"));

        var appTable = tables.First(t => t.Name == "app");
        appTable.Columns.Select(c => c.Name).Should().Contain("config");
    }

    [Fact]
    public void MixedFlatAndNamespaced_BothRepresented()
    {
        var tables = RedisProvider.BuildNamespaceTree(Keys(
            ("standalone", "string"),
            ("ns:key1", "hash"),
            ("ns:key2", "list")));

        var names = tables.Select(t => t.Name).ToList();
        names.Should().Contain("(keys)"); // standalone flat key
        names.Should().Contain("ns");     // namespace prefix
    }

    [Fact]
    public void CollapsesSingleChildNamespaces()
    {
        // "a:b:c:leaf" where a→b→c is a single-path chain should collapse
        var tables = RedisProvider.BuildNamespaceTree(Keys(
            ("deep:nested:path:key1", "string"),
            ("deep:nested:path:key2", "hash")));

        // Should collapse "deep:nested:path" into one table
        tables.Should().HaveCount(1);
        tables[0].Name.Should().Be("deep:nested:path");
        tables[0].Columns.Should().HaveCount(2);
    }

    [Fact]
    public void EmptyKeys_ReturnsEmptyTables()
    {
        var tables = RedisProvider.BuildNamespaceTree(Keys());
        tables.Should().BeEmpty();
    }

    [Fact]
    public void ColumnTypes_MappedCorrectly()
    {
        var tables = RedisProvider.BuildNamespaceTree(Keys(
            ("ns:str", "string"), ("ns:hsh", "hash"), ("ns:lst", "list"),
            ("ns:st", "set"), ("ns:zst", "zset")));

        var cols = tables[0].Columns;
        cols.First(c => c.Name == "str").CSharpType.Should().Be("RedisValue");
        cols.First(c => c.Name == "hsh").CSharpType.Should().Be("HashEntry[]");
        cols.First(c => c.Name == "lst").CSharpType.Should().Be("RedisValue[]");
        cols.First(c => c.Name == "st").CSharpType.Should().Be("RedisValue[]");
        cols.First(c => c.Name == "zst").CSharpType.Should().Be("SortedSetEntry[]");
    }
}
