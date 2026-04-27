using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using System.Web;

namespace SharpNoteKernel;

// ── GeoHelper ────────────────────────────────────────────────────────────────
// Geocoding, routing, IP lookup, country data, and map rendering — exposed as
// the `Geo` global. Uses free public APIs:
//   - Nominatim (OpenStreetMap)             — geocoding, no key
//   - OpenRouteService                       — routing, free key required
//   - ip-api.com                             — IP geolocation, no key
//   - REST Countries (restcountries.com)     — country metadata, no key
//
// The OpenRouteService key is read from Config["OpenRouteServiceKey"] first,
// then the OPENROUTESERVICE_KEY environment variable. If neither is set,
// RouteAsync throws with a link to the free signup page.

public record GeoResult(double Lat, double Lon, string DisplayName,
                        string? Country = null, string? CountryCode = null);

public record IpLocation(string Ip, double Lat, double Lon, string Country,
                         string CountryCode, string Region, string City,
                         string Isp);

public record RouteResult(GeoResult From, GeoResult To, double DistanceKm,
                          double DurationMin,
                          IReadOnlyList<(double Lat, double Lon)> Polyline,
                          string Profile);

public record CountryInfo(string Name, string Cca2, string Cca3, long Population,
                          string? Capital, string Region, string? Subregion,
                          IReadOnlyList<string> Languages, double Lat, double Lon);

public record MapMarker(double Lat, double Lon, string? Label = null,
                        string? Color = null);

public record HeatPoint(double Lat, double Lon, double Intensity = 1.0);

public class GeoHelper
{
    private readonly TextWriter _out;
    private readonly HttpClient _http;
    private readonly GeoCache  _cache;

    private static readonly HttpClient _defaultHttp  = CreateHttpClient();
    private static readonly GeoCache   _defaultCache = new();

