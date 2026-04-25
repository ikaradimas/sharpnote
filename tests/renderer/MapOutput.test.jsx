import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Track the live Leaflet map instance so each test can inspect what was added.
const mapState = vi.hoisted(() => ({
  added: [],          // top-level layers added to the map
  groupAdds: [],      // child layers added to feature/cluster groups
  current: null,
  setView: vi.fn(),
  fitBounds: vi.fn(),
  remove: vi.fn(),
  removeLayer: vi.fn(),
  invalidateSize: vi.fn(),
}));

const layerStub = (kind, opts) => ({
  __kind: kind,
  __opts: opts,
  addTo: vi.fn(function () { mapState.added.push(this); return this; }),
  bindPopup: vi.fn(function () { return this; }),
  bindTooltip: vi.fn(function () { return this; }),
  addLayer: vi.fn(function (l) { mapState.groupAdds.push({ kind, child: l }); return this; }),
});

vi.mock('leaflet', () => {
  const tileLayer = vi.fn(() => layerStub('tile'));
  const circleMarker = vi.fn((latlng, opts) => layerStub('marker', { latlng, ...opts }));
  const polyline = vi.fn((pts, opts) => layerStub('polyline', { points: pts, ...opts }));
  const heatLayer = vi.fn((pts, opts) => layerStub('heat', { points: pts, ...opts }));
  const featureGroup = vi.fn(() => layerStub('featureGroup'));
  const markerClusterGroup = vi.fn((opts) => layerStub('clusterGroup', opts));
  const map = vi.fn((_el, opts) => {
    mapState.current = {
      __opts: opts,
      setView: mapState.setView,
      fitBounds: mapState.fitBounds,
      remove: mapState.remove,
      removeLayer: mapState.removeLayer,
      invalidateSize: mapState.invalidateSize,
      addLayer: vi.fn(),
    };
    return mapState.current;
  });
  return {
    default: { map, tileLayer, circleMarker, polyline, heatLayer, featureGroup, markerClusterGroup },
    map, tileLayer, circleMarker, polyline, heatLayer, featureGroup, markerClusterGroup,
  };
});

vi.mock('leaflet.heat', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));

const domToImageMock = vi.hoisted(() => ({ toPng: vi.fn(() => Promise.resolve('data:image/png;base64,xxx')) }));
vi.mock('dom-to-image-more', () => ({ default: domToImageMock }));

import { MapOutput } from '../../src/components/output/MapOutput.jsx';
import L from 'leaflet';

