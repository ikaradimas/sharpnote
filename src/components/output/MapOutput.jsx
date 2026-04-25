import React, { useEffect, useRef } from 'react';

// Leaflet (and the leaflet.heat plugin) is loaded lazily on first render so
// that importing this component — or anything that transitively imports it
// like OutputBlock — does not pull ~3 MB of Leaflet sources into every test
// or notebook view that never shows a map.
let leafletLoader = null;
function loadLeaflet() {
  if (!leafletLoader) {
    leafletLoader = (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet.heat');
      return L;
    })();
  }
  return leafletLoader;
}

export function MapOutput({ spec }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
    layersRef.current = [];
  }, []);

  useEffect(() => {
    if (!containerRef.current || !spec) return;
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          center: spec.center || [0, 0],
          zoom: spec.zoom ?? 2,
          scrollWheelZoom: true,
        });
        // Carto dark basemap — free, no key, no Referer requirement (OSM's
        // tile.openstreetmap.org rejects file:// origin requests with a 403).
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap contributors © CARTO',
          subdomains: 'abcd',
          maxZoom: 20,
        }).addTo(mapRef.current);
      } else {
        mapRef.current.setView(spec.center || [0, 0], spec.zoom ?? 2);
      }

      layersRef.current.forEach((layer) => mapRef.current.removeLayer(layer));
      layersRef.current = [];

      const bounds = [];

      (spec.markers || []).forEach((m) => {
        const marker = L.circleMarker([m.lat, m.lon], {
          radius: 7,
          color: m.color || '#569cd6',
          fillColor: m.color || '#569cd6',
          fillOpacity: 0.85,
          weight: 2,
        }).addTo(mapRef.current);
        if (m.label) marker.bindPopup(escapeHtml(m.label));
        layersRef.current.push(marker);
        bounds.push([m.lat, m.lon]);
      });

      if (spec.route?.polyline?.length) {
        const line = L.polyline(spec.route.polyline, {
          color: '#4ec9b0',
          weight: 4,
          opacity: 0.85,
        }).addTo(mapRef.current);
        layersRef.current.push(line);
        const summary = `${spec.route.distanceKm.toFixed(1)} km · ${spec.route.durationMin.toFixed(0)} min · ${spec.route.profile}`;
        line.bindTooltip(summary, { sticky: true });
        spec.route.polyline.forEach((p) => bounds.push(p));
      }

      if (spec.heat?.length) {
        const heat = L.heatLayer(spec.heat, {
          radius: 25,
          blur: 18,
          maxZoom: 9,
        }).addTo(mapRef.current);
        layersRef.current.push(heat);
        spec.heat.forEach((p) => bounds.push([p[0], p[1]]));
      }

      if (bounds.length > 1 && !spec.zoom) {
        mapRef.current.fitBounds(bounds, { padding: [20, 20] });
      }

      setTimeout(() => mapRef.current?.invalidateSize(), 0);
    }).catch((e) => console.error('Leaflet failed to load:', e));

    return () => { cancelled = true; };
  }, [spec]);

  const width = spec?.width ? `${spec.width}px` : '100%';
  const height = spec?.height ? `${spec.height}px` : '320px';

  return (
    <div
      ref={containerRef}
      className="output-map"
      style={{ width, height }}
    />
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
