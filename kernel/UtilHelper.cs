using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SharpNoteKernel;

// ── UtilHelper ────────────────────────────────────────────────────────────────
// LinqPAD-compatible utility methods exposed as the `Util` global.

public class UtilHelper
{
    private readonly TextWriter _out;

    // Cross-execution cache shared for the lifetime of the kernel process.
    // Cleared on kernel reset via ClearCacheStatic().
    private static readonly Dictionary<string, object?> _cache = new();
    private static readonly object _cacheLock = new();

    // Pending confirm requests — keyed by requestId, resolved by ReceiveConfirmResponse.
    private static readonly ConcurrentDictionary<string, TaskCompletionSource<bool>>
        _pendingConfirms = new();

    // Cancellation token for the current execution — set by SetCancellationToken.
    private CancellationToken _currentToken = CancellationToken.None;

    internal UtilHelper(TextWriter output)
    {
        _out = output;
    }

    // ── Util.Cmd ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Runs a shell command and displays stdout/stderr as a preformatted text block.
    /// </summary>
    public void Cmd(string command, string? args = null, string? workingDir = null)
    {
        var psi = new ProcessStartInfo
        {
            FileName               = command,
            Arguments              = args ?? "",
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            WorkingDirectory       = workingDir ?? Directory.GetCurrentDirectory(),
        };

        using var proc = Process.Start(psi)!;
        var stdout = proc.StandardOutput.ReadToEnd();
        var stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();

        var sb = new StringBuilder();
        if (!string.IsNullOrEmpty(stdout)) sb.Append(stdout);
        if (!string.IsNullOrEmpty(stderr))
        {
            if (sb.Length > 0) sb.AppendLine();
            sb.Append(stderr);
        }

        _out.WriteLine(JsonSerializer.Serialize(new
        {
            type    = "display",
            id      = Program.CurrentCellId,
            format  = "html",
            content = $"<pre class=\"util-cmd-output\">{System.Net.WebUtility.HtmlEncode(sb.ToString())}</pre>",
        }));
    }

    // ── Util.Time ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Benchmarks an action and displays the elapsed time.
    /// </summary>
    public void Time(Action action, string? label = null)
    {
        var sw = Stopwatch.StartNew();
        action();
        sw.Stop();
        EmitTiming(label, sw.Elapsed, null);
    }

    /// <summary>
    /// Benchmarks a function, displays the elapsed time, and returns the result.
    /// </summary>
    public T Time<T>(Func<T> fn, string? label = null)
    {
        var sw = Stopwatch.StartNew();
        var result = fn();
        sw.Stop();
        EmitTiming(label, sw.Elapsed, result);
        return result;
    }

