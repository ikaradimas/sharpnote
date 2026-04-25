using System.IO;
using System.Linq;
using System.Text.Json;
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
}
