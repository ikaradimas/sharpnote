import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useCellDependencies } from '../../hooks/useCellDependencies.js';
import { CELL_COLORS } from '../../notebook-factory.js';
import { CellNodeContextMenu } from './dep/CellNodeContextMenu.jsx';
import { PipelineToolbar } from './dep/PipelineToolbar.jsx';

const TYPE_COLORS = {
  code:     '#569cd6',
  sql:      '#56b6c2',
  check:    '#4ec9b0',
  http:     '#e0a040',
  shell:    '#4ec9b0',
  docker:   '#0db7ed',
  decision: '#c586c0',
};

const TYPE_ICONS = {
  code:     'C#',
  sql:      'SQL',
  http:     '⇄',
  shell:    '>_',
  docker:   '🐳',
  check:    '✓',
  decision: '◇',
};

const NODE_W = 140;
const NODE_H = 36;
const DIAMOND_SIZE = 38;
const H_GAP = 50;
const V_GAP = 40;
const PAD = 24;
const HEADER_H = 30;

function layerNodes(nodes, edges) {
  const inDegree = {};
  const adj = {};
  for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = []; }
  for (const e of edges) { inDegree[e.to] = (inDegree[e.to] || 0) + 1; adj[e.from]?.push(e.to); }

  const layers = {};
  const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  for (const id of queue) layers[id] = 0;

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    for (const to of adj[id] || []) {
      layers[to] = Math.max(layers[to] || 0, (layers[id] || 0) + 1);
      inDegree[to]--;
      if (inDegree[to] === 0) queue.push(to);
    }
  }
  for (const n of nodes) { if (!(n.id in layers)) layers[n.id] = 0; }

  const byLayer = {};
  for (const n of nodes) {
    const l = layers[n.id];
    if (!byLayer[l]) byLayer[l] = [];
    byLayer[l].push(n);
  }

  const positions = {};
  const maxLayer = Math.max(0, ...Object.keys(byLayer).map(Number));
  const topY = PAD + HEADER_H;
  for (let l = 0; l <= maxLayer; l++) {
    const items = byLayer[l] || [];
    for (let i = 0; i < items.length; i++) {
      positions[items[i].id] = {
        x: PAD + l * (NODE_W + H_GAP),
        y: topY + i * (NODE_H + V_GAP),
      };
    }
  }

  const totalW = PAD * 2 + (maxLayer + 1) * (NODE_W + H_GAP) - H_GAP;
  const maxPerLayer = Math.max(1, ...Object.values(byLayer).map((a) => a.length));
  const totalH = topY + PAD + maxPerLayer * (NODE_H + V_GAP) - V_GAP;

  return { positions, totalW, totalH, maxLayer };
}

const DIAMOND_R = DIAMOND_SIZE * Math.SQRT2 / 2; // distance from center to tip

function getNodeRight(pos, node) {
  if (node.type === 'decision') return { x: pos.x + NODE_W / 2 + DIAMOND_R, y: pos.y + NODE_H / 2 };
  return { x: pos.x + NODE_W, y: pos.y + NODE_H / 2 };
}
function getNodeLeft(pos, node) {
  if (node.type === 'decision') return { x: pos.x + NODE_W / 2 - DIAMOND_R, y: pos.y + NODE_H / 2 };
  return { x: pos.x, y: pos.y + NODE_H / 2 };
}
function getNodeBottom(pos, node) {
  if (node.type === 'decision') return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H / 2 + DIAMOND_R };
  return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H };
}
function getNodeTop(pos, node) {
  if (node.type === 'decision') return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H / 2 - DIAMOND_R };
  return { x: pos.x + NODE_W / 2, y: pos.y };
}

function getNodeColor(node) {
  if (node.color) {
    const c = CELL_COLORS.find((cc) => cc.id === node.color);
    if (c) return c.value;
  }
  return TYPE_COLORS[node.type] || '#569cd6';
}

function getStatusClass(cellId, notebook, executionProgress, scheduledCells) {
  if (executionProgress?.activeCellId === cellId) return 'dep-status-running';
  if (executionProgress?.queue?.includes(cellId)) return 'dep-status-queued';
  if (notebook?.running?.has(cellId)) return 'dep-status-running';
  if (notebook?.cellResults?.[cellId] === 'error') return 'dep-status-error';
  if (notebook?.cellResults?.[cellId] === 'success') return 'dep-status-success';
  if ((notebook?.staleCellIds || []).includes(cellId)) return 'dep-status-stale';
  if (scheduledCells?.has(cellId)) return 'dep-status-scheduled';
  return '';
}

