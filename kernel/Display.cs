using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace SharpNoteKernel;

/// <summary>Determines what value Display.Plot sends to the Graph panel.</summary>
public enum PlotMode
{
    /// <summary>Plot the raw value as-is.</summary>
    Value,
    /// <summary>Plot the change from the previous call for this variable name.</summary>
    RateOfChange,
}

/// <summary>Y-axis assignment for Display.Plot.</summary>
public enum PlotAxis
{
    /// <summary>Left y-axis (default).</summary>
    Left,
    /// <summary>Right y-axis — useful for dual-scale charts.</summary>
    Right,
}

/// <summary>Chart visualisation type for a plotted series.</summary>
public enum ChartType
{
    /// <summary>Use the Graph panel's current default chart type.</summary>
    Default,
    /// <summary>Line chart.</summary>
    Line,
    /// <summary>Filled area chart.</summary>
    Area,
    /// <summary>Vertical bar chart.</summary>
    Bar,
}

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

// ── FormField ────────────────────────────────────────────────────────────────

public record FormField(
    string Key, string Label, string Type,
    object? DefaultValue = null, bool Required = false,
    string? Placeholder = null, double? Min = null, double? Max = null,
    double? Step = null, string[]? Options = null)
{
    public static FormField Text(string key, string label, string defaultValue = "", bool required = false, string? placeholder = null)
        => new(key, label, "text", defaultValue, required, placeholder);

    public static FormField Number(string key, string label, double defaultValue = 0, bool required = false, double? min = null, double? max = null, double? step = null)
        => new(key, label, "number", defaultValue, required, Min: min, Max: max, Step: step);

    public static FormField Select(string key, string label, string[] options, string? defaultValue = null, bool required = false)
        => new(key, label, "select", defaultValue ?? (options.Length > 0 ? options[0] : ""), required, Options: options);

    public static FormField Checkbox(string key, string label, bool defaultValue = false)
        => new(key, label, "checkbox", defaultValue);

    public static FormField TextArea(string key, string label, string defaultValue = "", string? placeholder = null, bool required = false)
        => new(key, label, "textarea", defaultValue, required, placeholder);

    public static FormField Date(string key, string label, string? defaultValue = null)
        => new(key, label, "date", defaultValue ?? DateTime.Today.ToString("yyyy-MM-dd"));
}

// ── LayoutCell ────────────────────────────────────────────────────────────────

/// <summary>A titled cell for use with <see cref="DisplayHelper.Layout"/>.</summary>
public record LayoutCell(string? Title, object? Content, string? Format = null);

// ── ProgressHandle ────────────────────────────────────────────────────────────

public class ProgressHandle
{
    private readonly DisplayHelper _display;
    public string HandleId { get; }
    private readonly string? _label;
    private readonly int _total;
    private int _current;

    internal ProgressHandle(DisplayHelper display, string handleId, string? label, int total)
    {
        _display = display;
        HandleId = handleId;
        _label   = label;
        _total   = total;
    }

    /// <summary>Updates the progress bar to <paramref name="current"/> out of total.</summary>
    public void Report(int current)
    {
        _current = current;
        var pct  = _total > 0 ? (double)current / _total * 100.0 : 0.0;
        _display.SendUpdate("progress",
            (object)new { label = _label, current, total = _total, pct, done = false }, HandleId);
    }

    /// <summary>Marks the progress bar as complete.</summary>
    public void Complete()
    {
        _display.SendUpdate("progress",
            (object)new { label = _label, current = _total, total = _total, pct = 100.0, done = true }, HandleId);
    }
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

    /// <summary>Updates a live image display (created via <see cref="DisplayHelper.NewImage"/>).</summary>
    public void UpdateImage(string src, string? alt = null, int? width = null, int? height = null) =>
        _display.SendUpdate("image", new { src, alt, width, height }, HandleId);

