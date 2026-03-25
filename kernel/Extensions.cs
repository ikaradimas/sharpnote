using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace SharpNoteKernel;

// ── Extension methods ─────────────────────────────────────────────────────────

public static class SharpNoteExtensions
{
    public static void Display(this object? obj, string? title = null)
    {
        var d = DisplayContext.Current;
        if (d == null) return;
        AutoDisplay(d, obj, title);
    }

    /// <summary>LinqPAD-compatible alias for <see cref="Display"/>.</summary>
    public static void Dump(this object? obj, string? title = null) => obj.Display(title);

    public static void DisplayTable<T>(this IEnumerable<T> rows, string? title = null)
    {
        var d = DisplayContext.Current;
        if (d == null) return;
        var dicts = DisplayHelper.ToRowDicts(rows.Cast<object?>().ToList());
        d.TableFromDicts(dicts, title);
    }

    /// <summary>LinqPAD-compatible alias for <see cref="DisplayTable{T}"/>.</summary>
    public static void DumpTable<T>(this IEnumerable<T> rows, string? title = null) => rows.DisplayTable(title);

    public static void DisplayHtml(this string html, string? title = null)
    {
        DisplayContext.Current?.Html(html, title);
    }

    public static void DisplayCsv(this string csv, string? title = null)
    {
        DisplayContext.Current?.Csv(csv, title);
    }

    public static void DisplayGraph(this object chartConfig, string? title = null)
    {
        DisplayContext.Current?.Graph(chartConfig, title);
    }

    public static T Log<T>(this T obj, string? label = null)
    {
        var output = LogContext.Output;
        if (output != null)
        {
            string msg;
            if (obj == null)
                msg = "null";
            else if (obj is string s)
                msg = s;
            else if (obj.GetType().IsPrimitive || obj is decimal)
                msg = obj.ToString() ?? "";
            else
            {
                try { msg = JsonSerializer.Serialize(obj); }
                catch { msg = obj.ToString() ?? ""; }
            }

            output.WriteLine(JsonSerializer.Serialize(new
            {
                type = "log",
                tag = "USER",
                message = label != null ? $"{label}: {msg}" : msg,
                timestamp = DateTime.UtcNow.ToString("O"),
            }));
        }
        return obj;
    }

    internal static void AutoDisplay(DisplayHelper d, object? obj, string? title = null)
    {
        if (obj == null) return;

        if (obj is string s)
        {
            d.Html($"<pre>{System.Net.WebUtility.HtmlEncode(s)}</pre>", title);
            return;
        }

        if (obj is IEnumerable enumerable)
        {
            var items = enumerable.Cast<object?>().ToList();
            if (items.Count == 0)
            {
                d.Html("<pre>(empty)</pre>", title);
                return;
            }
            var first = items[0];
            if (first == null || first is string || first.GetType().IsPrimitive)
            {
                var rows = items.Select((v, i) => new Dictionary<string, object?> { ["index"] = i, ["value"] = v }).ToList();
                d.TableFromDicts(rows, title);
            }
            else
            {
                var dicts = DisplayHelper.ToRowDicts(items);
                d.TableFromDicts(dicts, title);
            }
            return;
        }

        if (obj.GetType().IsPrimitive || obj is decimal)
        {
            d.Html($"<pre>{obj}</pre>", title);
            return;
        }

        try
        {
            var json = JsonSerializer.Serialize(obj, new JsonSerializerOptions { WriteIndented = true });
            d.Html($"<pre>{System.Net.WebUtility.HtmlEncode(json)}</pre>", title);
        }
        catch
        {
            d.Html($"<pre>{System.Net.WebUtility.HtmlEncode(obj.ToString() ?? "")}</pre>", title);
        }
    }
}
