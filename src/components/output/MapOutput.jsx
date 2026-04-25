import React, { useEffect, useRef, useState, useCallback } from 'react';
import { escHtml } from '../../utils.js';

// Leaflet + plugins (heat, markercluster) are loaded lazily on first render
// so that importing this component — or anything that transitively imports it
// like OutputBlock — does not pull ~3 MB of Leaflet sources into every test
// or notebook view that never shows a map.
let leafletLoader = null;
function loadLeaflet() {
  if (!leafletLoader) {
    leafletLoader = (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet.heat');
      await import('leaflet.markercluster');
      return L;
    })();
  }
  return leafletLoader;
}

const TILE_URLS = {
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

const TILE_OPTS = {
  attribution: '© OpenStreetMap contributors © CARTO',
  subdomains:  'abcd',
  maxZoom:     20,
};

function makeTileLayer(L, theme) {
  return L.tileLayer(TILE_URLS[theme], TILE_OPTS);
}

export function MapOutput({ spec }) {
  const wrapperRef    = useRef(null);
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const tileLayerRef  = useRef(null);
  const layersRef     = useRef([]);
  const boundsRef     = useRef([]);
  const initialViewRef = useRef(null);

  const [theme,      setTheme]      = useState('dark');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
    tileLayerRef.current = null;
    layersRef.current = [];
    boundsRef.current = [];
  }, []);

  // Track native fullscreen state so the icon stays in sync if the user hits
  // Escape to exit instead of clicking the button.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !spec) return;
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        const initialCenter = spec.center || [0, 0];
        const initialZoom   = spec.zoom ?? 2;
        mapRef.current = L.map(containerRef.current, {
          center: initialCenter,
          zoom: initialZoom,
          scrollWheelZoom: true,
          zoomControl: true,
        });
        initialViewRef.current = { center: initialCenter, zoom: initialZoom };
        tileLayerRef.current = makeTileLayer(L, theme).addTo(mapRef.current);
      } else {
        mapRef.current.setView(spec.center || [0, 0], spec.zoom ?? 2);
      }

      layersRef.current.forEach((layer) => mapRef.current.removeLayer(layer));
      layersRef.current = [];

      const bounds = [];

      const markers = spec.markers || [];
      if (markers.length) {
        const group = spec.cluster
          ? L.markerClusterGroup({ chunkedLoading: true })
          : L.featureGroup();
        markers.forEach((m) => {
          const marker = L.circleMarker([m.lat, m.lon], {
            radius: 7,
            color: m.color || '#569cd6',
            fillColor: m.color || '#569cd6',
            fillOpacity: 0.85,
            weight: 2,
          });
          if (m.label) marker.bindPopup(escHtml(m.label));
          group.addLayer(marker);
          bounds.push([m.lat, m.lon]);
        });
        group.addTo(mapRef.current);
        layersRef.current.push(group);
      }

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
        // Tuned so points stay visible at world-level zoom (≤3) without being
        // overwhelming when zoomed in. leaflet.heat scales intensity by
        // current_zoom / maxZoom, so a low maxZoom keeps low-zoom views legible.
        const heat = L.heatLayer(spec.heat, {
          radius: spec.heatRadius  ?? 35,
          blur:   spec.heatBlur    ?? 25,
          maxZoom: spec.heatMaxZoom ?? 4,
          max:    spec.heatMax     ?? 1.0,
        }).addTo(mapRef.current);
        layersRef.current.push(heat);
        spec.heat.forEach((p) => bounds.push([p[0], p[1]]));
      }

      boundsRef.current = bounds;

      if (bounds.length > 1 && !spec.zoom) {
        mapRef.current.fitBounds(bounds, { padding: [20, 20] });
      }

      setTimeout(() => mapRef.current?.invalidateSize(), 0);
    }).catch((e) => console.error('Leaflet failed to load:', e));

    return () => { cancelled = true; };
  }, [spec]);

  // Theme switch — swap the tile layer in place without rebuilding the map.
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    loadLeaflet().then((L) => {
      if (!mapRef.current) return;
      mapRef.current.removeLayer(tileLayerRef.current);
      tileLayerRef.current = makeTileLayer(L, theme).addTo(mapRef.current);
    });
  }, [theme]);

  const onFit = useCallback(() => {
    if (!mapRef.current) return;
    const b = boundsRef.current;
    if (b.length >= 2) mapRef.current.fitBounds(b, { padding: [20, 20] });
    else if (b.length === 1) mapRef.current.setView(b[0], 12);
  }, []);

  const onReset = useCallback(() => {
    const v = initialViewRef.current;
    if (mapRef.current && v) mapRef.current.setView(v.center, v.zoom);
  }, []);

  const onToggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const onToggleFullscreen = useCallback(() => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      wrapperRef.current.requestFullscreen?.();
      setTimeout(() => mapRef.current?.invalidateSize(), 100);
    }
  }, []);

  const onExportPng = useCallback(async () => {
    if (!containerRef.current) return;
    const { default: domToImage } = await import('dom-to-image-more');
    const dataUrl = await domToImage.toPng(containerRef.current, { cacheBust: true });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'map.png';
    a.click();
  }, []);

  const width  = spec?.width  ? `${spec.width}px`  : '100%';
  const height = spec?.height ? `${spec.height}px` : '320px';

  return (
    <div ref={wrapperRef} className="output-map-wrapper" style={{ width, height }}>
      <div ref={containerRef} className="output-map" />
      <div className="output-map-toolbar">
        <button className="output-map-btn" onClick={onFit}              title="Fit all points">⊕</button>
        <button className="output-map-btn" onClick={onReset}            title="Reset to original view">↺</button>
        <button className="output-map-btn" onClick={onToggleTheme}      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? '☼' : '☾'}</button>
        <button className="output-map-btn" onClick={onExportPng}        title="Download as PNG">⬇</button>
        <button className="output-map-btn" onClick={onToggleFullscreen} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{fullscreen ? '⤡' : '⛶'}</button>
      </div>
    </div>
  );
}

