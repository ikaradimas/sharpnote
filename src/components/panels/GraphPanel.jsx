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

/** Normalize a point to { v, t, axis }. Legacy number-only points get t=0 (no fake timestamp). */
function normPt(p) {
  if (typeof p === 'number') return { v: p, t: 0, axis: 'y' };
  return { v: p.v, t: p.t ?? 0, axis: p.axis ?? 'y' };
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function GraphPanel({ varHistory, onClearGraph }) {
  const hist = varHistory || {};
  const varNames = Object.keys(hist);

  const [selected, setSelected]   = useState(() => new Set(varNames.slice(0, 4)));
  const [overlays, setOverlays]   = useState({});   // { [name]: Set<'avg'|'max'> }
  const [chartType, setChartType] = useState('line');
  const [showLegend, setShowLegend] = useState(true);
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

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
      // Single pass: build { x, y } data and collect numeric values
      const data = [];
      const values = [];
      for (let i = 0; i < raw.length; i++) {
        const p = normPt(raw[i]);
        data.push({ x: p.t, y: p.v });
        values.push(p.v);
      }
      const color = colorForIndex(nameIndex[name] ?? 0);
      const fill = chartType === 'area';
      const axisId = varAxis[name] || 'y';
      result.push({
        label: name,
        data,
        borderColor: color,
        backgroundColor: fill ? color.replace(',1)', ',0.15)') : color.replace(',1)', ',0.7)'),
        fill,
        tension: 0.3,
        pointRadius: data.length <= 20 ? 3 : 0,
        pointHoverRadius: 4,
        yAxisID: axisId,
      });
      const ov = overlays[name] || new Set();
      const dimColor = color.replace(',1)', ',0.45)');
      if (ov.has('avg') && data.length > 0) {
        const avg = mean(values);
        result.push({
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
  }, [selected, hist, chartType, overlays, namesKey, varAxis]);

  // Build scales config (stable across data updates unless hasY2 or chartType changes)
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

  // Create chart once; update data in-place when only datasets change
  useEffect(() => {
    if (!canvasRef.current) return;

    if (selected.size === 0) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }

    const chart = chartRef.current;
    const wantType = chartType === 'column' ? 'bar' : 'line';

    // If chart exists with same type, update in-place
    if (chart && chart.config.type === wantType) {
      chart.data.datasets = datasets;
      chart.options.plugins.legend.display = showLegend;
      chart.options.scales = scales;
      chart.update('none');
      return;
    }

    // Otherwise destroy and recreate
    chart?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: wantType,
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
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, chartType, showLegend, scales]);

  return (
    <div className="graph-panel">
      <div className="graph-panel-header">
        <span className="graph-panel-title">Graph</span>
        <div className="graph-panel-controls">
          <select
            className="graph-type-select"
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
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
              return (
                <div key={name} className="graph-var-row">
                  <label className="graph-var-check-row">
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
                  </label>
                  <div className="graph-var-overlays">
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
          <div className="graph-canvas-wrap">
            {selected.size === 0 ? (
              <div className="graph-panel-empty">Select a variable above to plot</div>
            ) : (
              <canvas ref={canvasRef} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
