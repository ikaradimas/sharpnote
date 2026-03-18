using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Xunit;

namespace kernel.Tests;

public class DbProviderTests : IDisposable
{
    private readonly string _dbPath;
    private readonly string _connStr;

    public DbProviderTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"kernel_test_{Guid.NewGuid():N}.db");
        _connStr = $"Data Source={_dbPath}";
        CreateTestDatabase();
    }

    private void CreateTestDatabase()
    {
        using var conn = new SqliteConnection(_connStr);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE Users (
                Id      INTEGER PRIMARY KEY AUTOINCREMENT,
                Name    TEXT    NOT NULL,
                Score   REAL,
                Data    BLOB
            );
            CREATE TABLE Tags (
                TagId   INTEGER PRIMARY KEY,
                Label   TEXT
            );
            """;
        cmd.ExecuteNonQuery();
    }

    public void Dispose()
    {
        try { File.Delete(_dbPath); } catch { }
    }

    [Fact]
    public async Task SqliteProvider_IntrospectAsync_ReturnsTableNames()
    {
        var provider = new SqliteProvider();
        var schema = await provider.IntrospectAsync("test-id", _connStr);

        var tableNames = schema.Tables.Select(t => t.Name).ToList();
        tableNames.Should().Contain("Users");
        tableNames.Should().Contain("Tags");
    }

    [Fact]
    public async Task SqliteProvider_IntrospectAsync_ReturnsCorrectColumnCount()
    {
        var provider = new SqliteProvider();
        var schema = await provider.IntrospectAsync("test-id", _connStr);

        var users = schema.Tables.First(t => t.Name == "Users");
        users.Columns.Should().HaveCount(4);
    }

    [Fact]
    public async Task SqliteProvider_IntrospectAsync_MapsTypesCorrectly()
    {
        var provider = new SqliteProvider();
        var schema = await provider.IntrospectAsync("test-id", _connStr);

        var users = schema.Tables.First(t => t.Name == "Users");
        var colMap = users.Columns.ToDictionary(c => c.Name, c => c.CSharpType);

        colMap["Id"].Should().Be("long");
        colMap["Name"].Should().Be("string");
        colMap["Score"].Should().Contain("double");  // REAL → double or double?
        colMap["Data"].Should().Contain("byte[]");   // BLOB → byte[]
    }

    [Fact]
    public async Task SqliteProvider_IntrospectAsync_MarksPrimaryKey()
    {
        var provider = new SqliteProvider();
        var schema = await provider.IntrospectAsync("test-id", _connStr);

        var users = schema.Tables.First(t => t.Name == "Users");
        var pk = users.Columns.First(c => c.Name == "Id");
        pk.IsPrimaryKey.Should().BeTrue();
    }

    [Fact]
    public async Task SqliteProvider_IntrospectAsync_NonPkColumnsNotPrimary()
    {
        var provider = new SqliteProvider();
        var schema = await provider.IntrospectAsync("test-id", _connStr);

        var users = schema.Tables.First(t => t.Name == "Users");
        var name = users.Columns.First(c => c.Name == "Name");
        name.IsPrimaryKey.Should().BeFalse();
    }

    [Fact]
    public void SqliteProvider_Key_IsSqlite()
    {
        new SqliteProvider().Key.Should().Be("sqlite");
    }

    [Fact]
    public void SqliteProvider_DisplayName_IsNotEmpty()
    {
        new SqliteProvider().DisplayName.Should().NotBeNullOrWhiteSpace();
    }
}
