import React, { useMemo } from 'react';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { schemeTableau10 } from 'd3-scale-chromatic';

const PALETTE = schemeTableau10;

export function TreeMapOutput({ spec }) {
  const width  = spec?.width  ?? 640;
  const height = spec?.height ?? 360;

  const leaves = useMemo(() => {
    if (!spec) return [];
    const root = hierarchy(spec)
      .sum((d) => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    treemap()
      .tile(treemapSquarify)
      .size([width, height])
      .padding(2)
      .round(true)(root);
    return root.leaves().filter((l) => (l.value || 0) > 0);
  }, [spec, width, height]);

  if (!leaves.length) {
    return <div className="output-treemap-empty">No data to render.</div>;
  }

  return (
    <svg className="output-treemap" width={width} height={height}>
      {leaves.map((leaf, i) => {
        const w = leaf.x1 - leaf.x0;
        const h = leaf.y1 - leaf.y0;
        // Use the top-level ancestor index for stable colouring per branch.
        const top = leaf.ancestors().reverse()[1] ?? leaf;
        const colorIdx = (top.parent ? top.parent.children.indexOf(top) : 0) % PALETTE.length;
        return (
          <g key={i} transform={`translate(${leaf.x0}, ${leaf.y0})`}>
            <rect width={w} height={h} fill={PALETTE[colorIdx]} fillOpacity={0.85}>
              <title>{`${leaf.ancestors().map((a) => a.data.name).reverse().join(' / ')}\n${leaf.value}`}</title>
            </rect>
            {w > 50 && h > 18 && (
              <text x={4} y={14} fontSize="11" fill="#fff" style={{ pointerEvents: 'none' }}>
                {leaf.data.name}
              </text>
            )}
            {w > 50 && h > 32 && (
              <text x={4} y={28} fontSize="10" fill="#fff" fillOpacity={0.7} style={{ pointerEvents: 'none' }}>
                {leaf.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
