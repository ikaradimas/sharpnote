using System.Collections.Generic;
using System.IO;
using System.Text;
using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

public class EmbeddedFileTests
{
    private static EmbeddedFile MakeFile(string text, string filename = "data.csv")
    {
        var helper = new FilesHelper(TextWriter.Null);
        return new EmbeddedFile(helper, "test", filename, "text/csv",
            Encoding.UTF8.GetBytes(text), new Dictionary<string, string>());
    }

    [Fact]
    public void ContentCsv_BasicWithHeaders()
    {
        var file = MakeFile("Name,Age\nAlice,30\nBob,25\n");
        var rows = file.ContentCsv;

        rows.Should().HaveCount(2);
        rows[0]["Name"].Should().Be("Alice");
        rows[0]["Age"].Should().Be(30L);
        rows[1]["Name"].Should().Be("Bob");
        rows[1]["Age"].Should().Be(25L);
    }

    [Fact]
    public void ContentTsv_ParsesTabSeparated()
    {
        var file = MakeFile("Name\tAge\nAlice\t30\n");
        var rows = file.ContentTsv;

        rows.Should().HaveCount(1);
        rows[0]["Name"].Should().Be("Alice");
        rows[0]["Age"].Should().Be(30L);
    }

    [Fact]
    public void ParseCsvContent_NoHeader_GeneratesColumnNames()
    {
        var file = MakeFile("Alice,30\nBob,25\n");
        var rows = file.ParseCsvContent(',', hasHeader: false);

        rows.Should().HaveCount(2);
        rows[0]["Col1"].Should().Be("Alice");
        rows[0]["Col2"].Should().Be(30L);
    }

    [Fact]
    public void ContentCsv_QuotedFieldsWithCommas()
    {
        var file = MakeFile("City,Pop\n\"New York, NY\",8000000\n");
        var rows = file.ContentCsv;

        rows.Should().HaveCount(1);
        rows[0]["City"].Should().Be("New York, NY");
        rows[0]["Pop"].Should().Be(8000000L);
    }

    [Fact]
    public void ContentCsv_TypeInference()
    {
        var file = MakeFile("Int,Float,Bool,Str\n42,3.14,true,hello\n");
        var rows = file.ContentCsv;

        rows[0]["Int"].Should().Be(42L);
        rows[0]["Float"].Should().Be(3.14);
        rows[0]["Bool"].Should().Be(true);
        rows[0]["Str"].Should().Be("hello");
    }

    [Fact]
    public void ContentCsv_EmptyContent_ReturnsEmptyList()
    {
        var file = MakeFile("");
        file.ContentCsv.Should().BeEmpty();
    }

    [Fact]
    public void Exists_And_Contains_ReturnSameResult()
    {
        var helper = new FilesHelper(TextWriter.Null);
        helper.Exists("nope").Should().BeFalse();
        helper.Contains("nope").Should().BeFalse();

        helper.EmbedText("greeting", "hello", "greeting.txt");
        helper.Exists("greeting").Should().BeTrue();
        helper.Contains("greeting").Should().BeTrue();
    }

    [Fact]
    public void LoadAll_WithoutDeletedFile_RemovesItFromKernel()
    {
        // Reproduces the deletion-sync bug: when the renderer drops a file from
        // its embedded list and re-sends `set_embedded_files`, FilesHelper must
        // forget the dropped entry so Files.Exists/Contains return false.
        var helper = new FilesHelper(TextWriter.Null);
        helper.EmbedText("a", "alpha", "a.txt");
        helper.EmbedText("b", "beta",  "b.txt");
        helper.Exists("a").Should().BeTrue();
        helper.Exists("b").Should().BeTrue();

        // Simulate the renderer re-syncing with "a" removed (the fixed path).
        var json = "[{\"name\":\"b\",\"filename\":\"b.txt\",\"mimeType\":\"text/plain\",\"content\":\"beta\",\"encoding\":\"text\"}]";
        helper.LoadAll(System.Text.Json.JsonDocument.Parse(json).RootElement);

        helper.Exists("a").Should().BeFalse();
        helper.Exists("b").Should().BeTrue();
    }
}
