using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using SharpNoteKernel;

namespace SharpNoteKernel;

partial class Program
{
    private static readonly Regex PlaceholderPattern = new(@"\{\{(\w+)\}\}", RegexOptions.Compiled);
    private static readonly HashSet<string> ValidHttpMethods = new(StringComparer.OrdinalIgnoreCase)
        { "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS" };

    /// <summary>
    /// Persistent cookie jar shared across all HTTP cell executions within
    /// the same kernel session. Cookies received from servers are automatically
    /// stored and sent with subsequent requests.
    /// </summary>
    internal static readonly System.Net.CookieContainer HttpCookieJar = new();

    internal static async Task HandleExecuteHttp(
        JsonElement msg,
        ScriptOptions options,
        ScriptGlobals globals,
        TextWriter realStdout)
    {
        var cellId  = msg.TryGetProperty("id",      out var cid) ? cid.GetString() : null;
        var content = msg.TryGetProperty("content",  out var cp)  ? cp.GetString()  : "";

        // ── Apply notebook config ─────────────────────────────────────────────
        var configDict = new Dictionary<string, string>();
        if (msg.TryGetProperty("config", out var cfgProp))
            foreach (var entry in cfgProp.EnumerateObject())
                configDict[entry.Name] = entry.Value.GetString() ?? "";
        ConfigContext.Current = new ConfigHelper(configDict, realStdout);

        CurrentCellId = cellId;
        globals.Display.SetCellId(cellId ?? "");
        DisplayContext.Current = globals.Display;

        try
        {
            // ── Parse .http format ────────────────────────────────────────────
            var lines = (content ?? "").Split('\n');
            var method = "GET";
            var url = "";
            var headers = new Dictionary<string, string>();
            string? body = null;

            int lineIdx = 0;

            // Line 1: METHOD URL
            if (lines.Length > 0)
            {
                var firstLine = lines[0].Trim();
                var spaceIdx = firstLine.IndexOf(' ');
                if (spaceIdx > 0)
                {
                    var maybeMethod = firstLine[..spaceIdx].ToUpperInvariant();
                    if (ValidHttpMethods.Contains(maybeMethod))
                    {
                        method = maybeMethod;
                        url = firstLine[(spaceIdx + 1)..].Trim();
                    }
                    else
                    {
                        url = firstLine; // Treat entire line as URL, default GET
                    }
                }
                else
                {
                    url = firstLine;
                }
                lineIdx = 1;
            }

            // Headers: until blank line
            for (; lineIdx < lines.Length; lineIdx++)
            {
                var line = lines[lineIdx].TrimEnd('\r');
                if (string.IsNullOrWhiteSpace(line)) { lineIdx++; break; }
                var colonIdx = line.IndexOf(':');
                if (colonIdx > 0)
                    headers[line[..colonIdx].Trim()] = line[(colonIdx + 1)..].Trim();
            }

            // Body: everything after blank line
            if (lineIdx < lines.Length)
                body = string.Join("\n", lines.Skip(lineIdx));

            // ── Substitute {{key}} from Config, then from script state ────────
            url  = await SubstitutePlaceholdersAsync(url, configDict, options, globals);
            body = body != null ? await SubstitutePlaceholdersAsync(body, configDict, options, globals) : null;
            var resolvedHeaders = new Dictionary<string, string>();
            foreach (var (k, v) in headers)
                resolvedHeaders[k] = await SubstitutePlaceholdersAsync(v, configDict, options, globals);

            // ── Generate C# code to execute the request ───────────────────────
            var escapedUrl    = url.Replace("\"", "\\\"");
            var escapedMethod = method;
            var escapedBody   = body?.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "");

            var sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine("    var __http_handler__ = new System.Net.Http.HttpClientHandler();");
            sb.AppendLine("    __http_handler__.CookieContainer = SharpNoteKernel.Program.HttpCookieJar;");
            sb.AppendLine("    __http_handler__.UseCookies = true;");
            sb.AppendLine("    var __http_client__ = new System.Net.Http.HttpClient(__http_handler__);");
            sb.AppendLine($"    __http_client__.Timeout = TimeSpan.FromSeconds(30);");

            foreach (var (k, v) in resolvedHeaders)
            {
                var ek = k.Replace("\"", "\\\"");
                var ev = v.Replace("\"", "\\\"");
                // Content-Type is set on the content, not the request headers
                if (!k.Equals("Content-Type", StringComparison.OrdinalIgnoreCase))
                    sb.AppendLine($"    __http_client__.DefaultRequestHeaders.TryAddWithoutValidation(\"{ek}\", \"{ev}\");");
            }

            sb.AppendLine($"    var __http_req__ = new System.Net.Http.HttpRequestMessage(new System.Net.Http.HttpMethod(\"{escapedMethod}\"), \"{escapedUrl}\");");

            if (escapedBody != null && method != "GET" && method != "HEAD")
            {
                var contentType = resolvedHeaders.TryGetValue("Content-Type", out var ct)
                    ? ct : "application/json";
                var ect = contentType.Replace("\"", "\\\"");
                sb.AppendLine($"    __http_req__.Content = new System.Net.Http.StringContent(\"{escapedBody}\", Encoding.UTF8, \"{ect}\");");
            }

            sb.AppendLine("    var __http_sw__ = System.Diagnostics.Stopwatch.StartNew();");
            sb.AppendLine("    var __http_resp__ = await __http_client__.SendAsync(__http_req__);");
            sb.AppendLine("    __http_sw__.Stop();");
            sb.AppendLine("    var __http_body__ = await __http_resp__.Content.ReadAsStringAsync();");

            // Display response as styled HTML
            sb.AppendLine(@"
    var __http_status_color__ = (int)__http_resp__.StatusCode < 400 ? ""#4ec9b0"" : ""#f44747"";
    var __http_sb__ = new StringBuilder();
    __http_sb__.Append($""<div style='font-family:var(--font-code,monospace);font-size:12px'>"");
    __http_sb__.Append($""<div style='margin-bottom:6px'><span style='font-weight:600;color:{__http_status_color__}'>{(int)__http_resp__.StatusCode} {__http_resp__.ReasonPhrase}</span>"");
    __http_sb__.Append($"" <span style='color:#5a7080;margin-left:8px'>{__http_sw__.ElapsedMilliseconds}ms</span></div>"");

    // Response headers (collapsed by default — shown as details)
    __http_sb__.Append(""<details style='margin-bottom:6px'><summary style='color:#5a7080;font-size:11px;cursor:pointer'>Response Headers</summary>"");
    __http_sb__.Append(""<div style='padding:4px 0;font-size:11px;color:#6a8898'>"");
    foreach (var __h__ in __http_resp__.Headers.Concat(__http_resp__.Content.Headers))
        __http_sb__.Append($""{System.Net.WebUtility.HtmlEncode(__h__.Key)}: {System.Net.WebUtility.HtmlEncode(string.Join("", "", __h__.Value))}<br>"");
    __http_sb__.Append(""</div></details>"");

    // Body — try to pretty-print JSON
    var __http_display_body__ = __http_body__;
    try {
        var __json_doc__ = System.Text.Json.JsonDocument.Parse(__http_body__);
        __http_display_body__ = System.Text.Json.JsonSerializer.Serialize(__json_doc__, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
    } catch { }
    __http_sb__.Append($""<pre style='margin:0;white-space:pre-wrap;color:#cdd6e0;max-height:400px;overflow:auto'>{System.Net.WebUtility.HtmlEncode(__http_display_body__)}</pre>"");
    __http_sb__.Append(""</div>"");
    Display.Html(__http_sb__.ToString());
");
            // Capture elapsed time for the complete message
            sb.AppendLine("    __http_timing_ms__ = __http_sw__.ElapsedMilliseconds;");
            sb.AppendLine("    __http_status_code__ = (int)__http_resp__.StatusCode;");
            sb.AppendLine("}");

            var code = sb.ToString();

            // Declare timing variables before the block so they survive scope
            var preamble = "long __http_timing_ms__ = 0; int __http_status_code__ = 0;\n";
            var fullCode = preamble + code;
            var opts = options;
            if (script == null)
                script = await CSharpScript.RunAsync<object?>(fullCode, opts, globals, typeof(ScriptGlobals));
            else
                script = await script.ContinueWithAsync<object?>(fullCode, opts);

            // Extract timing from script state
            long durationMs = 0;
            int statusCode = 0;
            try
            {
                var timingVar = script.GetVariable("__http_timing_ms__");
                if (timingVar?.Value is long tl) durationMs = tl;
                var statusVar = script.GetVariable("__http_status_code__");
                if (statusVar?.Value is int si) statusCode = si;
            }
            catch { /* variable not found — leave defaults */ }

            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = true, durationMs, statusCode }));
        }
        catch (Exception ex)
        {
            var inner = ex is AggregateException agg ? agg.InnerException ?? ex : ex;
            realStdout.WriteLine(JsonSerializer.Serialize(new
            {
                type       = "error",
                id         = cellId,
                message    = inner.Message,
                stackTrace = inner.StackTrace,
            }));
            realStdout.WriteLine(JsonSerializer.Serialize(new { type = "complete", id = cellId, success = false }));
        }
        finally
        {
            CurrentCellId = null;
            DisplayContext.Current = null;
        }
    }

    /// <summary>
    /// Substitutes {{key}} placeholders: first from Config, then by evaluating
    /// remaining placeholders as C# expressions against the current script state.
    /// </summary>
    private static async Task<string> SubstitutePlaceholdersAsync(
        string input,
        Dictionary<string, string> config,
        ScriptOptions options,
        ScriptGlobals globals)
    {
        if (string.IsNullOrEmpty(input) || !input.Contains("{{")) return input;

        var result = PlaceholderPattern.Replace(input, m =>
        {
            var key = m.Groups[1].Value;
            return config.TryGetValue(key, out var val) ? val : m.Value; // Leave unmatched for script eval
        });

        // Evaluate remaining {{expr}} via script state
        var remaining = PlaceholderPattern.Matches(result);
        if (remaining.Count == 0) return result;

        foreach (Match m in remaining)
        {
            var expr = m.Groups[1].Value;
            try
            {
                object? val;
                if (script != null)
                    val = (await script.ContinueWithAsync<object?>(expr, options)).ReturnValue;
                else
                    val = (await CSharpScript.RunAsync<object?>(expr, options, globals, typeof(ScriptGlobals))).ReturnValue;

                if (val != null)
                    result = result.Replace(m.Value, val.ToString() ?? "");
            }
            catch
            {
                // Leave placeholder as-is if evaluation fails
            }
        }

        return result;
    }
}
