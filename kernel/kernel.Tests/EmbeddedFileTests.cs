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
    public void ContentCsv_AutoDetectsSemicolonDelimiter()
    {
        // European-style CSV: ';' delimiter (',' is the decimal separator).
        var file = MakeFile("Region;Units;Revenue\nNorth;142;9990,50\nSouth;87;24990,00");
        var rows = file.ContentCsv;

        rows.Should().HaveCount(2);
        rows[0].Keys.Should().BeEquivalentTo(new[] { "Region", "Units", "Revenue" });
        rows[0]["Region"].Should().Be("North");
        rows[0]["Units"].Should().Be(142L);
    }

    [Fact]
    public void ContentCsv_AutoDetectsTabAndPipeDelimiters()
    {
        var tab = MakeFile("Region\tUnits\tRevenue\nNorth\t142\t9990.50");
        tab.ContentCsv[0].Keys.Should().BeEquivalentTo(new[] { "Region", "Units", "Revenue" });

        var pipe = MakeFile("Region|Units|Revenue\nNorth|142|9990.50");
        pipe.ContentCsv[0].Keys.Should().BeEquivalentTo(new[] { "Region", "Units", "Revenue" });
    }

    [Fact]
    public void ContentCsv_CommaStillWorks()
    {
        var file = MakeFile("Region,Units,Revenue\nNorth,142,9990.50");
        file.ContentCsv[0].Keys.Should().BeEquivalentTo(new[] { "Region", "Units", "Revenue" });
    }

    [Fact]
    public void ContentCsv_StripsLeadingBomFromFirstHeader()
    {
        // A UTF-8 BOM must not become part of the first column name.
        var file = MakeFile("\uFEFF\"AccountId\",\"PurchaseId\",\"OfferId\"\n\"a\",\"b\",\"c\"");
        var rows = file.ContentCsv;
        rows[0].Keys.Should().BeEquivalentTo(new[] { "AccountId", "PurchaseId", "OfferId" });
        rows[0]["AccountId"].Should().Be("a");
    }

    [Fact]
    public void ContentCsv_QuotedFieldsWithGuids()
    {
        // Reproduces the reported shape: every field quoted, comma-delimited.
        var file = MakeFile(
            "\"AccountId\",\"PurchaseId\",\"OfferId\"\n" +
            "\"626eee00\",\"6a76fff8-62e8-4e79\",\"68182ed4-1725\"");
        var rows = file.ContentCsv;
        rows.Should().HaveCount(1);
        rows[0].Keys.Should().BeEquivalentTo(new[] { "AccountId", "PurchaseId", "OfferId" });
        rows[0]["PurchaseId"].Should().Be("6a76fff8-62e8-4e79");
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
