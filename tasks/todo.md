# Geography support — plan

## Goal
Add a `Geo.*` kernel global with helpers for geocoding, routing, IP lookup,
country lookup, and map rendering (markers, routes, heat). Add geographic
example sections to the Infographic Dashboard template.

## Architecture
- **Kernel**: new `kernel/GeoHelper.cs`, exposed as `Geo` in `ScriptGlobals`.
  Calls free public APIs: Nominatim (geocoding), OpenRouteService (routing,
  needs free key), ip-api.com (IP geolocation, no key), REST Countries (no key).
- **Renderer**: new `src/components/output/MapOutput.jsx` that renders a
  Leaflet map from a spec object. New `format: "map"` dispatch in `OutputBlock`
  and `FormatContent`.
- **Tile source**: OpenStreetMap raster tiles (no key). Leaflet & Leaflet.heat
  bundled locally via npm — no CDN, so the existing CSP holds.
- **Routing key**: read from `Config.Get("OpenRouteServiceKey")` first,
  falls back to `OPENROUTESERVICE_KEY` env var. If neither is set, `Geo.Route`
  throws a clear error pointing at the free signup URL.

## Steps

### 1. Kernel — `kernel/GeoHelper.cs`
- [ ] `Task<GeoResult> GeocodeAsync(string query)` — Nominatim search
- [ ] `Task<GeoResult> ReverseGeocodeAsync(double lat, double lon)`
- [ ] `Task<RouteResult> RouteAsync(GeoResult from, GeoResult to, string profile = "driving-car")`
- [ ] `Task<IpLocation> IpLookupAsync(string? ip = null)`
- [ ] `Task<CountryInfo> CountryAsync(string codeOrName)`
- [ ] `void Map(double lat, double lon, int zoom = 10, IEnumerable<MapMarker>? markers = null, RouteResult? route = null, IEnumerable<HeatPoint>? heat = null, string? title = null)`
- [ ] `void HeatMap(IEnumerable<HeatPoint> points, ...)` — convenience over `Map`
- [ ] `void Route(GeoResult from, GeoResult to, ...)` — runs `RouteAsync` + emits map
- [ ] Static `HttpClient` with polite User-Agent for Nominatim

### 2. Wire-up
- [ ] `kernel/Program.cs` — instantiate `new GeoHelper(realStdout)`
- [ ] `kernel/Globals.cs` — add `public GeoHelper Geo` on `ScriptGlobals`

### 3. Renderer — `src/components/output/MapOutput.jsx`
- [ ] Spec: `{ center: [lat, lon], zoom, markers?, route?, heat?, width?, height? }`
- [ ] Init Leaflet in `useEffect`, tear down on unmount, OSM tile layer
- [ ] Plot markers (with optional label popups), polyline for route, heat layer

### 4. Dispatch
- [ ] `OutputBlock.jsx` + `FormatContent.jsx` — branch on `format === 'map'`

### 5. Dependencies
- [ ] `npm i leaflet leaflet.heat`
- [ ] Import Leaflet CSS in app entry (or bundle into `dist/styles.css`)

### 6. Tests
- [ ] `kernel.Tests/GeoHelperTests.cs` — parse-fixture tests for each API response,
      verify map-spec JSON shape, polyline decode
- [ ] `tests/renderer/MapOutput.test.jsx` — render with markers / route / heat;
      assert tile layer + element counts

### 7. Docs
- [ ] `src/config/docs-sections.js` — new "Geography" section
- [ ] `README.md` — Features list + Architecture table
- [ ] No menu.js change

### 8. Infographic template additions
Append three sections to `makeInfographicCells()`:
- [ ] **Sales by country** — `Geo.HeatMap` over a synthetic dataset of (city, sales)
- [ ] **Visitor origins** — `Geo.Map` with markers from a fake IP-lookup batch
- [ ] **HQ → branches** — `Geo.Route` from an HQ to N branch cities

### 9. Version + commit
- [ ] Bump `package.json` + `package-lock.json` to **2.7.0** (minor — new feature)
- [ ] Single commit containing kernel + renderer + tests + docs + template + version