    private void EmitTiming(string? label, TimeSpan elapsed, object? result)
    {
        var ms    = elapsed.TotalMilliseconds;
        var time  = ms < 1000 ? $"{ms:F2} ms" : $"{elapsed.TotalSeconds:F3} s";
        var title = System.Net.WebUtility.HtmlEncode(label ?? "Elapsed");
        var html  = new StringBuilder();
        html.Append($"<div class=\"util-time\">⏱ <span class=\"util-time-label\">{title}</span>: <span class=\"util-time-value\">{time}</span></div>");

        if (result != null)
        {
            string resultHtml;
            try
            {
                var json = JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true });
                resultHtml = $"<pre>{System.Net.WebUtility.HtmlEncode(json)}</pre>";
            }
            catch { resultHtml = $"<pre>{System.Net.WebUtility.HtmlEncode(result.ToString() ?? "")}</pre>"; }
            html.Append(resultHtml);
        }

        _out.WriteLine(JsonSerializer.Serialize(new
        {
            type    = "display",
            id      = Program.CurrentCellId,
            format  = "html",
            content = html.ToString(),
        }));
    }

    // ── Util.Dif ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Displays a line-by-line diff between two values' string representations.
    /// </summary>
    public void Dif(object? a, object? b, string? labelA = null, string? labelB = null)
    {
        var linesA = ObjectToString(a).Split('\n');
        var linesB = ObjectToString(b).Split('\n');
        var diff   = ComputeDiff(linesA, linesB);

        var sb = new StringBuilder();
        sb.Append("<div class=\"util-dif\">");

        if (labelA != null || labelB != null)
        {
            sb.Append("<div class=\"util-dif-header\">");
            sb.Append($"<span class=\"diff-del-label\">{System.Net.WebUtility.HtmlEncode(labelA ?? "a")}</span>");
            sb.Append(" <span class=\"util-dif-sep\">→</span> ");
            sb.Append($"<span class=\"diff-add-label\">{System.Net.WebUtility.HtmlEncode(labelB ?? "b")}</span>");
            sb.Append("</div>");
        }

        sb.Append("<pre class=\"util-dif-lines\">");
        foreach (var (kind, line) in diff)
        {
            var enc = System.Net.WebUtility.HtmlEncode(line);
            sb.Append(kind switch
            {
                DiffKind.Add => $"<span class=\"diff-add\">+ {enc}</span>\n",
                DiffKind.Del => $"<span class=\"diff-del\">- {enc}</span>\n",
                _            => $"<span class=\"diff-ctx\">  {enc}</span>\n",
            });
        }
        sb.Append("</pre></div>");

        _out.WriteLine(JsonSerializer.Serialize(new
        {
            type    = "display",
            id      = Program.CurrentCellId,
            format  = "html",
            content = sb.ToString(),
        }));
    }

    private static string ObjectToString(object? obj)
    {
        if (obj == null) return "null";
        if (obj is string s) return s;
        try { return JsonSerializer.Serialize(obj, new JsonSerializerOptions { WriteIndented = true }); }
        catch { return obj.ToString() ?? ""; }
    }

    private enum DiffKind { Context, Add, Del }

    private static List<(DiffKind, string)> ComputeDiff(string[] a, string[] b)
    {
        // Guard against very large inputs
        const int MaxLines = 1000;
        if (a.Length > MaxLines || b.Length > MaxLines)
            return new List<(DiffKind, string)>
            {
                (DiffKind.Context, $"(input too large to diff: {a.Length} × {b.Length} lines; limit is {MaxLines})"),
            };

        int m = a.Length, n = b.Length;
        var dp = new int[m + 1, n + 1];
        for (int i = 1; i <= m; i++)
            for (int j = 1; j <= n; j++)
                dp[i, j] = a[i - 1] == b[j - 1]
                    ? dp[i - 1, j - 1] + 1
                    : Math.Max(dp[i, j - 1], dp[i - 1, j]);

        // Backtrack iteratively (avoids stack overflow on large diffs)
        var ops = new Stack<(DiffKind, string)>();
        int ci = m, cj = n;
        while (ci > 0 || cj > 0)
        {
            if (ci > 0 && cj > 0 && a[ci - 1] == b[cj - 1])
            {
                ops.Push((DiffKind.Context, a[ci - 1]));
                ci--; cj--;
            }
            else if (cj > 0 && (ci == 0 || dp[ci, cj - 1] >= dp[ci - 1, cj]))
            {
                ops.Push((DiffKind.Add, b[cj - 1]));
                cj--;
            }
            else
            {
                ops.Push((DiffKind.Del, a[ci - 1]));
                ci--;
            }
        }

        return ops.ToList(); // Stack is LIFO; ToList() gives correct forward order
    }

    // ── Util.HorizontalRun ────────────────────────────────────────────────────

    /// <summary>
    /// Displays multiple objects side by side in a horizontal flex layout.
    /// <paramref name="separator"/> is a CSS gap value such as <c>"12px"</c>.
    /// </summary>
    public void HorizontalRun(string separator, params object?[] items)
    {
        var children = new List<object?>();
        foreach (var item in items)
        {
            var buf = new StringBuilder();
            using var sw  = new StringWriter(buf);
            var cap       = new DisplayHelper(sw);
            SharpNoteExtensions.AutoDisplay(cap, item);
            sw.Flush();

            foreach (var line in buf.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    var el = JsonSerializer.Deserialize<JsonElement>(line);
                    if (el.TryGetProperty("type", out var typeEl) && typeEl.GetString() == "display"
                        && el.TryGetProperty("format", out var fmtEl)
                        && el.TryGetProperty("content", out var contentEl))
                    {
                        children.Add(new { format = fmtEl.GetString(), content = contentEl });
                    }
                }
                catch { }
            }
        }

        _out.WriteLine(JsonSerializer.Serialize(new
        {
            type      = "display",
            id        = Program.CurrentCellId,
            format    = "horizontal",
            content   = children,
            separator,
        }));
    }

    // ── Util.Metatext ─────────────────────────────────────────────────────────

    /// <summary>Displays dimmed/gray metadata text.</summary>
    public void Metatext(string text)
    {
        _out.WriteLine(JsonSerializer.Serialize(new
        {
            type    = "display",
            id      = Program.CurrentCellId,
            format  = "html",
            content = $"<div class=\"util-metatext\">{System.Net.WebUtility.HtmlEncode(text)}</div>",
        }));
    }

    // ── Util.Highlight ────────────────────────────────────────────────────────

    /// <summary>
    /// Displays an object inside a colored highlight box.
    /// <paramref name="color"/> is any CSS color value (default: amber).
    /// </summary>
    public void Highlight(object? obj, string color = "#ffe066")
    {
        // Capture the inner display output of the object
        var buf = new StringBuilder();
        using var sw  = new StringWriter(buf);
        var cap       = new DisplayHelper(sw);
        SharpNoteExtensions.AutoDisplay(cap, obj);
        sw.Flush();

        string innerHtml = "";
        foreach (var line in buf.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var el = JsonSerializer.Deserialize<JsonElement>(line);
                if (el.TryGetProperty("format", out var f) && f.GetString() == "html"
                    && el.TryGetProperty("content", out var c))
                {
                    innerHtml = c.GetString() ?? "";
                    break;
                }
            }
            catch { }
        }

        if (string.IsNullOrEmpty(innerHtml))
            innerHtml = $"<pre>{System.Net.WebUtility.HtmlEncode(obj?.ToString() ?? "null")}</pre>";

        // Colored left-border highlight box (avoids color-mix() browser compatibility issues)
        _out.WriteLine(JsonSerializer.Serialize(new
        {
            type    = "display",
            id      = Program.CurrentCellId,
            format  = "html",
            content = $"<div class=\"util-highlight\" style=\"border-left-color:{color}\">{innerHtml}</div>",
        }));
    }

    // ── Util.ConfirmAsync ─────────────────────────────────────────────────────

    /// <summary>Sets the cancellation token for the current execution (called by ExecuteHandler).</summary>
    internal void SetCancellationToken(CancellationToken ct) => _currentToken = ct;

    /// <summary>
    /// Displays an OK / Cancel dialog in the cell output and asynchronously waits
    /// for the user to respond. Returns <c>true</c> if OK was clicked, <c>false</c>
    /// if Cancel was clicked or execution is interrupted.
    /// </summary>
    public async Task<bool> ConfirmAsync(string message, string? title = null)
    {
        var requestId = Guid.NewGuid().ToString("N");
        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pendingConfirms[requestId] = tcs;

        _out.WriteLine(JsonSerializer.Serialize(new
        {
            type    = "display",
            id      = Program.CurrentCellId,
            format  = "confirm",
            content = new { requestId, message, title },
        }));

        try
        {
            return await tcs.Task.WaitAsync(_currentToken);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
        finally
        {
            _pendingConfirms.TryRemove(requestId, out _);
        }
    }

    /// <summary>Called by the background stdin reader when a confirm_response arrives.</summary>
    internal void ReceiveConfirmResponse(string requestId, bool confirmed)
    {
        if (_pendingConfirms.TryGetValue(requestId, out var tcs))
            tcs.TrySetResult(confirmed);
    }

    // ── Util.Cache ────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the cached value for <paramref name="key"/> if available;
    /// otherwise calls <paramref name="getValue"/>, stores the result, and returns it.
    /// The cache persists until the kernel is reset.
    /// </summary>
    public T Cache<T>(string key, Func<T> getValue)
    {
        lock (_cacheLock)
        {
            if (_cache.TryGetValue(key, out var cached))
                return (T)cached!;
            var value = getValue();
            _cache[key] = value;
            return value;
        }
    }

    /// <summary>Removes all entries from the cross-execution cache.</summary>
    public void ClearCache()
    {
        lock (_cacheLock) { _cache.Clear(); }
    }

    /// <summary>Called by ResetHandler to clear the cache on kernel reset.</summary>
    internal static void ClearCacheStatic()
    {
        lock (_cacheLock) { _cache.Clear(); }
    }
}
