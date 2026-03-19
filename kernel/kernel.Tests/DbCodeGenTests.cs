using System.Collections.Generic;
using FluentAssertions;
using PolyglotKernel;
using PolyglotKernel.Db;
using Xunit;

namespace kernel.Tests;

public class DbCodeGenTests
{
    // ── SanitizeVarName ───────────────────────────────────────────────────────

    [Fact]
    public void SanitizeVarName_EmptyOrWhitespace_ReturnsDb()
    {
        DbCodeGen.SanitizeVarName("").Should().Be("db");
        DbCodeGen.SanitizeVarName("   ").Should().Be("db");
    }

    [Fact]
    public void SanitizeVarName_SimpleWord_ReturnsLowerCamelCase()
    {
        DbCodeGen.SanitizeVarName("Products").Should().Be("products");
    }

    [Fact]
    public void SanitizeVarName_HyphensAndUnderscores_SplitsOnBoundaries()
    {
        var result = DbCodeGen.SanitizeVarName("my-database");
        result.Should().Be("myDatabase");
    }

    [Fact]
    public void SanitizeVarName_LeadingDigit_PrependsDb()
    {
        var result = DbCodeGen.SanitizeVarName("123Test");
        result.Should().StartWith("db");
    }

    [Fact]
    public void SanitizeVarName_MultipleWords_CamelCase()
    {
        DbCodeGen.SanitizeVarName("Order Items").Should().Be("orderItems");
    }

    // ── SanitizeTypeName ──────────────────────────────────────────────────────

    [Fact]
    public void SanitizeTypeName_EmptyOrWhitespace_ReturnsDb()
    {
        DbCodeGen.SanitizeTypeName("").Should().Be("Db");
        DbCodeGen.SanitizeTypeName("   ").Should().Be("Db");
    }

    [Fact]
    public void SanitizeTypeName_SimpleWord_ReturnsPascalCase()
    {
        DbCodeGen.SanitizeTypeName("products").Should().Be("Products");
    }

    [Fact]
    public void SanitizeTypeName_HyphensAndSpaces_SplitsAndCapitalizes()
    {
        DbCodeGen.SanitizeTypeName("order-items").Should().Be("OrderItems");
    }

    [Fact]
    public void SanitizeTypeName_LeadingDigit_PrependsDb()
    {
        DbCodeGen.SanitizeTypeName("123abc").Should().StartWith("Db");
    }

    [Fact]
    public void SanitizeTypeName_AlreadyPascalCase_PreservesOtherChars()
    {
        DbCodeGen.SanitizeTypeName("OrderItem").Should().Be("OrderItem");
    }

    // ── GenerateSource ────────────────────────────────────────────────────────

    [Fact]
    public void GenerateSource_ContainsPOCOClassNames()
    {
        var schema = new DbSchema("mydb", "mydb", new List<TableSchema>
        {
            new TableSchema("", "Products", new List<ColumnSchema>
            {
                new ColumnSchema("Id", "INTEGER", "long", true, false, true),
                new ColumnSchema("Name", "TEXT", "string?", false, true, false),
            }),
        });

        var provider = new SqliteProvider();
        var source = DbCodeGen.GenerateSource("mydb", provider, schema);

        source.Should().Contain("class Products");
        source.Should().Contain("public long Id");
        source.Should().Contain("public string? Name");
    }

    [Fact]
    public void GenerateSource_ContainsDbSetProperties()
    {
        var schema = new DbSchema("orders", "orders", new List<TableSchema>
        {
            new TableSchema("", "Orders", new List<ColumnSchema>
            {
                new ColumnSchema("OrderId", "INTEGER", "long", true, false, true),
            }),
        });

        var provider = new SqliteProvider();
        var source = DbCodeGen.GenerateSource("orders", provider, schema);

        source.Should().Contain("DbSet<Orders>");
    }

    [Fact]
    public void GenerateSource_ContainsOnConfiguringOverride()
    {
        var schema = new DbSchema("test", "test", new List<TableSchema>
        {
            new TableSchema("", "Foo", new List<ColumnSchema>
            {
                new ColumnSchema("Id", "INTEGER", "long", true, false, false),
            }),
        });

        var provider = new SqliteProvider();
        var source = DbCodeGen.GenerateSource("test", provider, schema);

        source.Should().Contain("OnConfiguring");
        source.Should().Contain("UseSqlite");
    }

    [Fact]
    public void GenerateSource_HasNoKeyForTableWithNoPrimaryKey()
    {
        var schema = new DbSchema("test", "test", new List<TableSchema>
        {
            new TableSchema("", "Log", new List<ColumnSchema>
            {
                new ColumnSchema("Message", "TEXT", "string?", false, true, false),
            }),
        });

        var provider = new SqliteProvider();
        var source = DbCodeGen.GenerateSource("test", provider, schema);

        source.Should().Contain("HasNoKey");
    }
}
