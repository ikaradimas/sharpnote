using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using SharpNoteKernel;
using Xunit;

namespace SharpNoteKernel.Tests;

public class GeoHelperTests
{
    // ── Nominatim geocoding parser ──────────────────────────────────────────

    [Fact]
    public void ParseGeoResult_ReadsLatLonAndCountryFromAddressBlock()
    {
        var json = """
        {
          "lat": "51.5073219",
          "lon": "-0.1276474",
          "display_name": "London, Greater London, England, United Kingdom",
          "address": { "country": "United Kingdom", "country_code": "gb" }
        }
        """;
        using var doc = JsonDocument.Parse(json);
        var r = GeoHelper.ParseGeoResult(doc.RootElement);

        r.Lat.Should().BeApproximately(51.5073219, 1e-6);
        r.Lon.Should().BeApproximately(-0.1276474, 1e-6);
        r.DisplayName.Should().StartWith("London");
        r.Country.Should().Be("United Kingdom");
        r.CountryCode.Should().Be("GB");
    }

    [Fact]
    public void ParseGeoResult_HandlesMissingAddressBlock()
    {
        var json = """{"lat":"40.0","lon":"-74.0","display_name":"Somewhere"}""";
        using var doc = JsonDocument.Parse(json);
        var r = GeoHelper.ParseGeoResult(doc.RootElement);
        r.Country.Should().BeNull();
        r.CountryCode.Should().BeNull();
    }

    // ── OpenRouteService route parser ───────────────────────────────────────

    [Fact]
    public void ParseRoute_DecodesGeoJsonGeometryAndSummary()
    {
        var json = """
        {
          "features": [{
            "geometry": { "type": "LineString",
                          "coordinates": [[-0.13,51.5],[-0.10,51.51],[-0.08,51.52]] },
            "properties": { "summary": { "distance": 4321.0, "duration": 540.0 } }
          }]
        }
        """;
        using var doc = JsonDocument.Parse(json);
        var from = new GeoResult(51.5, -0.13, "A");
        var to   = new GeoResult(51.52, -0.08, "B");
        var route = GeoHelper.ParseRoute(doc.RootElement, from, to, "driving-car");

        route.DistanceKm.Should().BeApproximately(4.321, 1e-4);
        route.DurationMin.Should().BeApproximately(9.0, 1e-4);
        route.Profile.Should().Be("driving-car");
        route.Polyline.Should().HaveCount(3);
        // Polyline must be in (lat, lon) order — GeoJSON gives [lon, lat]
        route.Polyline[0].Should().Be((51.5, -0.13));
        route.Polyline[2].Should().Be((51.52, -0.08));
    }

    // ── Map spec emission ────────────────────────────────────────────────────

    [Fact]
    public void Map_EmitsDisplayMessageWithMapFormat()
    {
        var sw = new StringWriter();
        var geo = new GeoHelper(sw);
        geo.Map(40.0, -74.0, zoom: 8,
                markers: new[] { new MapMarker(40.7, -74.0, "NYC", "#e0a040") });

        var line = sw.ToString().Trim();
        using var doc = JsonDocument.Parse(line);
        doc.RootElement.GetProperty("type").GetString().Should().Be("display");
        doc.RootElement.GetProperty("format").GetString().Should().Be("map");
        var content = doc.RootElement.GetProperty("content");
        content.GetProperty("center")[0].GetDouble().Should().Be(40.0);
        content.GetProperty("center")[1].GetDouble().Should().Be(-74.0);
        content.GetProperty("zoom").GetInt32().Should().Be(8);
        content.GetProperty("markers")[0].GetProperty("label").GetString().Should().Be("NYC");
    }

    [Fact]
    public void HeatMap_AutoCentersOnMeanOfPoints()
    {
        var sw = new StringWriter();
        var geo = new GeoHelper(sw);
        geo.HeatMap(new[]
        {
            new HeatPoint(0.0, 0.0, 1),
            new HeatPoint(10.0, 20.0, 2),
        });

        using var doc = JsonDocument.Parse(sw.ToString().Trim());
        var center = doc.RootElement.GetProperty("content").GetProperty("center");
        center[0].GetDouble().Should().BeApproximately(5.0, 1e-9);
        center[1].GetDouble().Should().BeApproximately(10.0, 1e-9);
        doc.RootElement.GetProperty("content").GetProperty("heat").GetArrayLength().Should().Be(2);
    }

    [Fact]
    public void HeatMap_ThrowsOnEmptyInput()
    {
        var geo = new GeoHelper(new StringWriter());
        var act = () => geo.HeatMap(System.Array.Empty<HeatPoint>());
        act.Should().Throw<System.ArgumentException>();
    }

    // ── Routing without key surfaces a useful error ─────────────────────────

    [Fact]
    public async System.Threading.Tasks.Task RouteAsync_ThrowsHelpfullyWhenNoKeyConfigured()
    {
        // Ensure neither config nor env var is set for this test.
        ConfigContext.Current = new ConfigHelper(new System.Collections.Generic.Dictionary<string, string>(), TextWriter.Null);
        var saved = System.Environment.GetEnvironmentVariable("OPENROUTESERVICE_KEY");
        System.Environment.SetEnvironmentVariable("OPENROUTESERVICE_KEY", null);
        try
        {
            var geo = new GeoHelper(new StringWriter());
            var act = () => geo.RouteAsync(new GeoResult(0, 0, "a"), new GeoResult(1, 1, "b"));
            (await act.Should().ThrowAsync<System.InvalidOperationException>())
                .Which.Message.Should().Contain("openrouteservice.org/sign-up");
        }
        finally
        {
            System.Environment.SetEnvironmentVariable("OPENROUTESERVICE_KEY", saved);
        }
    }

