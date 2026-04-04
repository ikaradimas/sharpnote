import React, { useMemo } from 'react';
import { useCellDependencies } from '../../hooks/useCellDependencies.js';

const TYPE_COLORS = {
  code:  '#569cd6',
  sql:   '#56b6c2',
  check: '#4ec9b0',
  http:  '#e0a040',
  shell: '#4ec9b0',
};

const NODE_W = 140;
const NODE_H = 32;
const H_GAP = 40;
const V_GAP = 20;
const PAD = 20;

function layerNodes(nodes, edges) {
  // Assign layers via topological sort (longest path from root)
  const inDegree = {};
  const adj = {};
  for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = []; }
  for (const e of edges) { inDegree[e.to] = (inDegree[e.to] || 0) + 1; adj[e.from]?.push(e.to); }

  const layers = {};
  const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  const visited = new Set();
  for (const id of queue) layers[id] = 0;

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    visited.add(id);
    for (const to of adj[id] || []) {
      layers[to] = Math.max(layers[to] || 0, (layers[id] || 0) + 1);
      inDegree[to]--;
      if (inDegree[to] === 0) queue.push(to);
    }
  }

  // Assign positions to unvisited nodes (cycles or isolated)
  for (const n of nodes) {
    if (!(n.id in layers)) layers[n.id] = 0;
  }

  // Group by layer
  const byLayer = {};
  for (const n of nodes) {
    const l = layers[n.id];
    if (!byLayer[l]) byLayer[l] = [];
    byLayer[l].push(n);
  }

  // Assign x, y positions
  const positions = {};
  const maxLayer = Math.max(0, ...Object.keys(byLayer).map(Number));
  for (let l = 0; l <= maxLayer; l++) {
    const items = byLayer[l] || [];
    for (let i = 0; i < items.length; i++) {
      positions[items[i].id] = {
        x: PAD + l * (NODE_W + H_GAP),
        y: PAD + i * (NODE_H + V_GAP),
      };
    }
  }

  const totalW = PAD * 2 + (maxLayer + 1) * (NODE_W + H_GAP) - H_GAP;
  const maxPerLayer = Math.max(1, ...Object.values(byLayer).map((a) => a.length));
  const totalH = PAD * 2 + maxPerLayer * (NODE_H + V_GAP) - V_GAP;

  return { positions, totalW, totalH };
}

export function DependencyPanel({ notebook, onNavigateToCell }) {
  const { nodes, edges } = useCellDependencies(notebook);

  const { positions, totalW, totalH } = useMemo(
    () => layerNodes(nodes, edges),
    [nodes, edges]
  );

  if (nodes.length === 0) {
    return (
      <div className="panel-empty-state">
        <span className="panel-empty-title">No dependency data</span>
        <span className="panel-empty-hint">Run code cells to see variable flow between them</span>
      </div>
    );
  }

  return (
    <div className="dependency-panel">
      <div className="dependency-panel-header">
        <span className="dependency-panel-title">Cell Dependencies</span>
        <span className="dependency-panel-info">{nodes.length} cells · {edges.length} edges</span>
      </div>
      <div className="dependency-panel-scroll">
        <svg width={totalW} height={totalH} className="dependency-svg">
          {/* Edges */}
          {edges.map((e, i) => {
            const from = positions[e.from];
            const to = positions[e.to];
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <g key={`e-${i}`}>
                <path
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke="#3a5068"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow)"
                />
                {e.vars.length > 0 && (
                  <text x={mx} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="dep-edge-label">
                    {e.vars.slice(0, 3).join(', ')}{e.vars.length > 3 ? '…' : ''}
                  </text>
                )}
              </g>
            );
          })}
          {/* Arrow marker */}
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3a5068" />
            </marker>
          </defs>
          {/* Nodes */}
          {nodes.map((n) => {
            const pos = positions[n.id];
            if (!pos) return null;
            const color = TYPE_COLORS[n.type] || '#569cd6';
            return (
              <g key={n.id} onClick={() => onNavigateToCell?.(n.id)} style={{ cursor: 'pointer' }}>
                <rect
                  x={pos.x} y={pos.y} width={NODE_W} height={NODE_H}
                  rx="4" fill="#1a1a24" stroke={color} strokeWidth="1.5"
                />
                <text x={pos.x + 8} y={pos.y + NODE_H / 2 + 4} className="dep-node-label">
                  {n.label.length > 18 ? n.label.slice(0, 18) + '…' : n.label}
                </text>
                <text x={pos.x + NODE_W - 6} y={pos.y + 12} textAnchor="end" className="dep-node-type">
                  {n.type}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