    /// <summary>Updates a live image with raw RGB bytes.</summary>
    public void UpdateImageBytes(byte[] rgb, int width, int height) =>
        UpdateImage(BmpEncoder.EncodeBase64DataUri(rgb, width, height), width: width, height: height);

    public void Clear() =>
        _display.SendUpdate("html", (object)"", HandleId);
}

// ── CanvasHandle ─────────────────────────────────────────────────────────────

/// <summary>
/// A pixel buffer that renders as a live-updating image. Write pixels with
/// <see cref="SetPixel"/> and call <see cref="Flush"/> to push the update.
/// </summary>
public class CanvasHandle
{
    private readonly byte[] _pixels;
    private readonly int _width;
    private readonly int _height;
    private readonly DisplayHelper _display;
    private readonly string _handleId;

    internal CanvasHandle(DisplayHelper display, string handleId, int width, int height)
    {
        _display  = display;
        _handleId = handleId;
        _width    = width;
        _height   = height;
        _pixels   = new byte[width * height * 3];
    }

    /// <summary>Width in pixels.</summary>
    public int Width => _width;

    /// <summary>Height in pixels.</summary>
    public int Height => _height;

    /// <summary>Sets a pixel using byte values (0–255).</summary>
    public void SetPixel(int x, int y, byte r, byte g, byte b)
    {
        if ((uint)x >= (uint)_width || (uint)y >= (uint)_height) return;
        int i = (y * _width + x) * 3;
        _pixels[i] = r; _pixels[i + 1] = g; _pixels[i + 2] = b;
    }

    /// <summary>Sets a pixel using double values (0.0–1.0), clamped.</summary>
    public void SetPixel(int x, int y, double r, double g, double b)
    {
        SetPixel(x, y,
            (byte)(Math.Clamp(r, 0, 1) * 255),
            (byte)(Math.Clamp(g, 0, 1) * 255),
            (byte)(Math.Clamp(b, 0, 1) * 255));
    }

    /// <summary>Fills the entire canvas with a solid colour.</summary>
    public void Fill(byte r, byte g, byte b)
    {
        for (int i = 0; i < _pixels.Length; i += 3)
        { _pixels[i] = r; _pixels[i + 1] = g; _pixels[i + 2] = b; }
    }

    /// <summary>Returns the raw RGB pixel buffer (3 bytes per pixel, row-major).</summary>
    public byte[] Pixels => _pixels;

    // ── Shape primitives ─────────────────────────────────────────────────────