describe('MapOutput', () => {
  beforeEach(() => {
    mapState.added = [];
    mapState.groupAdds = [];
    mapState.current = null;
    L.map.mockClear();
    L.tileLayer.mockClear();
    L.circleMarker.mockClear();
    L.polyline.mockClear();
    L.heatLayer.mockClear();
    L.featureGroup.mockClear();
    L.markerClusterGroup.mockClear();
    domToImageMock.toPng.mockClear();
    cleanup();
  });

  it('renders a container with the Carto tile layer at the requested center/zoom', async () => {
    render(<MapOutput spec={{ center: [40, -74], zoom: 5 }} />);

    await waitFor(() => expect(L.map).toHaveBeenCalledTimes(1));
    expect(L.map.mock.calls[0][1]).toMatchObject({ center: [40, -74], zoom: 5 });
    expect(L.tileLayer).toHaveBeenCalledWith(
      expect.stringContaining('cartocdn.com'),
      expect.any(Object),
    );
  });

  it('plots one circleMarker per spec.markers entry inside a featureGroup', async () => {
    render(<MapOutput spec={{
      center: [0, 0], zoom: 2,
      markers: [
        { lat: 51.5, lon: -0.1, label: 'London', color: '#569cd6' },
        { lat: 40.7, lon: -74.0, label: 'NYC',    color: '#e0a040' },
      ],
    }} />);

    await waitFor(() => expect(L.circleMarker).toHaveBeenCalledTimes(2));
    expect(L.featureGroup).toHaveBeenCalledTimes(1);
    expect(L.markerClusterGroup).not.toHaveBeenCalled();
    const childMarkers = mapState.groupAdds.filter((g) => g.kind === 'featureGroup');
    expect(childMarkers).toHaveLength(2);
    expect(childMarkers[0].child.bindPopup).toHaveBeenCalledWith('London');
    expect(childMarkers[1].child.bindPopup).toHaveBeenCalledWith('NYC');
  });

  it('uses markerClusterGroup when spec.cluster is true', async () => {
    render(<MapOutput spec={{
      center: [0, 0], zoom: 2,
      cluster: true,
      markers: [
        { lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 3, lon: 3 },
      ],
    }} />);

    await waitFor(() => expect(L.markerClusterGroup).toHaveBeenCalledTimes(1));
    expect(L.featureGroup).not.toHaveBeenCalled();
    expect(L.circleMarker).toHaveBeenCalledTimes(3);
    const clusterChildren = mapState.groupAdds.filter((g) => g.kind === 'clusterGroup');
    expect(clusterChildren).toHaveLength(3);
  });

  it('plots a polyline + tooltip for spec.route', async () => {
    render(<MapOutput spec={{
      center: [0, 0], zoom: 2,
      route: { polyline: [[51.5, -0.1], [51.6, 0]], distanceKm: 12.34, durationMin: 25.6, profile: 'driving-car' },
    }} />);

    await waitFor(() => expect(L.polyline).toHaveBeenCalledTimes(1));
    const line = mapState.added.find((l) => l.__kind === 'polyline');
    expect(line).toBeDefined();
    expect(line.bindTooltip).toHaveBeenCalledWith(
      expect.stringMatching(/12\.3 km.*26 min.*driving-car/),
      expect.any(Object),
    );
  });

  it('adds a heat layer when spec.heat is provided', async () => {
    render(<MapOutput spec={{
      center: [0, 0], zoom: 2,
      heat: [[10, 20, 1], [11, 21, 0.5]],
    }} />);

    await waitFor(() => expect(L.heatLayer).toHaveBeenCalledTimes(1));
    expect(L.heatLayer.mock.calls[0][0]).toEqual([[10, 20, 1], [11, 21, 0.5]]);
  });

  it('fit button refits to all marker bounds', async () => {
    render(<MapOutput spec={{
      center: [0, 0], zoom: 2,
      markers: [
        { lat: 51.5, lon: -0.1 },
        { lat: 40.7, lon: -74.0 },
      ],
    }} />);

    await waitFor(() => expect(L.circleMarker).toHaveBeenCalledTimes(2));
    mapState.fitBounds.mockClear();
    fireEvent.click(screen.getByTitle('Fit all points'));
    expect(mapState.fitBounds).toHaveBeenCalledWith(
      expect.arrayContaining([[51.5, -0.1], [40.7, -74.0]]),
      expect.any(Object),
    );
  });

  it('reset button restores the spec\'s original center and zoom', async () => {
    render(<MapOutput spec={{ center: [10, 20], zoom: 6 }} />);
    await waitFor(() => expect(L.map).toHaveBeenCalledTimes(1));
    mapState.setView.mockClear();
    fireEvent.click(screen.getByTitle('Reset to original view'));
    expect(mapState.setView).toHaveBeenCalledWith([10, 20], 6);
  });

  it('theme toggle swaps the tile layer URL between dark and light', async () => {
    render(<MapOutput spec={{ center: [0, 0], zoom: 2 }} />);
    await waitFor(() => expect(L.tileLayer).toHaveBeenCalledTimes(1));
    expect(L.tileLayer.mock.calls[0][0]).toContain('dark_all');

    fireEvent.click(screen.getByTitle('Switch to light theme'));
    await waitFor(() => expect(L.tileLayer).toHaveBeenCalledTimes(2));
    expect(L.tileLayer.mock.calls[1][0]).toContain('light_all');
  });

  it('escapes HTML in marker labels', async () => {
    render(<MapOutput spec={{
      center: [0, 0], zoom: 2,
      markers: [{ lat: 0, lon: 0, label: '<script>alert(1)</script>' }],
    }} />);

    await waitFor(() => expect(L.circleMarker).toHaveBeenCalledTimes(1));
    const child = mapState.groupAdds.find((g) => g.kind === 'featureGroup');
    expect(child.child.bindPopup).toHaveBeenCalledWith(expect.stringMatching(/&lt;script&gt;/));
    expect(child.child.bindPopup).not.toHaveBeenCalledWith(expect.stringMatching(/<script>/));
  });

  it('export-PNG button calls dom-to-image and triggers a download', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      render(<MapOutput spec={{ center: [0, 0], zoom: 2 }} />);
      await waitFor(() => expect(L.map).toHaveBeenCalled());
      fireEvent.click(screen.getByTitle('Download as PNG'));
      await waitFor(() => expect(domToImageMock.toPng).toHaveBeenCalledTimes(1));
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      clickSpy.mockRestore();
    }
  });
});
