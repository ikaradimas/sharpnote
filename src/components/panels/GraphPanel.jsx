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

export function GraphPanel({ varHistory }) {
  const hist = varHistory || {};
  const varNames = Object.keys(hist);

  const [selected, setSelected] = useState(() => new Set(varNames.slice(0, 4)));
  const [chartType, setChartType] = useState('line');
  const [showLegend, setShowLegend] = useState(true);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  // Keep selected set in sync when new vars appear / old ones disappear
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

  const datasets = useMemo(() => {
    const selectedArr = [...selected];
    const nameIndex = Object.fromEntries(varNames.map((n, i) => [n, i]));
    return selectedArr.map((name) => {
      const data = hist[name] || [];
      const color = colorForIndex(nameIndex[name] ?? 0);
      const fill = chartType === 'area';
      return {
        label: name,
        data,
        borderColor: color,
        backgroundColor: fill ? color.replace(',1)', ',0.15)') : color.replace(',1)', ',0.7)'),
        fill,
        tension: 0.3,
        pointRadius: data.length <= 20 ? 3 : 0,
        pointHoverRadius: 4,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, hist, chartType, namesKey]);

  const maxLen = datasets.reduce((m, d) => Math.max(m, d.data.length), 0);
  const labels = useMemo(
    () => Array.from({ length: maxLen }, (_, i) => String(i + 1)),
    [maxLen]
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    if (selected.size === 0) { chartRef.current = null; return; }
    chartRef.current = new Chart(canvasRef.current, {
      type: chartType === 'column' ? 'bar' : 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: showLegend,
            labels: { color: '#b8ccd8', font: { size: 10 }, boxWidth: 10 },
          },
        },
        scales: {
          x: {
            ticks: { color: '#5a7080', font: { size: 9 }, maxTicksLimit: 8 },
            grid: { color: '#282830' },
          },
          y: {
            ticks: { color: '#5a7080', font: { size: 9 } },
            grid: { color: '#282830' },
          },
        },
        animation: { duration: 0 },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, labels, chartType, showLegend]);

  const toggle = (name) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

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
        </div>
      </div>

      {varNames.length === 0 ? (
        <div className="graph-panel-empty">No numeric variables yet — run a cell that assigns a number</div>
      ) : (
        <div className="graph-panel-body">
          <div className="graph-panel-vars">
            {varNames.map((name, i) => (
              <label key={name} className="graph-var-row">
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
              </label>
            ))}
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
