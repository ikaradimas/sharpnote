using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace SharpNoteKernel;

/// <summary>
/// Data file loading utilities exposed as the <c>Data</c> global in notebooks.
/// </summary>
public class DataHelper
{
    /// <summary>
    /// Loads a CSV file and returns a list of row dictionaries.
    /// Handles RFC 4180: quoted fields, escaped quotes, newlines inside quotes.
    /// Values are type-inferred as long, double, bool, or string.
    /// </summary>
    public List<Dictionary<string, object>> LoadCsv(
        string path,
        bool hasHeader = true,
        char delimiter = ',')
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("Path must not be empty.", nameof(path));

        var text = File.ReadAllText(path);
        var records = ParseCsv(text, delimiter);

        if (records.Count == 0)
            return new List<Dictionary<string, object>>();

        string[] headers;
        int dataStart;

        if (hasHeader)
        {
            headers = records[0];
            dataStart = 1;
        }
        else
        {
            headers = new string[records[0].Length];
            for (int i = 0; i < headers.Length; i++)
                headers[i] = $"Col{i + 1}";
            dataStart = 0;
        }

        var result = new List<Dictionary<string, object>>(records.Count - dataStart);
        for (int r = dataStart; r < records.Count; r++)
        {
            var row = records[r];
            var dict = new Dictionary<string, object>(headers.Length);
            for (int c = 0; c < headers.Length; c++)
            {
                var raw = c < row.Length ? row[c] : "";
                dict[headers[c]] = InferType(raw);
            }
            result.Add(dict);
        }

        return result;
    }

    // ── RFC 4180 state-machine parser ────────────────────────────────────────

    internal static List<string[]> ParseCsv(string text, char delimiter)
    {
        // Strip a leading UTF-8 BOM — otherwise it becomes part of the first
        // header/field (e.g. the key "\uFEFFAccountId"), which silently breaks
        // lookups by the visible column name.
        if (text.Length > 0 && text[0] == '\uFEFF') text = text.Substring(1);

        var records = new List<string[]>();
        var fields = new List<string>();
        var field = new StringBuilder();
        bool inQuotes = false;
        int i = 0;

        while (i < text.Length)
        {
            char ch = text[i];

            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"')
                    {
                        field.Append('"');
                        i += 2;
                    }
                    else
                    {
                        inQuotes = false;
                        i++;
                    }
                }
                else
                {
                    field.Append(ch);
                    i++;
                }
            }
            else
            {
                if (ch == '"')
                {
                    inQuotes = true;
                    i++;
                }
                else if (ch == delimiter)
                {
                    fields.Add(field.ToString());
                    field.Clear();
                    i++;
                }
                else if (ch == '\r')
                {
                    fields.Add(field.ToString());
                    field.Clear();
                    records.Add(fields.ToArray());
                    fields.Clear();
                    i++;
                    if (i < text.Length && text[i] == '\n') i++;
                }
                else if (ch == '\n')
                {
                    fields.Add(field.ToString());
                    field.Clear();
                    records.Add(fields.ToArray());
                    fields.Clear();
                    i++;
                }
                else
                {
                    field.Append(ch);
                    i++;
                }
            }
        }

        // Trailing field / record (if file doesn't end with newline)
        if (field.Length > 0 || fields.Count > 0)
        {
            fields.Add(field.ToString());
            records.Add(fields.ToArray());
        }

        // Drop blank lines (a record that is a single empty field) so a leading or
        // stray blank line doesn't become an empty header or empty row. A row of
        // genuinely-empty delimited fields (e.g. ",,") has length > 1 and is kept.
        records.RemoveAll(r => r.Length == 1 && r[0].Length == 0);

        return records;
    }

    // ── Delimiter detection ──────────────────────────────────────────────────

    private static readonly char[] DelimiterCandidates = { ',', ';', '\t', '|' };

    /// <summary>
    /// Heuristically detect the delimiter of delimited text by inspecting the first
    /// non-empty line and choosing the candidate (comma, semicolon, tab, or pipe)
    /// that splits it into the most fields. Quotes are respected. Falls back to comma
    /// (e.g. a genuine single-column file). Useful for European CSVs, which commonly
    /// use ';' because ',' is the decimal separator.
    /// </summary>
    public static char SniffDelimiter(string text)
    {
        if (string.IsNullOrEmpty(text)) return ',';

        string firstLine = "";
        using (var reader = new StringReader(text))
        {
            string? line;
            while ((line = reader.ReadLine()) != null)
            {
                if (line.Trim().Length > 0) { firstLine = line; break; }
            }
        }
        if (firstLine.Length == 0) return ',';

        char best = ',';
        int bestCount = 1;
        foreach (var d in DelimiterCandidates)
        {
            var records = ParseCsv(firstLine, d);
            int fields = records.Count > 0 ? records[0].Length : 1;
            if (fields > bestCount) { bestCount = fields; best = d; }
        }
        return best;
    }

    // ── Type inference ───────────────────────────────────────────────────────

    internal static object InferType(string value)
    {
        if (string.IsNullOrEmpty(value))
            return value;

        if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l))
            return l;

        if (double.TryParse(value, NumberStyles.Float | NumberStyles.AllowThousands,
                CultureInfo.InvariantCulture, out var d))
            return d;

        if (bool.TryParse(value, out var b))
            return b;

        return value;
    }
}
