using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace SharpNoteKernel;

public class EmbeddedFile
{
    private readonly FilesHelper _owner;
    private readonly Dictionary<string, string> _variables;

    internal EmbeddedFile(FilesHelper owner, string name, string filename,
                          string mimeType, byte[] content, Dictionary<string, string> variables)
    {
        _owner     = owner;
        Name       = name;
        Filename   = filename;
        MimeType   = mimeType;
        Content    = content;
        _variables = variables ?? new();
    }

    public string Name     { get; }
    public string Filename { get; }
    public string MimeType { get; }
    public byte[] Content  { get; }

    /// <summary>UTF-8 decoded content.</summary>
    public string ContentAsText => Encoding.UTF8.GetString(Content);

    /// <summary>Opens a readable stream over the content.</summary>
    public Stream OpenRead() => new MemoryStream(Content, writable: false);

    /// <summary>Parses the content as CSV into the same format as Data.LoadCsv().</summary>
    public List<Dictionary<string, object>> ContentCsv => ParseCsvContent(',', true);

    /// <summary>Parses the content as TSV into the same format as Data.LoadCsv().</summary>
    public List<Dictionary<string, object>> ContentTsv => ParseCsvContent('\t', true);

    /// <summary>Parses content as delimited text with options.</summary>
    public List<Dictionary<string, object>> ParseCsvContent(char delimiter = ',', bool hasHeader = true)
    {
        var text = ContentAsText;
        var records = DataHelper.ParseCsv(text, delimiter);
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
                dict[headers[c]] = c < row.Length ? DataHelper.InferType(row[c]) : "";
            result.Add(dict);
        }
        return result;
    }

    /// <summary>Read-only view of variables.</summary>
    public IReadOnlyDictionary<string, string> Variables => _variables;

    /// <summary>Get a variable value, or null if not found.</summary>
    public string? GetVariable(string key) =>
        _variables.TryGetValue(key, out var v) ? v : null;

    /// <summary>Set a variable and notify the renderer to persist it.</summary>
    public void SetVariable(string key, string value)
    {
        _variables[key] = value;
        _owner.NotifyVariableChange(Name, key, value);
    }
}

public class FilesHelper
{
    private readonly TextWriter _out;
    private readonly Dictionary<string, EmbeddedFile> _files = new(StringComparer.OrdinalIgnoreCase);

    public FilesHelper(TextWriter output) => _out = output;

    /// <summary>Access an embedded file by name.</summary>
    public EmbeddedFile this[string name] => Get(name);

    /// <summary>Get an embedded file by name.</summary>
    public EmbeddedFile Get(string name)
    {
        if (_files.TryGetValue(name, out var f)) return f;
        throw new KeyNotFoundException($"No embedded file named '{name}'. Available: {string.Join(", ", _files.Keys)}");
    }

    /// <summary>Check if a file exists.</summary>
    public bool Contains(string name) => _files.ContainsKey(name);

    /// <summary>List all embedded files.</summary>
    public IReadOnlyList<EmbeddedFile> List() => _files.Values.ToList();

    /// <summary>Embed a new file (or replace existing). Notifies the renderer to persist.</summary>
    public void Embed(string name, byte[] content, string filename, string mimeType = "application/octet-stream")
    {
        var vars = _files.TryGetValue(name, out var existing)
            ? new Dictionary<string, string>(existing.Variables)
            : new Dictionary<string, string>();
        var file = new EmbeddedFile(this, name, filename, mimeType, content, vars);
        _files[name] = file;

        lock (_out)
        {
            _out.WriteLine(JsonSerializer.Serialize(new
            {
                type = "file_embed",
                name,
                filename,
                mimeType,
                content = Convert.ToBase64String(content),
                encoding = "base64",
                variables = vars,
            }));
        }

        LogContext.WriteNotebook($"Files: embedded '{name}' ({filename}, {content.Length} bytes)");
    }

    /// <summary>Embed a text file.</summary>
    public void EmbedText(string name, string text, string filename, string mimeType = "text/plain")
        => Embed(name, Encoding.UTF8.GetBytes(text), filename, mimeType);

    internal void NotifyVariableChange(string name, string key, string value)
    {
        lock (_out)
        {
            _out.WriteLine(JsonSerializer.Serialize(new
            {
                type = "file_var_set",
                name,
                key,
                value,
            }));
        }
    }

    /// <summary>Called by the kernel on load to populate all embedded files from the notebook.</summary>
    internal void LoadAll(JsonElement filesArray)
    {
        _files.Clear();
        if (filesArray.ValueKind != JsonValueKind.Array) return;

        foreach (var item in filesArray.EnumerateArray())
        {
            var name     = item.TryGetProperty("name", out var np) ? np.GetString() ?? "" : "";
            var filename = item.TryGetProperty("filename", out var fp) ? fp.GetString() ?? "" : "";
            var mimeType = item.TryGetProperty("mimeType", out var mp) ? mp.GetString() ?? "" : "";
            var content  = item.TryGetProperty("content", out var cp) ? cp.GetString() ?? "" : "";
            var encoding = item.TryGetProperty("encoding", out var ep) ? ep.GetString() ?? "text" : "text";

            byte[] bytes = encoding == "base64"
                ? Convert.FromBase64String(content)
                : Encoding.UTF8.GetBytes(content);

            var vars = new Dictionary<string, string>();
            if (item.TryGetProperty("variables", out var vp) && vp.ValueKind == JsonValueKind.Object)
            {
                foreach (var kv in vp.EnumerateObject())
                    vars[kv.Name] = kv.Value.GetString() ?? "";
            }

            _files[name] = new EmbeddedFile(this, name, filename, mimeType, bytes, vars);
        }

        LogContext.WriteNotebook($"Files: loaded {_files.Count} embedded file(s)");
    }
}
