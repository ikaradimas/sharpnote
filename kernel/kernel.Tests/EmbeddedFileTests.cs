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
}
