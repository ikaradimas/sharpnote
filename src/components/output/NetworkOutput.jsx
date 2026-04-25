import React, { useEffect, useRef } from 'react';

// cytoscape is ~370 KB and only needed when a Network output renders, so
// load it lazily — same approach as MapOutput uses for Leaflet.
let cytoscapeLoader = null;
function loadCytoscape() {
  if (!cytoscapeLoader) cytoscapeLoader = import('cytoscape').then((m) => m.default);
  return cytoscapeLoader;
}

const STYLE = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'label':            'data(label)',
      'color':            '#ddd',
      'font-size':        11,
      'text-valign':      'center',
      'text-halign':      'center',
      'border-width':     1,
      'border-color':     '#444',
      'width':            28,
      'height':           28,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style':       'bezier',
      'target-arrow-shape':'triangle',
      'width':             1.5,
      'line-color':        '#666',
      'target-arrow-color':'#666',
      'label':             'data(label)',
      'color':             '#888',
      'font-size':         9,
      'text-rotation':     'autorotate',
      'text-background-color': '#1a1a22',
      'text-background-opacity': 0.7,
      'text-background-padding': 2,
    },
  },
];

export function NetworkOutput({ spec }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => () => { cyRef.current?.destroy(); cyRef.current = null; }, []);

  useEffect(() => {
    if (!containerRef.current || !spec) return;
    let cancelled = false;

    loadCytoscape().then((cytoscape) => {
      if (cancelled || !containerRef.current) return;
      cyRef.current?.destroy();

      const elements = [
        ...(spec.nodes ?? []).map((n) => ({
          group: 'nodes',
          data: { id: String(n.id), label: n.label ?? String(n.id), color: n.color ?? '#569cd6' },
        })),
        ...(spec.edges ?? []).map((e, i) => ({
          group: 'edges',
          data: {
            id: `e${i}`,
            source: String(e.source),
            target: String(e.target),
            label:  e.label ?? '',
          },
        })),
      ];

      cyRef.current = cytoscape({
        container: containerRef.current,
        elements,
        style: STYLE,
        layout: { name: spec.layout ?? 'cose', animate: false, fit: true, padding: 16 },
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
      });
    }).catch((e) => console.error('cytoscape failed to load:', e));

    return () => { cancelled = true; };
  }, [spec]);

  const width  = spec?.width  ? `${spec.width}px`  : '100%';
  const height = spec?.height ? `${spec.height}px` : '320px';

  return <div ref={containerRef} className="output-network" style={{ width, height }} />;
}
