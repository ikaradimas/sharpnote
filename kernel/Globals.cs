using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using Microsoft.CodeAnalysis.Scripting;

namespace SharpNoteKernel;

// ── DisplayContext ────────────────────────────────────────────────────────────

public static class DisplayContext
{
    public static DisplayHelper? Current { get; internal set; }
}

// ── LogContext ────────────────────────────────────────────────────────────────

public static class LogContext
{
    internal static TextWriter? Output { get; set; }

    internal static void WriteNotebook(string message)
    {
        Output?.WriteLine(JsonSerializer.Serialize(new
        {
            type = "log",
            tag = "NOTEBOOK",
            message,
            timestamp = DateTime.UtcNow.ToString("O"),
        }));
    }
}

// ── ConfigHelper ──────────────────────────────────────────────────────────────

public class ConfigHelper
{
    private readonly Dictionary<string, string> _values;
    private readonly TextWriter _out;

    public ConfigHelper(IReadOnlyDictionary<string, string> values, TextWriter output)
    {
        _values = new Dictionary<string, string>(values);
        _out    = output;
    }

    /// <summary>Returns the value for <paramref name="key"/>, or an empty string if not set.</summary>
    public string this[string key] => _values.TryGetValue(key, out var v) ? v : "";

    /// <summary>Returns the value for <paramref name="key"/>, or <paramref name="defaultValue"/> if not set.</summary>
    public string Get(string key, string defaultValue = "") =>
        _values.TryGetValue(key, out var v) ? v : defaultValue;

    /// <summary>Returns the value parsed as an integer, or <paramref name="defaultValue"/> if missing or not a valid number.</summary>
    public int GetInt(string key, int defaultValue = 0) =>
        _values.TryGetValue(key, out var v) && int.TryParse(v, out var n) ? n : defaultValue;

    /// <summary>Returns the value parsed as a double, or <paramref name="defaultValue"/> if missing or not a valid number.</summary>
    public double GetDouble(string key, double defaultValue = 0.0) =>
        _values.TryGetValue(key, out var v) && double.TryParse(v, System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : defaultValue;

    /// <summary>Returns the value parsed as a boolean. Recognises "true"/"1"/"yes" (case-insensitive).</summary>
    public bool GetBool(string key, bool defaultValue = false) =>
        _values.TryGetValue(key, out var v)
            ? v.Equals("true", StringComparison.OrdinalIgnoreCase) || v == "1" || v.Equals("yes", StringComparison.OrdinalIgnoreCase)
            : defaultValue;

    /// <summary>Returns true if the key is present and non-empty.</summary>
    public bool Has(string key) => _values.ContainsKey(key) && !string.IsNullOrEmpty(_values[key]);

    /// <summary>All config entries as a read-only dictionary.</summary>
    public IReadOnlyDictionary<string, string> All => _values;

    /// <summary>
    /// Adds or updates <paramref name="key"/> in the Config panel and makes it
    /// immediately available via <c>Config[key]</c> in the current execution.
    /// </summary>
    public void Set(string key, string value)
    {
        _values[key] = value;
        _out.WriteLine(JsonSerializer.Serialize(new { type = "config_set", key, value }));
    }

    /// <summary>
    /// Removes <paramref name="key"/> from the Config panel. The change takes
    /// effect immediately — subsequent <c>Config[key]</c> calls return <c>""</c>.
    /// </summary>
    public void Remove(string key)
    {
        _values.Remove(key);
        _out.WriteLine(JsonSerializer.Serialize(new { type = "config_remove", key }));
    }

    public override string ToString() =>
        _values.Count == 0 ? "(empty)" : string.Join(", ", _values.Select(kv => $"{kv.Key}={kv.Value}"));
}

// ── ConfigContext ─────────────────────────────────────────────────────────────

public static class ConfigContext
{
    public static ConfigHelper Current { get; internal set; } =
        new ConfigHelper(new Dictionary<string, string>(), TextWriter.Null);
}

// ── UtilContext ───────────────────────────────────────────────────────────────

public static class UtilContext
{
    public static UtilHelper Current { get; internal set; } =
        new UtilHelper(TextWriter.Null);
}

// ── Script globals ────────────────────────────────────────────────────────────

public class ScriptGlobals
{
    public DisplayHelper Display { get; set; } = null!;
    public PanelsHelper  Panels  { get; set; } = null!;
    public DbHelper      Db      { get; set; } = null!;
    public ConfigHelper  Config  => ConfigContext.Current;
    public UtilHelper    Util    => UtilContext.Current;
    // Injected per-execution so loop-injection checks can cancel tight loops.
    // Named with underscores to discourage accidental use in user code.
    public CancellationToken __ct__ { get; set; }
}
