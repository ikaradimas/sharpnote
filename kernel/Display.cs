using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace PolyglotKernel;

// ── DisplayHandle ─────────────────────────────────────────────────────────────

public class DisplayHandle
{
    private readonly DisplayHelper _display;
    public string HandleId { get; }

    internal DisplayHandle(DisplayHelper display, string handleId)
    {
        _display = display;
        HandleId = handleId;
    }

    public void UpdateHtml(string html) =>
        _display.SendUpdate("html", (object)html, HandleId);

    public void UpdateTable<T>(IEnumerable<T> rows)
    {
        var list = DisplayHelper.ToRowDicts(rows.Cast<object?>().ToList());
        _display.SendUpdate("table", (object)list, HandleId);
    }

    public void UpdateGraph(object config) =>
        _display.SendUpdate("graph", config, HandleId);

    public void Clear() =>
        _display.SendUpdate("html", (object)"", HandleId);
}

// ── DisplayHelper ─────────────────────────────────────────────────────────────

public class DisplayHelper
{
    private readonly TextWriter _out;
    private string? _currentId;

    public DisplayHelper(TextWriter output) => _out = output;

    public void SetCellId(string id) => _currentId = id;

    private void Send(object payload)
    {
        _out.WriteLine(JsonSerializer.Serialize(payload));
    }

    // ── One-shot display ──────────────────────────────────────────────────────

    public void Html(string html, string? title = null) =>
        Send(new { type = "display", id = _currentId, format = "html", content = (object)html, title });

    public void Table<T>(IEnumerable<T> rows, string? title = null)
    {
        var list = ToRowDicts(rows.Cast<object?>().ToList());
        Send(new { type = "display", id = _currentId, format = "table", content = (object)list, title });
    }

    public void TableFromDicts(IEnumerable<Dictionary<string, object?>> rows, string? title = null)
    {
        var list = rows.ToList();
        Send(new { type = "display", id = _currentId, format = "table", content = (object)list, title });
    }

    public void Csv(string csv, string? title = null) =>
        Send(new { type = "display", id = _currentId, format = "csv", content = (object)csv, title });

    public void Graph(object chartConfig, string? title = null) =>
        Send(new { type = "display", id = _currentId, format = "graph", content = chartConfig, title });

    // ── Updateable display handles ────────────────────────────────────────────

    public DisplayHandle NewHtml(string initialHtml, string? title = null)
    {
        var h = NewHandle();
        Send(new { type = "display", id = _currentId, format = "html",
                   content = (object)initialHtml, handleId = h.HandleId, title });
        return h;
    }

    public DisplayHandle NewTable<T>(IEnumerable<T> rows, string? title = null)
    {
        var h = NewHandle();
        var list = ToRowDicts(rows.Cast<object?>().ToList());
        Send(new { type = "display", id = _currentId, format = "table",
                   content = (object)list, handleId = h.HandleId, title });
        return h;
    }

    public DisplayHandle NewGraph(object chartConfig, string? title = null)
    {
        var h = NewHandle();
        Send(new { type = "display", id = _currentId, format = "graph",
                   content = chartConfig, handleId = h.HandleId, title });
        return h;
    }

    internal void SendUpdate(string format, object content, string handleId) =>
        Send(new { type = "display", id = _currentId, format, content, handleId, update = true });

    private DisplayHandle NewHandle() =>
        new(this, Guid.NewGuid().ToString("N")[..12]);

    internal static List<Dictionary<string, object?>> ToRowDicts(List<object?> items)
    {
        return items.Select(row =>
        {
            if (row == null) return new Dictionary<string, object?> { ["value"] = null };
            var dict = new Dictionary<string, object?>();
            foreach (var p in row.GetType().GetProperties())
                dict[p.Name] = p.GetValue(row);
            if (dict.Count == 0)
                dict["value"] = row.ToString();
            return dict;
        }).ToList();
    }
}