    /// <summary>Draws a line from (x0,y0) to (x1,y1) using Bresenham's algorithm.</summary>
    public void DrawLine(int x0, int y0, int x1, int y1, byte r, byte g, byte b)
    {
        int dx = Math.Abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        int dy = -Math.Abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        int err = dx + dy;
        while (true)
        {
            SetPixel(x0, y0, r, g, b);
            if (x0 == x1 && y0 == y1) break;
            int e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }

    /// <summary>Draws an axis-aligned rectangle outline.</summary>
    public void DrawRect(int x, int y, int w, int h, byte r, byte g, byte b)
    {
        DrawLine(x, y, x + w - 1, y, r, g, b);
        DrawLine(x + w - 1, y, x + w - 1, y + h - 1, r, g, b);
        DrawLine(x + w - 1, y + h - 1, x, y + h - 1, r, g, b);
        DrawLine(x, y + h - 1, x, y, r, g, b);
    }

    /// <summary>Fills an axis-aligned rectangle.</summary>
    public void FillRect(int x, int y, int w, int h, byte r, byte g, byte b)
    {
        for (int py = y; py < y + h; py++)
            for (int px = x; px < x + w; px++)
                SetPixel(px, py, r, g, b);
    }

    /// <summary>Draws a circle outline using the midpoint algorithm.</summary>
    public void DrawCircle(int cx, int cy, int radius, byte r, byte g, byte b)
    {
        int x = radius, y = 0, err = 1 - radius;
        while (x >= y)
        {
            SetPixel(cx + x, cy + y, r, g, b); SetPixel(cx - x, cy + y, r, g, b);
            SetPixel(cx + x, cy - y, r, g, b); SetPixel(cx - x, cy - y, r, g, b);
            SetPixel(cx + y, cy + x, r, g, b); SetPixel(cx - y, cy + x, r, g, b);
            SetPixel(cx + y, cy - x, r, g, b); SetPixel(cx - y, cy - x, r, g, b);
            y++;
            if (err < 0) { err += 2 * y + 1; }
            else { x--; err += 2 * (y - x) + 1; }
        }
    }

    /// <summary>Fills a circle using the midpoint algorithm with horizontal spans.</summary>
    public void FillCircle(int cx, int cy, int radius, byte r, byte g, byte b)
    {
        int x = radius, y = 0, err = 1 - radius;
        while (x >= y)
        {
            for (int px = cx - x; px <= cx + x; px++) { SetPixel(px, cy + y, r, g, b); SetPixel(px, cy - y, r, g, b); }
            for (int px = cx - y; px <= cx + y; px++) { SetPixel(px, cy + x, r, g, b); SetPixel(px, cy - x, r, g, b); }
            y++;
            if (err < 0) { err += 2 * y + 1; }
            else { x--; err += 2 * (y - x) + 1; }
        }
    }

    // ── Parallel rendering ───────────────────────────────────────────────────

    /// <summary>
    /// Renders every pixel in parallel using the provided function.
    /// The function receives (x, y) and returns (r, g, b) as doubles in 0–1.
    /// </summary>
    public void ParallelRender(Func<int, int, (double r, double g, double b)> colorFn)
    {
        System.Threading.Tasks.Parallel.For(0, _height, y =>
        {
            for (int x = 0; x < _width; x++)
            {
                var (cr, cg, cb) = colorFn(x, y);
                int i = (y * _width + x) * 3;
                _pixels[i]     = (byte)(Math.Clamp(cr, 0, 1) * 255);
                _pixels[i + 1] = (byte)(Math.Clamp(cg, 0, 1) * 255);
                _pixels[i + 2] = (byte)(Math.Clamp(cb, 0, 1) * 255);
            }
        });
    }

    /// <summary>Encodes the current pixel buffer as BMP and pushes the update to the display.</summary>
    public void Flush()
    {
        var uri = BmpEncoder.EncodeBase64DataUri(_pixels, _width, _height);
        _display.SendUpdate("image", new { src = uri, width = _width, height = _height }, _handleId);
    }

    /// <summary>
    /// Renders row-by-row with automatic flush every N rows for live preview.
    /// Faster than manual SetPixel loops because it minimizes flush overhead.
    /// </summary>
    public void RenderRows(Func<int, int, (double r, double g, double b)> colorFn, int flushEvery = 50)
    {
        for (int y = 0; y < _height; y++)
        {
            for (int x = 0; x < _width; x++)
            {
                var (cr, cg, cb) = colorFn(x, y);
                int i = (y * _width + x) * 3;
                _pixels[i]     = (byte)(Math.Clamp(cr, 0, 1) * 255);
                _pixels[i + 1] = (byte)(Math.Clamp(cg, 0, 1) * 255);
                _pixels[i + 2] = (byte)(Math.Clamp(cb, 0, 1) * 255);
            }
            if (flushEvery > 0 && y % flushEvery == 0) Flush();
        }
        Flush();
    }
}

// ── DisplayHelper ─────────────────────────────────────────────────────────────

public class DisplayHelper
{
    private readonly TextWriter _out;
    private readonly Dictionary<string, JsonElement>? _widgetValues;
    private readonly Dictionary<string, double> _plotLastValues = new();
    private string? _currentId;
    private int _widgetCounter;
    private int _formCounter;

    public DisplayHelper(TextWriter output, Dictionary<string, JsonElement>? widgetValues = null)
    {
        _out = output;
        _widgetValues = widgetValues;
    }