    // ── Distance & Cluster ──────────────────────────────────────────────────

    [Theory]
    [InlineData(52.5200, 13.4050, 48.1351, 11.5820,  504, 6)]   // Berlin → Munich
    [InlineData(40.7128, -74.0060, 34.0522, -118.2437, 3936, 8)] // NYC → LA
    [InlineData(51.5074, -0.1278, 51.5074, -0.1278,    0, 0.001)] // same point
    [InlineData(0, 0, 0, 180, 20015, 5)]                          // antipodal-ish
    public void Distance_MatchesKnownGreatCircle(double la, double lo, double lb, double mo,
                                                 double expectedKm, double tolerance)
    {
        GeoHelper.Distance(la, lo, lb, mo).Should().BeApproximately(expectedKm, tolerance);
    }

    [Fact]
    public void Cluster_GroupsNearbyPointsAndIsolatesFarOnes()
    {
        // 3 European cities (within 600 km of each other) + 1 in NYC (far from all)
        var pts = new[]
        {
            (lat: 52.52, lon: 13.41, name: "Berlin"),
            (lat: 48.86, lon:  2.35, name: "Paris"),
            (lat: 50.85, lon:  4.35, name: "Brussels"),
            (lat: 40.71, lon:-74.01, name: "NYC"),
        };
        var clusters = GeoHelper.Cluster(pts, 700, p => (p.lat, p.lon));

        clusters.Should().HaveCount(2);
        var european = clusters.Single(c => c.Count == 3);
        european.Select(p => p.name).Should().BeEquivalentTo(new[] { "Berlin", "Paris", "Brussels" });
        clusters.Should().ContainSingle(c => c.Count == 1 && c[0].name == "NYC");
    }

    [Fact]
    public void Cluster_HandlesEmptyAndSingleInputs()
    {
        GeoHelper.Cluster(System.Array.Empty<(double, double)>(), 100, p => p).Should().BeEmpty();
        var single = GeoHelper.Cluster(new[] { (1.0, 2.0) }, 100, p => p);
        single.Should().HaveCount(1);
        single[0].Should().HaveCount(1);
    }

    [Fact]
    public void Cluster_AllWithinRadius_CollapsesToOneGroup()
    {
        var pts = new[] { (52.5, 13.4), (52.6, 13.5), (52.4, 13.3) }; // ~15 km spread
        GeoHelper.Cluster(pts, 50, p => p).Should().HaveCount(1);
    }

    // ── GeoCache ────────────────────────────────────────────────────────────

    [Fact]
    public void GeoCache_RoundTripsAndPersistsAcrossInstances()
    {
        var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"geo-cache-{System.Guid.NewGuid():N}.json");
        try
        {
            var c1 = new GeoCache(path);
            c1.TryGet("fwd:london", out _).Should().BeFalse();
            c1.Set("fwd:london", new GeoResult(51.5, -0.1, "London", "United Kingdom", "GB"));

            var c2 = new GeoCache(path);
            c2.TryGet("fwd:london", out var hit).Should().BeTrue();
            hit.Lat.Should().Be(51.5);
            hit.CountryCode.Should().Be("GB");
        }
        finally { if (File.Exists(path)) File.Delete(path); }
    }

    [Fact]
    public async Task GeocodeAsync_SecondCallForSameQueryHitsCacheAndSkipsHttp()
    {
        var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"geo-cache-{System.Guid.NewGuid():N}.json");
        try
        {
            var cache = new GeoCache(path);
            var handler = new CountingHandler("""
                [{"lat":"51.5074","lon":"-0.1278","display_name":"London, UK",
                  "address":{"country":"United Kingdom","country_code":"gb"}}]
                """);
            using var http = new HttpClient(handler);
            var geo = new GeoHelper(new StringWriter(), http, cache);

            var first  = await geo.GeocodeAsync("London");
            var second = await geo.GeocodeAsync("London");

            handler.Calls.Should().Be(1);
            second.Lat.Should().Be(first.Lat);
            second.CountryCode.Should().Be("GB");
            cache.Count.Should().Be(1);
        }
        finally { if (File.Exists(path)) File.Delete(path); }
    }

    [Fact]
    public void GeoCache_KeysAreNormalised()
    {
        GeoCache.ForwardKey("  London  ").Should().Be("fwd:london");
        GeoCache.ForwardKey("LONDON").Should().Be(GeoCache.ForwardKey("london"));
        // Reverse keys round to 4 decimals so close lookups hit the same entry.
        GeoCache.ReverseKey(51.50745, -0.12780).Should().Be(GeoCache.ReverseKey(51.50742, -0.12784));
    }

    private sealed class CountingHandler : HttpMessageHandler
    {
        private readonly string _body;
        public int Calls;
        public CountingHandler(string body) => _body = body;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_body, System.Text.Encoding.UTF8, "application/json"),
            });
        }
    }
}
