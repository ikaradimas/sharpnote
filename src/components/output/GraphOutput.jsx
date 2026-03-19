import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export function GraphOutput({ config }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) {
      try {
        chartRef.current.data = config.data;
        if (config.options) chartRef.current.options = config.options;
        chartRef.current.update('active');
        return;
      } catch {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    }
    try {
      chartRef.current = new Chart(canvasRef.current, config);
    } catch (e) {
      console.error('Chart.js error:', e);
    }
  }, [config]);

  return (
    <div className="graph-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}
