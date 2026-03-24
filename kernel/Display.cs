using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace SharpNoteKernel;

// ── WidgetHandle ───────────────────────────────────────────────────────────────

public class WidgetHandle
{
    public string WidgetKey { get; }
    private readonly double _numericValue;
    private readonly string _stringValue;

    internal WidgetHandle(string widgetKey, double numericValue)
    {
        WidgetKey = widgetKey;
        _numericValue = numericValue;
        _stringValue = numericValue.ToString();
    }

    internal WidgetHandle(string widgetKey, string stringValue)
    {
        WidgetKey = widgetKey;
        _stringValue = stringValue;
        double.TryParse(stringValue, System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out _numericValue);
    }

    public double Value => _numericValue;
    public string StringValue => _stringValue;

    public static implicit operator double(WidgetHandle h) => h._numericValue;
    public static implicit operator int(WidgetHandle h) => (int)h._numericValue;
    public static implicit operator float(WidgetHandle h) => (float)h._numericValue;
    public static implicit operator string(WidgetHandle h) => h._stringValue;

    public override string ToString() => _stringValue;
}

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
    private readonly Dictionary<string, JsonElement>? _widgetValues;
    private string? _currentId;
    private int _widgetCounter;

    public DisplayHelper(TextWriter output, Dictionary<string, JsonElement>? widgetValues = null)
    {
        _out = output;
        _widgetValues = widgetValues;
    }

    public void SetCellId(string id)
    {
        _currentId = id;
        _widgetCounter = 0;
    }

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

    // ── Interactive widgets ───────────────────────────────────────────────────

    /// <summary>
    /// Renders an interactive slider widget. The value persists between cell executions.
    /// Use implicit conversion or .Value to get the current numeric value.
    /// </summary>
    public WidgetHandle Slider(string label, double min, double max, double step = 1.0, double defaultValue = 0)
    {
        var widgetKey = $"{_currentId}_w{_widgetCounter++}";
        double currentValue = defaultValue;
        if (_widgetValues != null && _widgetValues.TryGetValue(widgetKey, out var stored)
            && stored.ValueKind == JsonValueKind.Number
            && stored.TryGetDouble(out var d))
        {
            currentValue = d;
        }

        Send(new { type = "display", id = _currentId, format = "widget",
                   content = new { widgetType = "slider", widgetKey, label, min, max, step, value = currentValue } });
        return new WidgetHandle(widgetKey, currentValue);
    }

    /// <summary>
    /// Renders an interactive dropdown widget. The selected option persists between cell executions.
    /// Use implicit conversion or .StringValue to get the current selected value.
    /// </summary>
    public WidgetHandle Dropdown(string label, string[] options, string? defaultValue = null)
    {
        var widgetKey = $"{_currentId}_w{_widgetCounter++}";
        string currentValue = defaultValue ?? (options.Length > 0 ? options[0] : "");
        if (_widgetValues != null && _widgetValues.TryGetValue(widgetKey, out var stored)
            && stored.ValueKind == JsonValueKind.String)
        {
            var s = stored.GetString();
            if (s != null && options.Contains(s)) currentValue = s;
        }

        Send(new { type = "display", id = _currentId, format = "widget",
                   content = new { widgetType = "dropdown", widgetKey, label, options, value = currentValue } });
        return new WidgetHandle(widgetKey, currentValue);
    }

    /// <summary>
    /// Renders an interactive date picker widget. The selected date persists between cell executions.
    /// Use .StringValue to get the current date as an ISO-8601 string (YYYY-MM-DD).
    /// </summary>
    public WidgetHandle DatePicker(string label, string defaultValue = "")
    {
        var widgetKey = $"{_currentId}_w{_widgetCounter++}";
        string currentValue = string.IsNullOrEmpty(defaultValue)
            ? DateTime.Today.ToString("yyyy-MM-dd")
            : defaultValue;
        if (_widgetValues != null && _widgetValues.TryGetValue(widgetKey, out var stored)
            && stored.ValueKind == JsonValueKind.String)
        {
            var s = stored.GetString();
            if (!string.IsNullOrEmpty(s)) currentValue = s;
        }

        Send(new { type = "display", id = _currentId, format = "widget",
                   content = new { widgetType = "datepicker", widgetKey, label, value = currentValue } });
        return new WidgetHandle(widgetKey, currentValue);
    }

    /// <summary>
    /// Renders a markdown string with full Mermaid diagram and KaTeX math support.
    /// </summary>
    public void Markdown(string markdown, string? title = null) =>
        Send(new { type = "display", id = _currentId, format = "markdown", content = (object)markdown, title });

    /// <summary>
    /// Pushes a single numeric data point to the Graph panel immediately, without waiting
    /// for the cell to finish. Useful for plotting loop variables in real time.
    /// </summary>
    public void Plot(string name, double value) =>
        Send(new { type = "var_point", name, value });

    // ── Internal helpers ──────────────────────────────────────────────────────

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
