import React, { useMemo } from 'react';
import { sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey';
import { schemeTableau10 } from 'd3-scale-chromatic';

const PALETTE = schemeTableau10;

export function SankeyOutput({ spec }) {
  const width  = spec?.width  ?? 640;
  const height = spec?.height ?? 360;
  const margin = { top: 4, right: 80, bottom: 4, left: 8 };

  const { nodes, links } = useMemo(() => {
    if (!spec?.nodes?.length || !spec?.links?.length) return { nodes: [], links: [] };
    const layout = sankey()
      .nodeId((d) => d.index)
      .nodeAlign(sankeyLeft)
      .nodeWidth(14)
      .nodePadding(8)
      .extent([
        [margin.left, margin.top],
        [width - margin.right, height - margin.bottom],
      ]);
    return layout({
      nodes: spec.nodes.map((n, i) => ({ ...n, index: i })),
      links: spec.links.map((l) => ({ ...l })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, width, height]);

  if (!nodes.length) {
    return <div className="output-sankey-empty">No data to render.</div>;
  }

  return (
    <svg className="output-sankey" width={width} height={height}>
      <g>
        {links.map((l, i) => (
          <path
            key={`link-${i}`}
            d={sankeyLinkHorizontal()(l)}
            stroke={PALETTE[l.source.index % PALETTE.length]}
            strokeOpacity={0.45}
            strokeWidth={Math.max(1, l.width)}
            fill="none"
          >
            <title>{`${l.source.name} → ${l.target.name}: ${l.value}`}</title>
          </path>
        ))}
      </g>
      <g>
        {nodes.map((n, i) => (
          <g key={`node-${i}`}>
            <rect
              x={n.x0}
              y={n.y0}
              width={n.x1 - n.x0}
              height={Math.max(1, n.y1 - n.y0)}
              fill={PALETTE[n.index % PALETTE.length]}
            >
              <title>{`${n.name}: ${n.value ?? 0}`}</title>
            </rect>
            <text
              x={n.x0 < width / 2 ? n.x1 + 6 : n.x0 - 6}
              y={(n.y0 + n.y1) / 2}
              dy="0.35em"
              textAnchor={n.x0 < width / 2 ? 'start' : 'end'}
              fontSize="11"
              fill="#ddd"
            >
              {n.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