    private static HttpClient CreateHttpClient()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("SharpNote/2.10 (https://github.com/ikaradimas/sharpnote)");
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return http;
    }

    public GeoHelper(TextWriter output, HttpClient? http = null, GeoCache? cache = null)
    {
        _out   = output;
        _http  = http  ?? _defaultHttp;
        _cache = cache ?? _defaultCache;
    }

    /// <summary>Clears the on-disk geocoding cache.</summary>
    public void ClearCache() => _cache.Clear();

    // ── Geocoding ────────────────────────────────────────────────────────────

    /// <summary>Resolves a free-form query (e.g. "Athens, Greece" or "1600 Pennsylvania Ave")
    /// to lat/lon via OpenStreetMap Nominatim.</summary>
    public async Task<GeoResult> GeocodeAsync(string query, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query))
            throw new ArgumentException("Query is required.", nameof(query));

        var key = GeoCache.ForwardKey(query);
        if (_cache.TryGet(key, out var cached)) return cached;

        var url = $"https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q={HttpUtility.UrlEncode(query)}";
        using var resp = await _http.GetAsync(url, ct);
        resp.EnsureSuccessStatusCode();
        var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        if (doc.RootElement.GetArrayLength() == 0)
            throw new InvalidOperationException($"No geocoding result for '{query}'.");

        var result = ParseGeoResult(doc.RootElement[0]);
        _cache.Set(key, result);
        return result;
    }

    /// <summary>Resolves a lat/lon to an address via OpenStreetMap Nominatim.</summary>
    public async Task<GeoResult> ReverseGeocodeAsync(double lat, double lon,
                                                     CancellationToken ct = default)
    {
        var key = GeoCache.ReverseKey(lat, lon);
        if (_cache.TryGet(key, out var cached)) return cached;

        var url = $"https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={F(lat)}&lon={F(lon)}&addressdetails=1";
        using var resp = await _http.GetAsync(url, ct);
        resp.EnsureSuccessStatusCode();
        var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var result = ParseGeoResult(doc.RootElement);
        _cache.Set(key, result);
        return result;
    }

    internal static GeoResult ParseGeoResult(JsonElement el)
    {
        double lat = double.Parse(el.GetProperty("lat").GetString()!, CultureInfo.InvariantCulture);
        double lon = double.Parse(el.GetProperty("lon").GetString()!, CultureInfo.InvariantCulture);
        string display = el.GetProperty("display_name").GetString() ?? "";
        string? country = null, code = null;
        if (el.TryGetProperty("address", out var addr))
        {
            if (addr.TryGetProperty("country", out var c)) country = c.GetString();
            if (addr.TryGetProperty("country_code", out var cc)) code = cc.GetString()?.ToUpperInvariant();
        }
        return new GeoResult(lat, lon, display, country, code);
    }

    // ── Routing ──────────────────────────────────────────────────────────────

    /// <summary>Routes from <paramref name="from"/> to <paramref name="to"/> via
    /// OpenRouteService. Profiles: driving-car, foot-walking, cycling-regular, etc.</summary>
    public async Task<RouteResult> RouteAsync(GeoResult from, GeoResult to,
                                              string profile = "driving-car",
                                              CancellationToken ct = default)
    {
        var key = ConfigContext.Current.Get("OpenRouteServiceKey");
        if (string.IsNullOrEmpty(key))
            key = Environment.GetEnvironmentVariable("OPENROUTESERVICE_KEY") ?? "";
        if (string.IsNullOrEmpty(key))
            throw new InvalidOperationException(
                "Geo.RouteAsync requires a free OpenRouteService API key. " +
                "Sign up at https://openrouteservice.org/sign-up, then either: " +
                "Config.Set(\"OpenRouteServiceKey\", \"...\") or set the " +
                "OPENROUTESERVICE_KEY environment variable.");

        var url = $"https://api.openrouteservice.org/v2/directions/{Uri.EscapeDataString(profile)}/geojson";
        var body = JsonSerializer.Serialize(new
        {
            coordinates = new[]
            {
                new[] { from.Lon, from.Lat },
                new[] { to.Lon,   to.Lat   },
            }
        });
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json"),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue(key);

        using var resp = await _http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode)
        {
            var msg = await resp.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException($"OpenRouteService returned {(int)resp.StatusCode}: {msg}");
        }
        var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        return ParseRoute(doc.RootElement, from, to, profile);
    }

    internal static RouteResult ParseRoute(JsonElement root, GeoResult from, GeoResult to, string profile)
    {
        var feature = root.GetProperty("features")[0];
        var coords = feature.GetProperty("geometry").GetProperty("coordinates");
        var summary = feature.GetProperty("properties").GetProperty("summary");
        double distM = summary.GetProperty("distance").GetDouble();
        double durS  = summary.GetProperty("duration").GetDouble();

        var polyline = new List<(double, double)>(coords.GetArrayLength());
        foreach (var pt in coords.EnumerateArray())
        {
            double lon = pt[0].GetDouble();
            double lat = pt[1].GetDouble();
            polyline.Add((lat, lon));
        }
        return new RouteResult(from, to, distM / 1000.0, durS / 60.0, polyline, profile);
    }

    // ── IP geolocation ───────────────────────────────────────────────────────

    /// <summary>Resolves an IPv4/IPv6 address (or the caller's IP if null) to a location.</summary>
    public async Task<IpLocation> IpLookupAsync(string? ip = null, CancellationToken ct = default)
    {
        var url = "http://ip-api.com/json/" + (ip ?? "");
        using var resp = await _http.GetAsync(url, ct);
        resp.EnsureSuccessStatusCode();
        var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var root = doc.RootElement;

        if (root.TryGetProperty("status", out var s) && s.GetString() != "success")
        {
            string msg = root.TryGetProperty("message", out var m) ? m.GetString() ?? "unknown error" : "unknown error";
            throw new InvalidOperationException($"ip-api lookup failed: {msg}");
        }

        return new IpLocation(
            Ip:          GetStr(root, "query") ?? ip ?? "",
            Lat:         root.GetProperty("lat").GetDouble(),
            Lon:         root.GetProperty("lon").GetDouble(),
            Country:     GetStr(root, "country") ?? "",
            CountryCode: GetStr(root, "countryCode") ?? "",
            Region:      GetStr(root, "regionName") ?? "",
            City:        GetStr(root, "city") ?? "",
            Isp:         GetStr(root, "isp") ?? "");
    }

    // ── Country lookup ───────────────────────────────────────────────────────

    /// <summary>Returns metadata for a country by ISO code (cca2/cca3) or common name.</summary>
    public async Task<CountryInfo> CountryAsync(string codeOrName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(codeOrName))
            throw new ArgumentException("Code or name is required.", nameof(codeOrName));

        // Try ISO code first if input looks like one (2 or 3 letters).
        bool looksLikeCode = codeOrName.Length <= 3 && codeOrName.All(char.IsLetter);
        const string fields = "name,cca2,cca3,population,capital,region,subregion,languages,latlng";
        var url = looksLikeCode
            ? $"https://restcountries.com/v3.1/alpha/{Uri.EscapeDataString(codeOrName)}?fields={fields}"
            : $"https://restcountries.com/v3.1/name/{Uri.EscapeDataString(codeOrName)}?fullText=false&fields={fields}";

        using var resp = await _http.GetAsync(url, ct);
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException($"No country found for '{codeOrName}'.");
        var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        var first = doc.RootElement[0];
        var name  = first.GetProperty("name").GetProperty("common").GetString() ?? "";
        var cca2  = GetStr(first, "cca2") ?? "";
        var cca3  = GetStr(first, "cca3") ?? "";
        long pop  = first.TryGetProperty("population", out var p) ? p.GetInt64() : 0;
        string? capital = null;
        if (first.TryGetProperty("capital", out var cap) && cap.ValueKind == JsonValueKind.Array && cap.GetArrayLength() > 0)
            capital = cap[0].GetString();
        var region = GetStr(first, "region") ?? "";
        var subregion = GetStr(first, "subregion");

        var languages = new List<string>();
        if (first.TryGetProperty("languages", out var langs) && langs.ValueKind == JsonValueKind.Object)
            foreach (var prop in langs.EnumerateObject())
                if (prop.Value.GetString() is { } lang) languages.Add(lang);

        double lat = 0, lon = 0;
        if (first.TryGetProperty("latlng", out var ll) && ll.GetArrayLength() >= 2)
        {
            lat = ll[0].GetDouble();
            lon = ll[1].GetDouble();
        }

        return new CountryInfo(name, cca2, cca3, pop, capital, region, subregion, languages, lat, lon);
    }

    // ── Map rendering ────────────────────────────────────────────────────────

    /// <summary>Renders an interactive Leaflet map. Pass any combination of markers,
    /// route, and heat points; optionally override center/zoom.</summary>
    public void Map(double lat, double lon, int zoom = 10,
                    IEnumerable<MapMarker>? markers = null,
                    RouteResult? route = null,
                    IEnumerable<HeatPoint>? heat = null,
                    bool cluster = false,
                    int? width = null, int? height = null,
                    string? title = null)
    {
        SendMap(BuildSpec(lat, lon, zoom, markers, route, heat, cluster, width, height), title);
    }

    /// <summary>Renders a heat map. Center is auto-computed from points if not given.</summary>
    public void HeatMap(IEnumerable<HeatPoint> points,
                        double? centerLat = null, double? centerLon = null, int zoom = 4,
                        int? width = null, int? height = null, string? title = null)
    {
        var list = points.ToList();
        if (list.Count == 0) throw new ArgumentException("At least one heat point is required.", nameof(points));
        double cLat = centerLat ?? list.Average(p => p.Lat);
        double cLon = centerLon ?? list.Average(p => p.Lon);
        Map(cLat, cLon, zoom, heat: list, width: width, height: height, title: title);
    }

    internal object BuildSpec(double lat, double lon, int zoom,
                             IEnumerable<MapMarker>? markers,
                             RouteResult? route,
                             IEnumerable<HeatPoint>? heat,
                             bool cluster,
                             int? width, int? height)
    {
        return new
        {
            center = new[] { lat, lon },
            cluster,
            zoom,
            width,
            height,
            markers = markers?.Select(m => new { lat = m.Lat, lon = m.Lon, label = m.Label, color = m.Color }).ToArray(),
            route   = route == null ? null : new
            {
                polyline    = route.Polyline.Select(p => new[] { p.Lat, p.Lon }).ToArray(),
                distanceKm  = route.DistanceKm,
                durationMin = route.DurationMin,
                profile     = route.Profile,
            },
            heat = heat?.Select(h => new[] { h.Lat, h.Lon, h.Intensity }).ToArray(),
        };
    }

    private void SendMap(object spec, string? title)
    {
        _out.WriteLine(JsonSerializer.Serialize(new
        {
            type    = "display",
            id      = Program.CurrentCellId,
            format  = "map",
            content = spec,
            title,
        }));
    }

    // ── Pure helpers ─────────────────────────────────────────────────────────

    /// <summary>Great-circle distance between two lat/lon points in kilometres (Haversine).</summary>
    public static double Distance(double latA, double lonA, double latB, double lonB)
    {
        const double R = 6371.0088; // mean Earth radius (km)
        double dLat = (latB - latA) * Math.PI / 180.0;
        double dLon = (lonB - lonA) * Math.PI / 180.0;
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                 + Math.Cos(latA * Math.PI / 180.0) * Math.Cos(latB * Math.PI / 180.0)
                 * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }

    /// <summary>Distance between two GeoResult / IpLocation-style points in kilometres.</summary>
    public static double Distance(GeoResult a, GeoResult b) => Distance(a.Lat, a.Lon, b.Lat, b.Lon);

    /// <summary>
    /// Single-link distance clustering — groups points where any member is within
    /// <paramref name="kmRadius"/> of any other member of the same cluster.
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<T>> Cluster<T>(
        IEnumerable<T> points, double kmRadius, Func<T, (double lat, double lon)> key)
    {
        var arr = points.ToArray();
        var clusterIdx = new int[arr.Length];
        for (int i = 0; i < arr.Length; i++) clusterIdx[i] = i;

        int Find(int i) { while (clusterIdx[i] != i) { clusterIdx[i] = clusterIdx[clusterIdx[i]]; i = clusterIdx[i]; } return i; }
        void Union(int a, int b) { var ra = Find(a); var rb = Find(b); if (ra != rb) clusterIdx[ra] = rb; }

        for (int i = 0; i < arr.Length; i++)
        {
            var (la, lo) = key(arr[i]);
            for (int j = i + 1; j < arr.Length; j++)
            {
                var (lb, mb) = key(arr[j]);
                if (Distance(la, lo, lb, mb) <= kmRadius) Union(i, j);
            }
        }

        var groups = new Dictionary<int, List<T>>();
        for (int i = 0; i < arr.Length; i++)
        {
            var root = Find(i);
            if (!groups.TryGetValue(root, out var list)) groups[root] = list = new();
            list.Add(arr[i]);
        }
        return groups.Values.Cast<IReadOnlyList<T>>().ToArray();
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    private static string F(double d) => d.ToString("R", CultureInfo.InvariantCulture);

    private static string? GetStr(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
