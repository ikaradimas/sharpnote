using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;

namespace SharpNoteKernel;

/// <summary>
/// File-backed cache for forward and reverse geocoding lookups. Successful
/// results are persisted to a JSON file in the user's local application data
/// directory so notebook reruns reuse them automatically — both for speed and
/// to respect Nominatim's 1 req/s usage policy.
///
/// Failures are not cached (an unreachable server today shouldn't cache a
/// negative result for the next month).
/// </summary>
public class GeoCache
{
    private readonly string _path;
    private readonly Dictionary<string, GeoResult> _entries;
    private readonly object _lock = new();

    public GeoCache(string? path = null)
    {
        _path = path ?? DefaultPath();
        _entries = Load(_path);
    }

    public bool TryGet(string key, out GeoResult result)
    {
        lock (_lock)
        {
            if (_entries.TryGetValue(key, out var r)) { result = r; return true; }
        }
        result = null!;
        return false;
    }

    public void Set(string key, GeoResult value)
    {
        lock (_lock)
        {
            _entries[key] = value;
            Save();
        }
    }

    public void Clear()
    {
        lock (_lock)
        {
            _entries.Clear();
            Save();
        }
    }

    public int Count { get { lock (_lock) return _entries.Count; } }
    public string Path => _path;

    public static string ForwardKey(string query)  => "fwd:" + query.Trim().ToLowerInvariant();
    public static string ReverseKey(double lat, double lon) =>
        string.Format(CultureInfo.InvariantCulture, "rev:{0:F4},{1:F4}", lat, lon);

    private static string DefaultPath() =>
        System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SharpNote", "geo-cache.json");

    private static Dictionary<string, GeoResult> Load(string path)
    {
        try
        {
            if (!File.Exists(path)) return new();
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<Dictionary<string, GeoResult>>(json) ?? new();
        }
        catch
        {
            // Corrupt cache files are non-fatal — start fresh.
            return new();
        }
    }

    private void Save()
    {
        try
        {
            var dir = System.IO.Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_entries));
            File.Move(tmp, _path, overwrite: true);
        }
        catch
        {
            // A failed cache write must never break the user's notebook.
        }
    }
}
