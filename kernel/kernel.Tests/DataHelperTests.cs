using System.Collections.Generic;
using System.IO;
using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace kernel.Tests;

public class DataHelperTests
{
    private readonly DataHelper _data = new();

    // ── LoadCsv basic ────────────────────────────────────────────────────────

    [Fact]
    public void LoadCsv_BasicWithHeaders()
    {
        var path = WriteTempCsv("Name,Age\nAlice,30\nBob,25\n");
        var rows = _data.LoadCsv(path);

        rows.Should().HaveCount(2);
        rows[0]["Name"].Should().Be("Alice");
        rows[0]["Age"].Should().Be(30L);
        rows[1]["Name"].Should().Be("Bob");
        rows[1]["Age"].Should().Be(25L);
    }

    [Fact]
    public void LoadCsv_WithoutHeaders()
    {
        var path = WriteTempCsv("Alice,30\nBob,25\n");
        var rows = _data.LoadCsv(path, hasHeader: false);

        rows.Should().HaveCount(2);
        rows[0]["Col1"].Should().Be("Alice");
        rows[0]["Col2"].Should().Be(30L);
    }

    // ── Quoted fields ────────────────────────────────────────────────────────

    [Fact]
    public void LoadCsv_QuotedFieldWithComma()
    {
        var path = WriteTempCsv("Name,City\nAlice,\"New York, NY\"\n");
        var rows = _data.LoadCsv(path);

        rows[0]["City"].Should().Be("New York, NY");
    }

    [Fact]
    public void LoadCsv_EscapedQuotes()
    {
        var path = WriteTempCsv("Greeting\n\"She said \"\"hello\"\"\"\n");
        var rows = _data.LoadCsv(path);

        rows[0]["Greeting"].Should().Be("She said \"hello\"");
    }

    [Fact]
    public void LoadCsv_NewlineInsideQuotedField()
    {
        var path = WriteTempCsv("Note\n\"line1\nline2\"\n");
        var rows = _data.LoadCsv(path);

        rows[0]["Note"].Should().Be("line1\nline2");
    }

    // ── Delimiters ───────────────────────────────────────────────────────────

    [Fact]
    public void LoadCsv_TabDelimiter()
    {
        var path = WriteTempCsv("Name\tAge\nAlice\t30\n");
        var rows = _data.LoadCsv(path, delimiter: '\t');

        rows[0]["Name"].Should().Be("Alice");
        rows[0]["Age"].Should().Be(30L);
    }

    [Fact]
    public void LoadCsv_SemicolonDelimiter()
    {
        var path = WriteTempCsv("A;B\n1;2\n");
        var rows = _data.LoadCsv(path, delimiter: ';');

        rows[0]["A"].Should().Be(1L);
        rows[0]["B"].Should().Be(2L);
    }

    // ── Type inference ───────────────────────────────────────────────────────

    [Fact]
    public void InferType_Integer()
    {
        DataHelper.InferType("42").Should().Be(42L);
        DataHelper.InferType("-7").Should().Be(-7L);
    }

    [Fact]
    public void InferType_Double()
    {
        DataHelper.InferType("3.14").Should().Be(3.14);
        DataHelper.InferType("-0.5").Should().Be(-0.5);
    }

    [Fact]
    public void InferType_Boolean()
    {
        DataHelper.InferType("true").Should().Be(true);
        DataHelper.InferType("False").Should().Be(false);
    }

    [Fact]
    public void InferType_String()
    {
        DataHelper.InferType("hello").Should().Be("hello");
    }

    [Fact]
    public void InferType_Empty()
    {
        DataHelper.InferType("").Should().Be("");
    }

    // ── Edge cases ───────────────────────────────────────────────────────────

    [Fact]
    public void LoadCsv_EmptyFile()
    {
        var path = WriteTempCsv("");
        var rows = _data.LoadCsv(path);
        rows.Should().BeEmpty();
    }

    [Fact]
    public void LoadCsv_SingleColumn()
    {
        var path = WriteTempCsv("Val\n1\n2\n3\n");
        var rows = _data.LoadCsv(path);

        rows.Should().HaveCount(3);
        rows[0]["Val"].Should().Be(1L);
    }

    [Fact]
    public void LoadCsv_MissingTrailingFields()
    {
        var path = WriteTempCsv("A,B,C\n1,2\n");
        var rows = _data.LoadCsv(path);

        rows[0]["A"].Should().Be(1L);
        rows[0]["B"].Should().Be(2L);
        rows[0]["C"].Should().Be("");
    }

    [Fact]
    public void LoadCsv_CrLfLineEndings()
    {
        var path = WriteTempCsv("A,B\r\n1,2\r\n3,4\r\n");
        var rows = _data.LoadCsv(path);

        rows.Should().HaveCount(2);
        rows[0]["A"].Should().Be(1L);
        rows[1]["B"].Should().Be(4L);
    }

    [Fact]
    public void LoadCsv_NoTrailingNewline()
    {
        var path = WriteTempCsv("X\n1\n2");
        var rows = _data.LoadCsv(path);

        rows.Should().HaveCount(2);
        rows[1]["X"].Should().Be(2L);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static string WriteTempCsv(string content)
    {
        var path = Path.Combine(Path.GetTempPath(), $"sharpnote_test_{Path.GetRandomFileName()}.csv");
        File.WriteAllText(path, content);
        return path;
    }
}