const STATUS_FILLS = {
  'dep-status-running':   '#569cd6',
  'dep-status-queued':    '#569cd680',
  'dep-status-success':   '#4ec9b0',
  'dep-status-error':     '#e05050',
  'dep-status-stale':     '#e0a040',
  'dep-status-scheduled': '#c586c0',
};

export function DependencyPanel({
  notebook,
  onNavigateToCell,
  notebookId,
  onRunWithDeps,
  onRunDownstream,
  onRunPipeline,
  executionProgress,
  onCancelOrchestration,
  pipelines,
  onCreatePipeline,
  onRenamePipeline,
  onDeletePipeline,
  onSetPipelineCells,
  scheduledCells,
  dispatchRun,
}) {
  const { nodes, edges } = useCellDependencies(notebook);

  const explicitEdges = useMemo(() => edges.filter((e) => !e.implicit), [edges]);
  const { positions, totalW, totalH, maxLayer } = useMemo(
    () => layerNodes(nodes, explicitEdges),
    [nodes, explicitEdges]
  );

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Context menu
  const [ctxMenu, setCtxMenu] = useState(null);

  // Tooltip
  const [tooltip, setTooltip] = useState(null);

  // Pipeline selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCellIds, setSelectedCellIds] = useState(new Set());
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);

  const selectedPipeline = (pipelines || []).find((p) => p.id === selectedPipelineId);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.dep-node-group')) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
  }, []);

  const handleMouseUp = useCallback(() => { isPanningRef.current = false; }, []);

  const handleNodeClick = useCallback((e, node) => {
    if (selectionMode) {
      setSelectedCellIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      return;
    }
    // Single click navigates to the cell
    onNavigateToCell?.(node.id);
  }, [selectionMode, onNavigateToCell]);

  const handleNodeDblClick = useCallback((e, node) => {
    const cell = notebook?.cells.find((c) => c.id === node.id);
    if (cell && notebookId) dispatchRun?.(notebookId, cell);
  }, [notebook, notebookId, dispatchRun]);

  const handleContextMenu = useCallback((e, node) => {
    e.preventDefault();
    const rect = e.currentTarget.closest('.dependency-panel-scroll')?.getBoundingClientRect();
    setCtxMenu({
      node,
      x: e.clientX - (rect?.left || 0),
      y: e.clientY - (rect?.top || 0),
    });
  }, []);

  const fitAll = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="panel-empty-state">
        <span className="panel-empty-title">No dependency data</span>
        <span className="panel-empty-hint">Run code cells to see variable flow between them</span>
      </div>
    );
  }

  const completedSet = new Set(executionProgress?.completed || []);

  return (
    <div className="dependency-panel">
      <div className="dependency-panel-header">
        <span className="dependency-panel-title">Orchestration</span>
        <span className="dependency-panel-info">{nodes.length} cells · {edges.filter((e) => !e.implicit).length} edges</span>
        <div className="dep-zoom-controls">
          <button className="dep-zoom-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.2))} title="Zoom in">+</button>
          <span className="dep-zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="dep-zoom-btn" onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))} title="Zoom out">−</button>
          <button className="dep-zoom-btn" onClick={fitAll} title="Fit to view">⊞</button>
          {executionProgress && (
            <button className="dep-cancel-btn" onClick={onCancelOrchestration} title="Cancel orchestration">⏹</button>
          )}
        </div>
      </div>
      <div
        className="dependency-panel-scroll"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          width={totalW * zoom + Math.abs(pan.x)}
          height={totalH * zoom + Math.abs(pan.y)}
          className="dependency-svg"
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Defs */}
            <defs>
              <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#3a5068" />
              </marker>
              <marker id="dep-arrow-true" viewBox="0 0 10 10" refX="9" refY="5"
                      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#4ec9b0" />
              </marker>
              <marker id="dep-arrow-false" viewBox="0 0 10 10" refX="9" refY="5"
                      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#e05050" />
              </marker>
              <marker id="dep-arrow-implicit" viewBox="0 0 10 10" refX="9" refY="5"
                      markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2a3545" />
              </marker>
            </defs>

            {/* Layer backgrounds and labels */}
            {Array.from({ length: maxLayer + 1 }, (_, l) => {
              const lx = PAD + l * (NODE_W + H_GAP) - 8;
              const lw = NODE_W + 16;
              return (
                <g key={`layer-${l}`}>
                  <rect x={lx} y={PAD} width={lw} height={totalH - PAD * 2}
                    rx="6" fill={l % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.03)'}
                    stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                  <text x={lx + lw / 2} y={PAD + 12} textAnchor="middle" className="dep-layer-label">
                    {l === 0 ? 'Entry' : `Layer ${l}`}
                  </text>
                </g>
              );
            })}

            {/* Edges */}
            {edges.map((e, i) => {
              const from = positions[e.from];
              const to = positions[e.to];
              if (!from || !to) return null;

              const isFlowing = executionProgress && completedSet.has(e.from) &&
                (executionProgress.activeCellId === e.to || executionProgress.queue?.includes(e.to));
              const isComplete = completedSet.has(e.from) && completedSet.has(e.to);

              const fromNode = nodeMap[e.from];
              const toNode = nodeMap[e.to];

              // Implicit sequential edges: draw a straight vertical dotted arrow
              if (e.implicit) {
                const p1 = getNodeBottom(from, fromNode);
                const p2 = getNodeTop(to, toNode);
                return (
                  <g key={`e-${i}`}>
                    <line
                      x1={p1.x} y1={p1.y + 2} x2={p2.x} y2={p2.y - 2}
                      stroke={isComplete ? '#4ec9b040' : '#2a3545'}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      markerEnd="url(#dep-arrow-implicit)"
                    />
                  </g>
                );
              }

              const p1 = getNodeRight(from, fromNode);
              const p2 = getNodeLeft(to, toNode);
              const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
              const mx = (x1 + x2) / 2;

              const isBranch = !!e.branch;
              const branchColor = e.branch === 'true' ? '#4ec9b0'
                : e.branch === 'false' ? '#e05050'
                : e.branch === 'default' ? '#808080'
                : isBranch ? '#c586c0'
                : '#3a5068';
              const marker = e.branch === 'true' ? 'url(#dep-arrow-true)'
                : e.branch === 'false' ? 'url(#dep-arrow-false)'
                : 'url(#dep-arrow)';
              const isDashed = e.branch === 'false' || (isBranch && e.branch !== 'true' && e.branch !== 'default');

              return (
                <g key={`e-${i}`}>
                  <path
                    d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                    fill="none"
                    stroke={isComplete ? '#4ec9b0' : branchColor}
                    strokeWidth={isFlowing ? 2.5 : 1.5}
                    strokeDasharray={isDashed ? '4 3' : isFlowing ? '6 4' : 'none'}
                    className={isFlowing ? 'dep-edge-flowing' : ''}
                    markerEnd={marker}
                  />
                  {isBranch && (
                    <text x={mx} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="dep-edge-label dep-edge-branch-label">
                      {e.branch}
                    </text>
                  )}
                  {e.vars.length > 0 && (
                    <text x={mx} y={(y1 + y2) / 2 + (isBranch ? 6 : -6)} textAnchor="middle" className="dep-edge-label">
                      {e.vars.slice(0, 3).join(', ')}{e.vars.length > 3 ? '…' : ''}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((n) => {
              const pos = positions[n.id];
              if (!pos) return null;
              const color = getNodeColor(n);
              const statusClass = getStatusClass(n.id, notebook, executionProgress, scheduledCells);
              const statusFill = STATUS_FILLS[statusClass];
              const isInPipeline = selectedPipeline?.cellIds.includes(n.id);
              const isSelected = selectionMode && selectedCellIds.has(n.id);
              const isDecision = n.type === 'decision';

              return (
                <g
                  key={n.id}
                  className="dep-node-group"
                  onClick={(e) => handleNodeClick(e, n)}
                  onDoubleClick={(e) => handleNodeDblClick(e, n)}
                  onContextMenu={(e) => handleContextMenu(e, n)}
                  onMouseEnter={(e) => setTooltip({ node: n, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: selectionMode ? 'crosshair' : 'pointer' }}
                >
                  {isDecision ? (
                    <rect
                      x={pos.x + NODE_W / 2 - DIAMOND_SIZE / 2}
                      y={pos.y + NODE_H / 2 - DIAMOND_SIZE / 2}
                      width={DIAMOND_SIZE} height={DIAMOND_SIZE}
                      rx="4"
                      transform={`rotate(45 ${pos.x + NODE_W / 2} ${pos.y + NODE_H / 2})`}
                      fill="#1a1a24" stroke={color}
                      strokeWidth={isInPipeline || isSelected ? 2.5 : 1.5}
                      strokeDasharray={isSelected ? '4 2' : 'none'}
                    />
                  ) : (
                    <rect
                      x={pos.x} y={pos.y} width={NODE_W} height={NODE_H}
                      rx="4" fill="#1a1a24" stroke={color}
                      strokeWidth={isInPipeline || isSelected ? 2.5 : 1.5}
                      strokeDasharray={isSelected ? '4 2' : 'none'}
                    />
                  )}
                  <text x={pos.x + 22} y={pos.y + NODE_H / 2 + 4} className="dep-node-label">
                    {n.label.length > 14 ? n.label.slice(0, 14) + '…' : n.label}
                  </text>
                  <rect x={pos.x + 3} y={pos.y + NODE_H / 2 - 7} width={16} height={14} rx="3" fill={color} fillOpacity="0.2" />
                  <text x={pos.x + 11} y={pos.y + NODE_H / 2 + 3} textAnchor="middle" className="dep-node-type-icon" fill={color}>
                    {TYPE_ICONS[n.type] || n.type[0].toUpperCase()}
                  </text>
                  {statusFill && (
                    <circle
                      cx={pos.x + NODE_W - 4} cy={pos.y + 4} r={4}
                      fill={statusFill}
                      className={statusClass}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Context menu */}
        {ctxMenu && (
          <CellNodeContextMenu
            x={ctxMenu.x} y={ctxMenu.y}
            node={ctxMenu.node}
            pipelines={pipelines}
            onClose={() => setCtxMenu(null)}
            actions={{
              onRun: () => {
                const cell = notebook?.cells.find((c) => c.id === ctxMenu.node.id);
                if (cell && notebookId) dispatchRun?.(notebookId, cell);
              },
              onRunWithDeps: () => onRunWithDeps?.(notebookId, ctxMenu.node.id),
              onRunDownstream: () => onRunDownstream?.(notebookId, ctxMenu.node.id),
              onNavigate: () => onNavigateToCell?.(ctxMenu.node.id),
              onAddToPipeline: (pipelineId) => {
                const p = (pipelines || []).find((pp) => pp.id === pipelineId);
                if (p && !p.cellIds.includes(ctxMenu.node.id)) {
                  onSetPipelineCells?.(notebookId, pipelineId, [...p.cellIds, ctxMenu.node.id]);
                }
              },
              onNewPipelineWith: () => {
                onCreatePipeline?.(notebookId, `Pipeline ${(pipelines || []).length + 1}`, [ctxMenu.node.id]);
              },
            }}
          />
        )}

        {/* Tooltip */}
        {tooltip && (
          <div className="dep-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 60, position: 'fixed' }}>
            <div className="dep-tooltip-type">{tooltip.node.type}</div>
            <div className="dep-tooltip-label">{tooltip.node.label}</div>
            {tooltip.node.produces.length > 0 && (
              <div className="dep-tooltip-vars">produces: {tooltip.node.produces.join(', ')}</div>
            )}
            {tooltip.node.consumes.length > 0 && (
              <div className="dep-tooltip-vars">consumes: {tooltip.node.consumes.join(', ')}</div>
            )}
          </div>
        )}
      </div>

      {/* Pipeline management */}
      <PipelineToolbar
        pipelines={pipelines}
        selectedPipelineId={selectedPipelineId}
        onSelectPipeline={setSelectedPipelineId}
        onCreatePipeline={(name, cellIds) => onCreatePipeline?.(notebookId, name, cellIds)}
        onRenamePipeline={(id, name) => onRenamePipeline?.(notebookId, id, name)}
        onDeletePipeline={(id) => onDeletePipeline?.(notebookId, id)}
        onRunPipeline={(id) => onRunPipeline?.(notebookId, id)}
        selectionMode={selectionMode}
        onToggleSelectionMode={() => { setSelectionMode((v) => !v); if (selectionMode) setSelectedCellIds(new Set()); }}
        selectedCellIds={selectedCellIds}
      />
    </div>
  );
}
