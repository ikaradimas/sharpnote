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
    private readonly IReadOnlyDictionary<string, string> _values;

    public ConfigHelper(IReadOnlyDictionary<string, string> values) => _values = values;

    /// <summary>Returns the value for <paramref name="key"/>, or an empty string if not set.</summary>
    public string this[string key] => _values.TryGetValue(key, out var v) ? v : "";

    /// <summary>Returns the value for <paramref name="key"/>, or <paramref name="defaultValue"/> if not set.</summary>
    public string Get(string key, string defaultValue = "") =>
        _values.TryGetValue(key, out var v) ? v : defaultValue;

    /// <summary>Returns true if the key is present and non-empty.</summary>
    public bool Has(string key) => _values.ContainsKey(key) && !string.IsNullOrEmpty(_values[key]);

    /// <summary>All config entries as a read-only dictionary.</summary>
    public IReadOnlyDictionary<string, string> All => _values;

    public override string ToString() =>
        _values.Count == 0 ? "(empty)" : string.Join(", ", _values.Select(kv => $"{kv.Key}={kv.Value}"));
}

// ── ConfigContext ─────────────────────────────────────────────────────────────

public static class ConfigContext
{
    public static ConfigHelper Current { get; internal set; } =
        new ConfigHelper(new Dictionary<string, string>());
}

// ── Script globals ────────────────────────────────────────────────────────────

public class ScriptGlobals
{
    public DisplayHelper Display { get; set; } = null!;
    public ConfigHelper Config => ConfigContext.Current;
    // Injected per-execution so loop-injection checks can cancel tight loops.
    // Named with underscores to discourage accidental use in user code.
    public CancellationToken __ct__ { get; set; }
}
