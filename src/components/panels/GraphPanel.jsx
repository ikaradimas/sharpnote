import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const PALETTE = [
  'rgba(78,201,176,1)',
  'rgba(86,156,214,1)',
  'rgba(244,182,71,1)',
  'rgba(197,134,192,1)',
  'rgba(244,108,96,1)',
  'rgba(129,193,255,1)',
  'rgba(156,220,254,1)',
  'rgba(255,198,109,1)',
];

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Normalize a point to { v, t, axis, chartType }. */
function normPt(p) {
  if (typeof p === 'number') return { v: p, t: 0, axis: 'y', chartType: null };
  return { v: p.v, t: p.t ?? 0, axis: p.axis ?? 'y', chartType: p.chartType ?? null };
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function GraphPanel({ varHistory, onClearGraph }) {
  const hist = varHistory || {};
  const varNames = Object.keys(hist);

  const [selected, setSelected]             = useState(() => new Set(varNames.slice(0, 4)));
  const [overlays, setOverlays]             = useState({});       // { [name]: Set<'avg'|'max'> }
  const [globalChartType, setGlobalChartType] = useState('line'); // panel-wide default
  const [seriesTypes, setSeriesTypes]       = useState({});       // { [name]: 'line'|'area'|'column'|null }
  const [showLegend, setShowLegend]         = useState(true);
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const [annotations, setAnnotations]     = useState([]);
  const [exportOpen, setExportOpen]       = useState(false);
  const wrapRef = useRef(null);

  // Keep selected set in sync when vars appear / disappear
  const namesKey = varNames.join(',');
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const n of next) { if (!hist[n]) next.delete(n); }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  // Auto-init seriesTypes from kernel-supplied chartType (first occurrence only)
  useEffect(() => {
    setSeriesTypes((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const name of varNames) {
        if (next[name] != null) continue;
        const pts = hist[name] || [];
        if (pts.length === 0) continue;
        const ct = normPt(pts[pts.length - 1]).chartType;
        if (ct) { next[name] = ct === 'bar' ? 'column' : ct; changed = true; }
      }
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  const colorForIndex = (i) => PALETTE[i % PALETTE.length];

  const toggle = (name) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const toggleOverlay = (name, key) =>
    setOverlays((prev) => {
      const cur = new Set(prev[name] || []);
      if (cur.has(key)) cur.delete(key); else cur.add(key);
      return { ...prev, [name]: cur };
    });

  const setSeriesType = (name, type) =>
    setSeriesTypes((prev) => ({ ...prev, [name]: type || null }));

  /** Effective chart type for a series: per-series override or global default. */
  const effectiveType = (name) => seriesTypes[name] ?? globalChartType;

  // Derive axis per variable from most recent point
  const varAxis = useMemo(() => {
    const map = {};
    for (const name of varNames) {
      const pts = hist[name] || [];
      const last = pts[pts.length - 1];
      map[name] = last ? normPt(last).axis : 'y';
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist]);

  const hasY2 = useMemo(() => {
    for (const name of selected) {
      if (varAxis[name] === 'y2') return true;
    }
    return false;
  }, [selected, varAxis]);

  const datasets = useMemo(() => {
    const nameIndex = Object.fromEntries(varNames.map((n, i) => [n, i]));
    const result = [];
    for (const name of selected) {
      const raw = hist[name] || [];
      const data = [];
      const values = [];
      for (let i = 0; i < raw.length; i++) {
        const r = raw[i];
        const v = typeof r === 'number' ? r : r.v;
        const t = typeof r === 'number' ? 0 : (r.t ?? 0);
        data.push({ x: t, y: v });
        values.push(v);
      }
      const color = colorForIndex(nameIndex[name] ?? 0);
      const et = effectiveType(name);
      const isArea = et === 'area';
      const isBar = et === 'column';
      const axisId = varAxis[name] || 'y';
      result.push({
        type: isBar ? 'bar' : 'line',
        label: name,
        data,
        borderColor: color,
        backgroundColor: isArea ? color.replace(',1)', ',0.15)')
                        : isBar ? color.replace(',1)', ',0.7)')
                        : color.replace(',1)', ',0.7)'),
        fill: isArea,
        tension: isBar ? 0 : 0.3,
        pointRadius: isBar ? 0 : (data.length <= 20 ? 3 : 0),
        pointHoverRadius: isBar ? 0 : 4,
        yAxisID: axisId,
      });
      const ov = overlays[name] || new Set();
      const dimColor = color.replace(',1)', ',0.45)');
      if (ov.has('avg') && data.length > 0) {
        const avg = mean(values);
        result.push({
          type: 'line',
          label: `${name} avg`,
          data: data.map((p) => ({ x: p.x, y: avg })),
          borderColor: dimColor,
          backgroundColor: dimColor,
          borderDash: [4, 2],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          yAxisID: axisId,
        });
      }
      if (ov.has('max') && data.length > 0) {
        const maxVal = Math.max(...values);
        result.push({
          type: 'line',
          label: `${name} max`,
          data: data.map((p) => ({ x: p.x, y: maxVal })),
          borderColor: dimColor,
          backgroundColor: dimColor,
          borderDash: [2, 2],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          yAxisID: axisId,
        });
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, hist, globalChartType, seriesTypes, overlays, namesKey, varAxis]);

  // Build scales config
  const scales = useMemo(() => {
    const s = {
      x: {
        type: 'linear',
        ticks: {
          color: '#5a7080',
          font: { size: 9 },
          maxTicksLimit: 8,
          callback: (val) => timeFmt.format(val),
        },
        grid: { color: '#282830' },
      },
      y: {
        type: 'linear',
        position: 'left',
        ticks: { color: '#5a7080', font: { size: 9 } },
        grid: { color: '#282830' },
      },
    };
    if (hasY2) {
      s.y2 = {
        type: 'linear',
        position: 'right',
        ticks: { color: '#5a7080', font: { size: 9 } },
        grid: { drawOnChartArea: false },
      };
    }
    return s;
  }, [hasY2]);

  // Mixed chart: base type is always 'line'; each dataset carries its own type
  useEffect(() => {
    if (!canvasRef.current) return;

    if (selected.size === 0) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }

    const chart = chartRef.current;

    // Always update in-place for mixed charts (base type is always 'line')
    if (chart && chart.config.type === 'line') {
      chart.data.datasets = datasets;
      chart.options.plugins.legend.display = showLegend;
      chart.options.scales = scales;
      chart.update('none');
      return;
    }

    // Create (or recreate if somehow type changed)
    chart?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: showLegend,
            labels: { color: '#b8ccd8', font: { size: 10 }, boxWidth: 10 },
          },
          tooltip: {
            callbacks: {
              title: (items) => items.length > 0 ? timeFmt.format(items[0].parsed.x) : '',
            },
          },
        },
        scales,
        animation: { duration: 0 },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const el = elements[0];
          const text = prompt('Annotation:');
          if (!text) return;
          setAnnotations(prev => [...prev, { datasetIndex: el.datasetIndex, index: el.index, text }]);
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, showLegend, scales]);

  // Compute pixel positions for annotations
  const annotationPositions = useMemo(() => {
    const chart = chartRef.current;
    if (!chart) return [];
    return annotations.map(a => {
      const ds = chart.data.datasets[a.datasetIndex];
      if (!ds) return null;
      const pt = ds.data[a.index];
      if (!pt) return null;
      const meta = chart.getDatasetMeta(a.datasetIndex);
      const elem = meta?.data?.[a.index];
      if (!elem) return null;
      return { x: elem.x, y: elem.y, text: a.text, key: `${a.datasetIndex}-${a.index}` };
    }).filter(Boolean);
  }, [annotations, datasets]);

  function exportPNG() {
    setExportOpen(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'chart.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function exportCSV() {
    setExportOpen(false);
    const chart = chartRef.current;
    if (!chart) return;
    const rows = ['dataset,x,y'];
    for (const ds of chart.data.datasets) {
      for (const pt of ds.data) {
        rows.push(`${ds.label},${pt.x},${pt.y}`);
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = 'chart.csv';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="graph-panel">
      <div className="graph-panel-header">
        <span className="graph-panel-title">Graph</span>
        <div className="graph-panel-controls">
          <label className="graph-default-label">Default:</label>
          <select
            className="graph-type-select"
            value={globalChartType}
            onChange={(e) => setGlobalChartType(e.target.value)}
          >
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="column">Column</option>
          </select>
          <button
            className={`graph-legend-btn${showLegend ? ' active' : ''}`}
            onClick={() => setShowLegend((v) => !v)}
            title="Toggle legend"
          >
            Legend
          </button>
          <div className="graph-export-wrap">
            <button className="graph-export-btn" onClick={() => setExportOpen(v => !v)}>Export ▾</button>
            {exportOpen && (
              <div className="graph-export-menu">
                <button onClick={exportPNG}>PNG</button>
                <button onClick={exportCSV}>CSV</button>
              </div>
            )}
          </div>
          {onClearGraph && (
            <button
              className="graph-clear-btn"
              onClick={onClearGraph}
              title="Clear all graph data"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {varNames.length === 0 ? (
        <div className="graph-panel-empty">No data yet — use Display.Plot() to stream values</div>
      ) : (
        <div className="graph-panel-body">
          <div className="graph-panel-vars">
            {varNames.map((name, i) => {
              const ov = overlays[name] || new Set();
              const axis = varAxis[name];
              const et = effectiveType(name);
              return (
                <div key={name} className="graph-var-row">
                  <div className="graph-var-line1">
                    <span
                      className="graph-var-dot"
                      style={{ background: colorForIndex(i), flexShrink: 0 }}
                    />
                    <input
                      type="checkbox"
                      className="graph-var-check"
                      checked={selected.has(name)}
                      onChange={() => toggle(name)}
                    />
                    <span className="graph-var-name">{name}</span>
                    {axis === 'y2' && <span className="graph-axis-badge" title="Right y-axis">R</span>}
                  </div>
                  <div className="graph-var-line2">
                    <select
                      className="graph-var-type"
                      value={seriesTypes[name] ?? ''}
                      onChange={(e) => setSeriesType(name, e.target.value)}
                      title={`Chart type for ${name}`}
                    >
                      <option value="">Default ({globalChartType})</option>
                      <option value="line">Line</option>
                      <option value="area">Area</option>
                      <option value="column">Bar</option>
                    </select>
                    <label className="graph-overlay-label" title="Show average line">
                      <input
                        type="checkbox"
                        checked={ov.has('avg')}
                        onChange={() => toggleOverlay(name, 'avg')}
                      />
                      avg
                    </label>
                    <label className="graph-overlay-label" title="Show max line">
                      <input
                        type="checkbox"
                        checked={ov.has('max')}
                        onChange={() => toggleOverlay(name, 'max')}
                      />
                      max
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="graph-canvas-wrap" ref={wrapRef} style={{ position: 'relative' }}>
            {selected.size === 0 ? (
              <div className="graph-panel-empty">Select a variable above to plot</div>
            ) : (
              <>
                <canvas ref={canvasRef} />
                {annotationPositions.map((a, i) => (
                  <div
                    key={a.key}
                    className="graph-annotation"
                    style={{ left: a.x, top: a.y }}
                  >
                    {a.text}
                    <button
                      className="graph-annotation-remove"
                      onClick={() => setAnnotations(prev => prev.filter((_, j) => j !== i))}
                    >x</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