    public void SetCellId(string id)
    {
        _currentId = id;
        _widgetCounter = 0;
        _formCounter = 0;
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

    /// <summary>Display a scrolling marquee ticker.</summary>
    public void Marquee(string text, int speed = 40, string? color = null, string? background = null, string? title = null)
    {
        var c = color ?? "#4ec9b0";
        var bg = background ?? "transparent";
        var html = $@"<div style=""overflow:hidden;white-space:nowrap;font-family:monospace;font-size:13px;color:{c};background:{bg};padding:4px 0;border-top:1px solid #333;border-bottom:1px solid #333"">
  <div style=""display:inline-block;animation:sn-marquee {speed}s linear infinite"">{System.Net.WebUtility.HtmlEncode(text)}</div>
  <style>@keyframes sn-marquee {{ from {{ transform: translateX(100%); }} to {{ transform: translateX(-100%); }} }}</style>
</div>";
        Html(html, title);
    }

    /// <summary>Display a stat card with large value and label.</summary>
    public void StatCard(string label, string value, string? color = null, string? icon = null, string? title = null)
    {
        var c = color ?? "#4ec9b0";
        var iconHtml = icon != null ? $"<div style=\"font-size:24px;margin-bottom:4px\">{System.Net.WebUtility.HtmlEncode(icon)}</div>" : "";
        var html = $@"<div style=""background:#1a1a22;border:1px solid #333;border-left:3px solid {c};border-radius:6px;padding:14px 18px;text-align:center"">
  {iconHtml}<div style=""font-size:28px;font-weight:700;color:{c};font-family:monospace;line-height:1.2"">{System.Net.WebUtility.HtmlEncode(value)}</div>
  <div style=""font-size:11px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em"">{System.Net.WebUtility.HtmlEncode(label)}</div>
</div>";
        Html(html, title);
    }

    /// <summary>Display a horizontal progress bar.</summary>
    public void ProgressBar(double percent, string? label = null, string? color = null, string? title = null)
    {
        var c = color ?? "#4ec9b0";
        var pct = Math.Clamp(percent, 0, 100);
        var lbl = label ?? $"{pct:F0}%";
        var html = $@"<div style=""background:#1a1a22;border-radius:4px;overflow:hidden;border:1px solid #333;position:relative;height:22px"">
  <div style=""width:{pct:F1}%;height:100%;background:{c};transition:width 0.5s;opacity:0.8""></div>
  <div style=""position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#ddd;font-family:monospace"">{System.Net.WebUtility.HtmlEncode(lbl)}</div>
</div>";
        Html(html, title);
    }

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

    /// <summary>Emits a collapsible object tree for complex objects.</summary>
    internal void Tree(string json, string? title = null) =>
        Send(new { type = "display", id = _currentId, format = "tree", content = (object)json, title });

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

    // ── Forms ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Renders a form with fields inferred from an anonymous object's properties.
    /// On submit, the target cell executes with FormData dictionary.
    /// </summary>
    public void Form(string title, object model, string targetCell)
    {
        var fields = new List<object>();
        foreach (var prop in model.GetType().GetProperties())
        {
            var val = prop.GetValue(model);
            var type = val switch
            {
                bool   => "checkbox",
                int    => "number",
                long   => "number",
                float  => "number",
                double => "number",
                decimal => "number",
                DateTime dt => "date",
                _ => "text",
            };
            var defaultValue = val switch
            {
                DateTime dt => dt.ToString("yyyy-MM-dd"),
                _ => val,
            };
            var label = System.Text.RegularExpressions.Regex.Replace(prop.Name, "([a-z])([A-Z])", "$1 $2");
            fields.Add(new { key = prop.Name, label, type, defaultValue, required = false });
        }

        var formKey = $"{_currentId}_f{_formCounter++}";
        Send(new { type = "display", id = _currentId, format = "form",
                   content = new { formKey, title, targetCell, fields } });
    }

    /// <summary>
    /// Renders a form with explicit field descriptors.
    /// On submit, the target cell executes with FormData dictionary.
    /// </summary>
    public void Form(string title, FormField[] fields, string targetCell)
    {
        var formKey = $"{_currentId}_f{_formCounter++}";
        var fieldSpecs = fields.Select(f => new {
            key = f.Key, label = f.Label, type = f.Type,
            defaultValue = f.DefaultValue, required = f.Required,
            placeholder = f.Placeholder, min = f.Min, max = f.Max,
            step = f.Step, options = f.Options,
        }).ToArray();
        Send(new { type = "display", id = _currentId, format = "form",
                   content = new { formKey, title, targetCell, fields = fieldSpecs } });
    }

    /// <summary>
    /// Renders an image from a URL, file path, or base64 data URI.
    /// </summary>
    public void Image(string source, string? alt = null, int? width = null, int? height = null) =>
        Send(new { type = "display", id = _currentId, format = "image",
                   content = new { src = source, alt, width, height } });

    /// <summary>
    /// Renders an image from raw RGB pixel data (3 bytes per pixel, row-major).
    /// Encodes as BMP internally — no manual encoding needed.
    /// </summary>
    public void ImageBytes(byte[] rgb, int width, int height, string? title = null)
    {
        var uri = BmpEncoder.EncodeBase64DataUri(rgb, width, height);
        Send(new { type = "display", id = _currentId, format = "image",
                   content = new { src = uri, width, height }, title });
    }

    /// <summary>
    /// Creates a live-updating image display. Use the returned handle's
    /// <see cref="DisplayHandle.UpdateImage"/> or <see cref="DisplayHandle.UpdateImageBytes"/>
    /// to replace the image in-place.
    /// </summary>
    public DisplayHandle NewImage(string initialSrc, string? alt = null, int? width = null, int? height = null, string? title = null)
    {
        var h = NewHandle();
        Send(new { type = "display", id = _currentId, format = "image",
                   content = new { src = initialSrc, alt, width, height },
                   handleId = h.HandleId, title });
        return h;
    }

    /// <summary>
    /// Creates a pixel canvas of the given size. Call <see cref="CanvasHandle.SetPixel"/>
    /// to draw pixels and <see cref="CanvasHandle.Flush"/> to push the update.
    /// </summary>
    public CanvasHandle Canvas(int width, int height, string? title = null)
    {
        var handleId = NewHandle().HandleId;
        // Send initial blank image
        var uri = BmpEncoder.EncodeBase64DataUri(new byte[width * height * 3], width, height);
        Send(new { type = "display", id = _currentId, format = "image",
                   content = new { src = uri, width, height },
                   handleId, title });
        return new CanvasHandle(this, handleId, width, height);
    }

    /// <summary>
    /// Renders a live-updating progress bar. Call <see cref="ProgressHandle.Report"/> to
    /// update and <see cref="ProgressHandle.Complete"/> when done.
    /// </summary>
    public ProgressHandle Progress(string? label = null, int total = 100)
    {
        var h = NewHandle();
        Send(new { type = "display", id = _currentId, format = "progress",
                   content = new { label, current = 0, total, pct = 0.0, done = false },
                   handleId = h.HandleId });
        return new ProgressHandle(this, h.HandleId, label, total);
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
    /// <param name="name">Series name — identifies the line/bar in the Graph panel.</param>
    /// <param name="value">The numeric value to plot.</param>
    /// <param name="mode">Plot the raw value or the delta from the previous call.</param>
    /// <param name="axis">Assign the series to the left or right y-axis.</param>
    /// <param name="type">Chart visualisation type; <see cref="ChartType.Default"/> uses the panel's current setting.</param>
    public void Plot(string name, double value, PlotMode mode = PlotMode.Value,
                     PlotAxis axis = PlotAxis.Left, ChartType type = ChartType.Default)
    {
        var axisStr = axis == PlotAxis.Right ? "y2" : "y";
        var typeStr = type switch
        {
            ChartType.Line => "line",
            ChartType.Area => "area",
            ChartType.Bar  => "bar",
            _              => (string?)null,
        };
        PlotRaw(name, value, mode, axisStr, typeStr);
    }

    /// <summary>
    /// Pushes a single numeric data point to the Graph panel — string-based overload
    /// for backward compatibility and concise inline usage.
    /// </summary>
    /// <param name="axis"><c>"y"</c> (left, default) or <c>"y2"</c> (right).</param>
    /// <param name="type"><c>"line"</c>, <c>"area"</c>, <c>"bar"</c>, or <c>null</c> (panel default).</param>
    public void Plot(string name, double value, PlotMode mode, string axis, string? type = null)
        => PlotRaw(name, value, mode, axis, type);

    private void PlotRaw(string name, double value, PlotMode mode, string axis, string? chartType)
    {
        double plotValue = value;
        if (mode == PlotMode.RateOfChange)
        {
            plotValue = _plotLastValues.TryGetValue(name, out var prev) ? value - prev : 0;
        }
        _plotLastValues[name] = value;
        Send(new { type = "var_point", name, value = plotValue,
                   time = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), axis,
                   chartType = (object?)chartType });
    }

    /// <summary>
    /// Clears all data from the Graph panel immediately.
    /// </summary>
    public void ClearGraph() => Send(new { type = "graph_clear" });

    // ── Layout ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates a titled cell for use with <see cref="Layout"/>.
    /// Specify <paramref name="format"/> to override auto-detection — useful for chart configs
    /// which cannot be distinguished from plain objects: use <c>"graph"</c>, <c>"html"</c>,
    /// <c>"markdown"</c>, <c>"image"</c>, or <c>"table"</c>.
    /// </summary>
    public LayoutCell Cell(string? title, object? content, string? format = null) => new(title, content, format);

    /// <summary>
    /// Arranges multiple objects side-by-side in a grid with the given number of columns.
    /// Each item is serialized using the same auto-display logic as <c>.Display()</c>.
    /// Wrap items with <see cref="Cell"/> to add per-cell titles.
    /// </summary>
    public void Layout(int columns, params object?[] items)
    {
        var cells = items.Select(item =>
        {
            string? title = null;
            object? content = item;
            string? format = null;
            if (item is LayoutCell lc) { title = lc.Title; content = lc.Content; format = lc.Format; }

            object? cellContent;
            if (format != null)
            {
                // Explicit format — serialize content directly without AutoDisplay type-dispatch.
                // Needed for chart configs and other objects that are indistinguishable from plain objects.
                try { cellContent = JsonSerializer.SerializeToElement(new { type = "display", id = (string?)null, format, content, title = (string?)null }); }
                catch { cellContent = null; }
            }
            else
            {
                var sw = new StringWriter();
                SharpNoteExtensions.AutoDisplay(new DisplayHelper(sw), content);
                cellContent = TryParseJson(sw.ToString().Trim());
            }

            return (object)new { title, content = cellContent };
        }).ToArray();

        Send(new { type = "display", id = _currentId, format = "layout", columns, cells });
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private static JsonElement? TryParseJson(string json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonSerializer.Deserialize<JsonElement>(json); }
        catch { return null; }
    }

    internal static List<Dictionary<string, object?>> ToRowDicts(List<object?> items)
    {
        return items.Select(row =>
        {
            if (row == null) return new Dictionary<string, object?> { ["value"] = null };
            // Rows from SQL cells are already dictionaries — use them directly
            if (row is Dictionary<string, object?> d) return d;
            var dict = new Dictionary<string, object?>();
            foreach (var p in row.GetType().GetProperties())
            {
                if (p.GetIndexParameters().Length > 0) continue; // skip indexers
                dict[p.Name] = p.GetValue(row);
            }
            if (dict.Count == 0)
                dict["value"] = row.ToString();
            return dict;
        }).ToList();
    }
}
