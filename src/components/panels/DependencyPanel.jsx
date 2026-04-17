import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useCellDependencies } from '../../hooks/useCellDependencies.js';
import { CELL_COLORS } from '../../notebook-factory.js';
import { CellNodeContextMenu } from './dep/CellNodeContextMenu.jsx';
import { PipelineToolbar } from './dep/PipelineToolbar.jsx';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const TYPE_COLORS = {
  code:     '#569cd6',
  sql:      '#56b6c2',
  check:    '#4ec9b0',
  http:     '#e0a040',
  shell:    '#4ec9b0',
  docker:   '#0db7ed',
  decision: '#c586c0',
  start:    '#808080',
  end:      '#808080',
};

const TYPE_ICONS = {
  code:     'C#',
  sql:      'SQL',
  check:    '\u2713',
  http:     '\u21C4',
  shell:    '>_',
  docker:   '\uD83D\uDC33',
  decision: '\u25C7',
  start:    '\u2299',
  end:      '\u2298',
};

const NODE_W = 140;
const NODE_H_BASE = 56;
const NODE_H_VIRTUAL = 36;
const BOX_HEADER_H = 18;
const BOX_ITEM_H = 14;
const H_GAP = 40;
const V_GAP = 60;
const PAD = 30;
const PORT_R = 5;
const MM_W = 150;
const MM_H = 100;

const ADD_NODE_TYPES = [
  { type: 'code', label: 'Code (C#)' },
  { type: 'sql', label: 'SQL' },
  { type: 'http', label: 'HTTP' },
  { type: 'shell', label: 'Shell' },
  { type: 'docker', label: 'Docker' },
  { type: 'check', label: 'Check' },
  { type: 'decision', label: 'Decision' },
];

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function getNodeColor(node) {
  if (node.color) {
    const c = CELL_COLORS.find((cc) => cc.id === node.color);
    if (c) return c.value;
  }
  return TYPE_COLORS[node.type] || '#569cd6';
}

function getNodeHeight(node, expandedBoxes) {
  if (node.virtual) return NODE_H_VIRTUAL;
  let h = NODE_H_BASE;
  const inKey = `${node.id}:inbox`;
  const outKey = `${node.id}:outbox`;
  if (node.consumes.length > 0) {
    h += BOX_HEADER_H;
    if (expandedBoxes.has(inKey)) h += node.consumes.length * BOX_ITEM_H;
  }
  if (node.produces.length > 0) {
    h += BOX_HEADER_H;
    if (expandedBoxes.has(outKey)) h += node.produces.length * BOX_ITEM_H;
  }
  return h;
}

function getStatusInfo(cellId, notebook, executionProgress, scheduledCells) {
  if (executionProgress?.activeCellId === cellId) return { cls: 'running', fill: '#569cd6' };
  if (executionProgress?.queue?.includes(cellId)) return { cls: 'queued', fill: '#569cd680' };
  if (notebook?.running?.has(cellId)) return { cls: 'running', fill: '#569cd6' };
  if (notebook?.cellResults?.[cellId] === 'error') return { cls: 'error', fill: '#e05050' };
  if (notebook?.cellResults?.[cellId] === 'success') return { cls: 'completed', fill: '#4ec9b0' };
  if ((notebook?.staleCellIds || []).includes(cellId)) return { cls: 'stale', fill: '#e0a040' };
  if (scheduledCells?.has(cellId)) return { cls: 'scheduled', fill: '#c586c0' };
  return null;
}

function getEdgeColor(edge) {
  if (edge.branch === 'true' || edge.branch === true) return '#4ec9b0';
  if (edge.branch === 'false' || edge.branch === false) return '#e05050';
  if (edge.link) return '#569cd6';
  if (edge.implicit) return '#2a3545';
  if (edge.virtual) return '#505060';
  return '#3a5068';
}

function getEdgeDash(edge) {
  if (edge.implicit) return '3 3';
  if (edge.branch === 'false' || edge.branch === false) return '4 3';
  return 'none';
}

/* ── Layout ────────────────────────────────────────────────────────────────── */

function layoutNodes(nodes, edges, expandedBoxes, nodePositions) {
  if (nodes.length === 0) return { positions: {}, totalW: 0, totalH: 0 };

  // Group by depth
  const depthGroups = {};
  let maxDepth = 0;
  for (const n of nodes) {
    const d = n.depth;
    if (d > maxDepth) maxDepth = d;
    if (!depthGroups[d]) depthGroups[d] = [];
    depthGroups[d].push(n);
  }

  // Build predecessor lookup for barycenter heuristic
  const predecessors = {};
  for (const n of nodes) predecessors[n.id] = [];
  for (const e of edges) {
    if (!e.implicit && predecessors[e.to]) predecessors[e.to].push(e.from);
  }

  // First pass: compute initial x positions per depth row (centered, no barycenter yet)
  const tempX = {};
  for (let d = 0; d <= maxDepth; d++) {
    const group = depthGroups[d] || [];
    const rowW = group.length * NODE_W + (group.length - 1) * H_GAP;
    const startX = PAD;
    group.forEach((n, i) => {
      tempX[n.id] = startX + i * (NODE_W + H_GAP);
    });
  }

  // Barycenter heuristic: for each depth > 0, sort nodes by average x of predecessors
  for (let d = 1; d <= maxDepth; d++) {
    const group = depthGroups[d] || [];
    if (group.length <= 1) continue;

    // Compute barycenter for each node
    const bary = {};
    for (const n of group) {
      const preds = predecessors[n.id];
      if (preds.length === 0) {
        bary[n.id] = tempX[n.id];
      } else {
        let sum = 0;
        for (const pid of preds) sum += (tempX[pid] || 0) + NODE_W / 2;
        bary[n.id] = sum / preds.length;
      }
    }

    // Sort by barycenter
    group.sort((a, b) => bary[a.id] - bary[b.id]);
    depthGroups[d] = group;

    // Reassign x positions after sort
    group.forEach((n, i) => {
      tempX[n.id] = PAD + i * (NODE_W + H_GAP);
    });
  }

  // Center each row
  let globalMaxW = 0;
  for (let d = 0; d <= maxDepth; d++) {
    const group = depthGroups[d] || [];
    const rowW = group.length * NODE_W + Math.max(0, group.length - 1) * H_GAP;
    if (rowW > globalMaxW) globalMaxW = rowW;
  }

  const positions = {};
  let yOffset = PAD;
  for (let d = 0; d <= maxDepth; d++) {
    const group = depthGroups[d] || [];
    const rowW = group.length * NODE_W + Math.max(0, group.length - 1) * H_GAP;
    const xStart = PAD + (globalMaxW - rowW) / 2;

    let maxH = 0;
    for (const n of group) {
      const h = getNodeHeight(n, expandedBoxes);
      if (h > maxH) maxH = h;
    }

    group.forEach((n, i) => {
      // Use manual position if available
      if (nodePositions[n.id]) {
        positions[n.id] = { ...nodePositions[n.id] };
      } else {
        positions[n.id] = {
          x: xStart + i * (NODE_W + H_GAP),
          y: yOffset,
        };
      }
    });

    yOffset += maxH + V_GAP;
  }

  // Compute total bounds
  let totalW = 0;
  let totalH = 0;
  for (const n of nodes) {
    const p = positions[n.id];
    if (!p) continue;
    const h = getNodeHeight(n, expandedBoxes);
    if (p.x + NODE_W + PAD > totalW) totalW = p.x + NODE_W + PAD;
    if (p.y + h + PAD > totalH) totalH = p.y + h + PAD;
  }

  return { positions, totalW: Math.max(totalW, 200), totalH: Math.max(totalH, 200) };
}

/* ── Critical path ─────────────────────────────────────────────────────────── */

function computeCriticalPath(nodes, edges, cellElapsed) {
  const elapsed = cellElapsed || {};
  if (nodes.length === 0) return null;

  const explicitEdges = edges.filter((e) => !e.implicit);
  const outAdj = {};
  const inAdj = {};
  for (const n of nodes) { outAdj[n.id] = []; inAdj[n.id] = []; }
  for (const e of explicitEdges) {
    outAdj[e.from]?.push(e.to);
    inAdj[e.to]?.push(e.from);
  }

  // Topological sort
  const inDeg = {};
  for (const n of nodes) inDeg[n.id] = inAdj[n.id].length;
  const topo = [];
  const queue = nodes.filter((n) => inDeg[n.id] === 0).map((n) => n.id);
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    topo.push(id);
    for (const to of outAdj[id]) { if (--inDeg[to] === 0) queue.push(to); }
  }

  // Longest path distances
  const dist = {};
  const prev = {};
  for (const id of topo) {
    const w = elapsed[id] || 1;
    if (inAdj[id].length === 0) { dist[id] = w; prev[id] = null; }
    else {
      let best = -1;
      let bestPrev = null;
      for (const p of inAdj[id]) {
        if ((dist[p] || 0) > best) { best = dist[p] || 0; bestPrev = p; }
      }
      dist[id] = best + w;
      prev[id] = bestPrev;
    }
  }

  // Find exit node (max dist)
  let maxDist = -1;
  let exitId = null;
  for (const id of topo) { if (dist[id] > maxDist) { maxDist = dist[id]; exitId = id; } }
  if (!exitId) return null;

  // Backtrack
  const pathNodes = new Set();
  const pathEdges = new Set();
  let cur = exitId;
  while (cur) {
    pathNodes.add(cur);
    if (prev[cur]) pathEdges.add(`${prev[cur]}->${cur}`);
    cur = prev[cur];
  }
  return { nodes: pathNodes, edges: pathEdges };
}

/* ── Component ─────────────────────────────────────────────────────────────── */

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
  onAddCell,
  onWireCell,
}) {
  const { nodes, edges, startId, endIds } = useCellDependencies(notebook);

  /* ── Refs ──────────────────────────────────────────────────────────────── */
  const scrollRef = useRef(null);
  const svgRef = useRef(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const dragStartRef = useRef(null);

  /* ── State ─────────────────────────────────────────────────────────────── */
  const [mode, setMode] = useState('design');
  const [expandedBoxes, setExpandedBoxes] = useState(new Set());
  const [selectedNodes, setSelectedNodes] = useState(new Set());
  const [draggingNode, setDraggingNode] = useState(null);
  const [draggingEdge, setDraggingEdge] = useState(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ctxMenu, setCtxMenu] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [nodePositions, setNodePositions] = useState({});

  // Pipeline state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCellIds, setSelectedCellIds] = useState(new Set());
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);

  // Viewport size
  const [scrollW, setScrollW] = useState(300);
  const [scrollH, setScrollH] = useState(600);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setScrollW(entry.contentRect.width);
      setScrollH(entry.contentRect.height);
    });
    ro.observe(el);
    setScrollW(el.clientWidth);
    setScrollH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  /* ── Derived data ──────────────────────────────────────────────────────── */
  const explicitEdges = useMemo(() => edges.filter((e) => !e.implicit), [edges]);
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedPipeline = (pipelines || []).find((p) => p.id === selectedPipelineId);

  const realNodes = useMemo(() => nodes.filter((n) => !n.virtual), [nodes]);
  const isEmpty = realNodes.length === 0;

  const { positions, totalW, totalH } = useMemo(
    () => layoutNodes(nodes, edges, expandedBoxes, nodePositions),
    [nodes, edges, expandedBoxes, nodePositions],
  );

  const criticalPath = useMemo(
    () => computeCriticalPath(nodes, explicitEdges, notebook?.cellElapsed),
    [nodes, explicitEdges, notebook?.cellElapsed],
  );

  const completedSet = useMemo(
    () => new Set(executionProgress?.completed || []),
    [executionProgress?.completed],
  );

  /* ── Inbox/outbox toggle ───────────────────────────────────────────────── */
  const toggleBox = useCallback((key) => {
    setExpandedBoxes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  /* ── Zoom / pan ────────────────────────────────────────────────────────── */
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.2, z - e.deltaY * 0.001)));
  }, []);

  const handleBgMouseDown = useCallback((e) => {
    // Only start panning if clicking on the SVG background (not a node)
    if (e.target.closest('.orch-node')) return;
    if (e.button === 2) return; // right-click handled separately
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    // Deselect all on background click
    setSelectedNodes(new Set());
    setCtxMenu(null);
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (draggingNode) {
      const dx = (e.clientX - dragStartRef.current.startX) / zoom;
      const dy = (e.clientY - dragStartRef.current.startY) / zoom;
      setNodePositions((prev) => ({
        ...prev,
        [draggingNode]: {
          x: dragStartRef.current.origX + dx,
          y: dragStartRef.current.origY + dy,
        },
      }));
      return;
    }
    if (draggingEdge) {
      const rect = scrollRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setDraggingEdge((prev) => (prev ? { ...prev, toPos: { x, y } } : null));
      return;
    }
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
  }, [draggingNode, draggingEdge, zoom, pan]);

  const draggingEdgeRef = useRef(null);
  useEffect(() => { draggingEdgeRef.current = draggingEdge; }, [draggingEdge]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    if (draggingNode) setDraggingNode(null);
    // Delay clearing draggingEdge so port onMouseUp fires first
    if (draggingEdgeRef.current) {
      requestAnimationFrame(() => setDraggingEdge(null));
    }
  }, [draggingNode]);

  /* ── Node interaction ──────────────────────────────────────────────────── */
  const handleNodeMouseDown = useCallback((e, nodeId) => {
    if (mode !== 'design') return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const pos = positions[nodeId];
    if (!pos) return;
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    setDraggingNode(nodeId);
  }, [mode, positions]);

  const handleNodeClick = useCallback((e, node) => {
    if (node.virtual) return;
    if (selectionMode) {
      setSelectedCellIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
        return next;
      });
      return;
    }
    if (e.shiftKey) {
      setSelectedNodes((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
        return next;
      });
    } else {
      setSelectedNodes(new Set([node.id]));
    }
  }, [selectionMode]);

  const handleNodeDblClick = useCallback((e, node) => {
    if (node.virtual) return;
    onNavigateToCell?.(node.id);
  }, [onNavigateToCell]);

  const handleContextMenu = useCallback((e, node) => {
    if (node.virtual) return;
    e.preventDefault();
    const rect = scrollRef.current?.getBoundingClientRect();
    setCtxMenu({
      node,
      x: e.clientX - (rect?.left || 0),
      y: e.clientY - (rect?.top || 0),
    });
  }, []);

  /* ── Port drag (edge creation) ─────────────────────────────────────────── */
  const handleOutputPortMouseDown = useCallback((e, nodeId) => {
    if (mode !== 'design') return;
    e.stopPropagation();
    const pos = positions[nodeId];
    if (!pos) return;
    const nh = getNodeHeight(nodeMap[nodeId], expandedBoxes);
    const fromPos = { x: pos.x + NODE_W / 2, y: pos.y + nh + PORT_R };
    setDraggingEdge({ fromId: nodeId, fromPos, toPos: fromPos });
  }, [mode, positions, nodeMap, expandedBoxes]);

  const handleInputPortMouseUp = useCallback((e, nodeId) => {
    if (!draggingEdge) return;
    const fromId = draggingEdge.fromId;
    if (fromId === nodeId) return; // no self-loops
    e.stopPropagation();
    setDraggingEdge(null);
    if (!onWireCell) return;
    // Add nodeId to fromCell.nextCells
    const fromCell = notebook?.cells?.find(c => c.id === fromId);
    if (fromCell) {
      const current = fromCell.nextCells || [];
      if (!current.includes(nodeId)) {
        onWireCell(fromId, 'nextCells', [...current, nodeId]);
      }
    }
    // Add fromId to toCell.prevCells
    const toCell = notebook?.cells?.find(c => c.id === nodeId);
    if (toCell) {
      const current = toCell.prevCells || [];
      if (!current.includes(fromId)) {
        onWireCell(nodeId, 'prevCells', [...current, fromId]);
      }
    }
  }, [draggingEdge, onWireCell, notebook?.cells]);

  /* ── Toolbar actions ───────────────────────────────────────────────────── */
  const fitAll = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const autoLayout = useCallback(() => {
    setNodePositions({});
  }, []);

  const handleAddNode = useCallback((type) => {
    setAddMenuOpen(false);
    onAddCell?.(type);
  }, [onAddCell]);

  /* ── Minimap ───────────────────────────────────────────────────────────── */
  const handleMinimapClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scaleX = MM_W / (totalW || 1);
    const scaleY = MM_H / (totalH || 1);
    const scale = Math.min(scaleX, scaleY, 1);
    const graphX = mx / scale;
    const graphY = my / scale;
    const vpW = scrollW / zoom;
    const vpH = scrollH / zoom;
    setPan({ x: -(graphX - vpW / 2) * zoom, y: -(graphY - vpH / 2) * zoom });
  }, [totalW, totalH, scrollW, scrollH, zoom]);

  /* ── Close add menu on outside click ───────────────────────────────────── */
  const addMenuRef = useRef(null);
  useEffect(() => {
    if (!addMenuOpen) return;
    const handler = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addMenuOpen]);

  /* ── Edge bezier helper ────────────────────────────────────────────────── */
  const edgePath = useCallback((x1, y1, x2, y2) => {
    const dy = Math.abs(y2 - y1);
    const cp = Math.max(20, dy * 0.4);
    return `M${x1},${y1} C${x1},${y1 + cp} ${x2},${y2 - cp} ${x2},${y2}`;
  }, []);

  /* ── Empty state ───────────────────────────────────────────────────────── */
  if (isEmpty) {
    return (
      <div className="orch-panel panel-empty-state">
        <span className="panel-empty-title">No cells</span>
        <span className="panel-empty-hint">Add code cells to see the orchestration graph</span>
      </div>
    );
  }

  /* ── Render helpers ────────────────────────────────────────────────────── */
  const isExecuteMode = mode === 'execute';
  const modeClass = isExecuteMode ? 'orch-mode-execute' : 'orch-mode-design';

  return (
    <div className={`orch-panel ${modeClass}`}>
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="orch-toolbar">
        <button
          className={`orch-toolbar-btn${!isExecuteMode ? ' active' : ''}`}
          onClick={() => setMode('design')}
          title="Design mode"
        >
          Design
        </button>
        <button
          className={`orch-toolbar-btn${isExecuteMode ? ' active' : ''}`}
          onClick={() => setMode('execute')}
          title="Execution mode"
        >
          Execute
        </button>

        <span className="orch-toolbar-sep" />

        {!isExecuteMode && onAddCell && (
          <span className="orch-toolbar-add-wrap" ref={addMenuRef}>
            <button
              className="orch-toolbar-btn"
              onClick={() => setAddMenuOpen((v) => !v)}
              title="Add node"
            >
              + Node
            </button>
            {addMenuOpen && (
              <div className="orch-add-menu">
                {ADD_NODE_TYPES.map((t) => (
                  <button
                    key={t.type}
                    className="orch-add-menu-item"
                    onClick={() => handleAddNode(t.type)}
                  >
                    <span className="orch-add-menu-icon">{TYPE_ICONS[t.type]}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </span>
        )}

        {!isExecuteMode && (
          <button className="orch-toolbar-btn" onClick={autoLayout} title="Auto layout (clear manual positions)">
            Auto Layout
          </button>
        )}

        {isExecuteMode && (
          <>
            <button
              className="orch-toolbar-btn orch-toolbar-run"
              onClick={() => onRunPipeline?.(notebookId, selectedPipelineId)}
              title="Run all"
            >
              Run All
            </button>
            {executionProgress && (
              <button
                className="orch-toolbar-btn orch-toolbar-cancel"
                onClick={onCancelOrchestration}
                title="Cancel"
              >
                Cancel
              </button>
            )}
          </>
        )}

        <span className="orch-toolbar-sep" />

        <div className="orch-zoom-controls">
          <button className="orch-toolbar-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.2))} title="Zoom in">+</button>
          <span className="orch-zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="orch-toolbar-btn" onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))} title="Zoom out">&minus;</button>
          <button className="orch-toolbar-btn" onClick={fitAll} title="Fit to view">&oplus;</button>
        </div>

        <span className="orch-toolbar-info">
          {realNodes.length} cells &middot; {explicitEdges.length} edges
        </span>
      </div>

      {/* ── Canvas ─────────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="orch-canvas"
        onWheel={handleWheel}
        onMouseDown={handleBgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          width={Math.max(totalW * zoom + Math.abs(pan.x), scrollW)}
          height={Math.max(totalH * zoom + Math.abs(pan.y), scrollH)}
          className="orch-svg"
        >
          <defs>
            <marker id="orch-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3a5068" />
            </marker>
            <marker id="orch-arrow-green" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#4ec9b0" />
            </marker>
            <marker id="orch-arrow-red" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#e05050" />
            </marker>
            <marker id="orch-arrow-blue" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#569cd6" />
            </marker>
            <marker id="orch-arrow-virtual" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#505060" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* ── Edges ──────────────────────────────────────────────────────── */}
            {edges.map((e, i) => {
              const fromPos = positions[e.from];
              const toPos = positions[e.to];
              if (!fromPos || !toPos) return null;
              const fromNode = nodeMap[e.from];
              const toNode = nodeMap[e.to];
              if (!fromNode || !toNode) return null;

              const fromH = getNodeHeight(fromNode, expandedBoxes);
              const x1 = fromPos.x + NODE_W / 2;
              const y1 = fromPos.y + fromH + PORT_R;
              const x2 = toPos.x + NODE_W / 2;
              const y2 = toPos.y - PORT_R;

              const color = getEdgeColor(e);
              const dash = getEdgeDash(e);
              const isCritical = criticalPath?.edges.has(`${e.from}->${e.to}`);
              const isFlowing = isExecuteMode && completedSet.has(e.from) &&
                (executionProgress?.activeCellId === e.to || executionProgress?.queue?.includes(e.to));
              const isComplete = completedSet.has(e.from) && completedSet.has(e.to);

              const marker = (e.branch === 'true' || e.branch === true) ? 'url(#orch-arrow-green)'
                : (e.branch === 'false' || e.branch === false) ? 'url(#orch-arrow-red)'
                : e.link ? 'url(#orch-arrow-blue)'
                : e.virtual ? 'url(#orch-arrow-virtual)'
                : 'url(#orch-arrow)';

              const strokeW = isCritical && !isExecuteMode ? 2.5 : isFlowing ? 2.5 : 1.5;
              const opacity = isExecuteMode && isCritical ? 0.4 : 1;

              const edgeCls = [
                'orch-edge',
                isCritical && !isExecuteMode ? 'orch-edge-critical' : '',
                isFlowing ? 'orch-edge-flowing' : '',
              ].filter(Boolean).join(' ');

              return (
                <g key={`e-${i}`} className={edgeCls} style={{ opacity }}>
                  <path
                    d={edgePath(x1, y1, x2, y2)}
                    fill="none"
                    stroke={isComplete && isExecuteMode ? '#4ec9b0' : color}
                    strokeWidth={strokeW}
                    strokeDasharray={isFlowing ? '6 4' : dash}
                    markerEnd={marker}
                  />
                  {e.branch !== undefined && e.branch !== null && (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 6}
                      textAnchor="middle"
                      className="orch-edge-label"
                      fill={color}
                    >
                      {String(e.branch)}
                    </text>
                  )}
                  {e.vars && e.vars.length > 0 && (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 + 8}
                      textAnchor="middle"
                      className="orch-edge-label"
                    >
                      {e.vars.slice(0, 3).join(', ')}{e.vars.length > 3 ? '\u2026' : ''}
                    </text>
                  )}
                </g>
              );
            })}

            {/* ── Dragging edge preview ──────────────────────────────────────── */}
            {draggingEdge && (
              <path
                d={edgePath(
                  draggingEdge.fromPos.x, draggingEdge.fromPos.y,
                  draggingEdge.toPos.x, draggingEdge.toPos.y,
                )}
                fill="none"
                stroke="#569cd6"
                strokeWidth={2}
                strokeDasharray="4 3"
                opacity={0.6}
              />
            )}

            {/* ── Nodes ──────────────────────────────────────────────────────── */}
            {nodes.map((n) => {
              const pos = positions[n.id];
              if (!pos) return null;
              const nh = getNodeHeight(n, expandedBoxes);
              const color = getNodeColor(n);
              const isSelected = selectedNodes.has(n.id);
              const isInPipeline = selectedPipeline?.cellIds.includes(n.id);
              const isPipelineSelected = selectionMode && selectedCellIds.has(n.id);
              const isCritical = criticalPath?.nodes.has(n.id);
              const status = n.virtual ? null : getStatusInfo(n.id, notebook, executionProgress, scheduledCells);
              const isDecision = n.type === 'decision';

              return (
                <g key={n.id} className="orch-node">
                  {/* Node body (rendered first so ports sit on top) */}
                  <foreignObject
                    x={pos.x}
                    y={pos.y}
                    width={NODE_W}
                    height={nh}
                    onMouseDown={(e) => handleNodeMouseDown(e, n.id)}
                    onClick={(e) => handleNodeClick(e, n)}
                    onDoubleClick={(e) => handleNodeDblClick(e, n)}
                    onContextMenu={(e) => handleContextMenu(e, n)}
                    onMouseEnter={(e) => setTooltip({ node: n, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                    style={{ cursor: mode === 'design' ? (selectionMode ? 'crosshair' : 'grab') : 'default' }}
                  >
                    <div
                      className={[
                        'orch-node-body',
                        n.virtual ? 'orch-node-virtual' : '',
                        isSelected ? 'orch-node-selected' : '',
                        isInPipeline ? 'orch-node-in-pipeline' : '',
                        isPipelineSelected ? 'orch-node-pipeline-selected' : '',
                        isCritical && !isExecuteMode ? 'orch-node-critical' : '',
                        status ? `orch-node-${status.cls}` : '',
                      ].filter(Boolean).join(' ')}
                      style={{ borderColor: isSelected ? '#569cd6' : color }}
                    >
                      {/* Header row: icon + label + depth badge */}
                      <div className="orch-node-header">
                        <span
                          className={`orch-node-icon${isDecision ? ' orch-node-icon-decision' : ''}`}
                          style={{ color }}
                        >
                          {TYPE_ICONS[n.type] || n.type[0].toUpperCase()}
                        </span>
                        {!n.virtual && (
                          <span className="orch-node-depth">d:{n.depth}</span>
                        )}
                      </div>
                      <div className="orch-node-label" title={n.label}>
                        {n.label.length > 16 ? n.label.slice(0, 16) + '\u2026' : n.label}
                      </div>

                      {/* Inbox (consumes) */}
                      {!n.virtual && n.consumes.length > 0 && (
                        <div className="orch-node-box">
                          <div
                            className="orch-node-box-header"
                            onClick={(e) => { e.stopPropagation(); toggleBox(`${n.id}:inbox`); }}
                          >
                            {expandedBoxes.has(`${n.id}:inbox`) ? '\u25BE' : '\u25B8'} inbox ({n.consumes.length})
                          </div>
                          {expandedBoxes.has(`${n.id}:inbox`) && (
                            <div className="orch-node-box-list">
                              {n.consumes.map((v) => (
                                <span key={v} className="orch-node-box-var">{v}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Outbox (produces) */}
                      {!n.virtual && n.produces.length > 0 && (
                        <div className="orch-node-box">
                          <div
                            className="orch-node-box-header"
                            onClick={(e) => { e.stopPropagation(); toggleBox(`${n.id}:outbox`); }}
                          >
                            {expandedBoxes.has(`${n.id}:outbox`) ? '\u25BE' : '\u25B8'} outbox ({n.produces.length})
                          </div>
                          {expandedBoxes.has(`${n.id}:outbox`) && (
                            <div className="orch-node-box-list">
                              {n.produces.map((v) => (
                                <span key={v} className="orch-node-box-var">{v}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status indicator */}
                      {status && (
                        <span
                          className={`orch-node-status orch-node-status-${status.cls}`}
                          style={{ background: status.fill }}
                        />
                      )}
                    </div>
                  </foreignObject>

                  {/* Input port (top center) — rendered after foreignObject so it's on top */}
                  {!n.virtual || n.type === 'end' ? (
                    <circle
                      cx={pos.x + NODE_W / 2}
                      cy={pos.y - PORT_R}
                      r={PORT_R + 2}
                      className={`orch-port orch-port-input${draggingEdge ? ' orch-port-active' : ''}`}
                      fill="#1e2530"
                      stroke={color}
                      strokeWidth={1.5}
                      onMouseUp={(e) => handleInputPortMouseUp(e, n.id)}
                      style={{ cursor: draggingEdge ? 'pointer' : 'default', pointerEvents: 'all' }}
                    />
                  ) : null}

                  {/* Output port (bottom center) */}
                  {!n.virtual || n.type === 'start' ? (
                    <circle
                      cx={pos.x + NODE_W / 2}
                      cy={pos.y + nh + PORT_R}
                      r={PORT_R + 2}
                      className="orch-port orch-port-output"
                      fill="#1e2530"
                      stroke={color}
                      strokeWidth={1.5}
                      onMouseDown={(e) => handleOutputPortMouseDown(e, n.id)}
                      style={{ cursor: mode === 'design' ? 'crosshair' : 'default', pointerEvents: 'all' }}
                    />
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── Context menu ─────────────────────────────────────────────────── */}
        {ctxMenu && (
          <CellNodeContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
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
              onClearConnections: onWireCell ? () => {
                const cellId = ctxMenu.node.id;
                onWireCell(cellId, 'nextCells', undefined);
                onWireCell(cellId, 'prevCells', undefined);
                // Also remove this cell from other cells' nextCells/prevCells
                for (const c of notebook?.cells || []) {
                  if (c.nextCells?.includes(cellId)) {
                    onWireCell(c.id, 'nextCells', c.nextCells.filter(id => id !== cellId));
                  }
                  if (c.prevCells?.includes(cellId)) {
                    onWireCell(c.id, 'prevCells', c.prevCells.filter(id => id !== cellId));
                  }
                }
              } : null,
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

        {/* ── Tooltip ──────────────────────────────────────────────────────── */}
        {tooltip && (
          <div className="orch-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 60, position: 'fixed' }}>
            <div className="orch-tooltip-type">{tooltip.node.type}</div>
            <div className="orch-tooltip-label">{tooltip.node.label}</div>
            {tooltip.node.produces.length > 0 && (
              <div className="orch-tooltip-vars">produces: {tooltip.node.produces.join(', ')}</div>
            )}
            {tooltip.node.consumes.length > 0 && (
              <div className="orch-tooltip-vars">consumes: {tooltip.node.consumes.join(', ')}</div>
            )}
          </div>
        )}

        {/* ── Minimap ──────────────────────────────────────────────────────── */}
        {totalW > 0 && totalH > 0 && (
          <svg
            className="orch-minimap"
            width={MM_W}
            height={MM_H}
            onClick={handleMinimapClick}
          >
            {(() => {
              const scaleX = MM_W / totalW;
              const scaleY = MM_H / totalH;
              const scale = Math.min(scaleX, scaleY, 1);
              const vpW = (scrollW / zoom) * scale;
              const vpH = (scrollH / zoom) * scale;
              const vpX = (-pan.x / zoom) * scale;
              const vpY = (-pan.y / zoom) * scale;
              return (
                <>
                  <g transform={`scale(${scale})`}>
                    {explicitEdges.map((e, i) => {
                      const from = positions[e.from];
                      const to = positions[e.to];
                      if (!from || !to) return null;
                      const isCritEdge = criticalPath?.edges.has(`${e.from}->${e.to}`);
                      return (
                        <line
                          key={`me-${i}`}
                          x1={from.x + NODE_W / 2}
                          y1={from.y + getNodeHeight(nodeMap[e.from], expandedBoxes) / 2}
                          x2={to.x + NODE_W / 2}
                          y2={to.y + getNodeHeight(nodeMap[e.to], expandedBoxes) / 2}
                          stroke={isCritEdge ? '#e0a040' : '#3a5068'}
                          strokeWidth={isCritEdge ? 2 : 1}
                        />
                      );
                    })}
                    {nodes.map((n) => {
                      const pos = positions[n.id];
                      if (!pos) return null;
                      const isCrit = criticalPath?.nodes.has(n.id);
                      const nh = getNodeHeight(n, expandedBoxes);
                      return (
                        <rect
                          key={`mn-${n.id}`}
                          x={pos.x}
                          y={pos.y}
                          width={NODE_W}
                          height={nh}
                          rx="2"
                          fill={isCrit ? '#e0a04040' : '#1a1a24'}
                          stroke={isCrit ? '#e0a040' : getNodeColor(n)}
                          strokeWidth={isCrit ? 1.5 : 0.5}
                        />
                      );
                    })}
                  </g>
                  <rect
                    className="orch-minimap-viewport"
                    x={Math.max(0, vpX)}
                    y={Math.max(0, vpY)}
                    width={Math.min(vpW, MM_W)}
                    height={Math.min(vpH, MM_H)}
                  />
                </>
              );
            })()}
          </svg>
        )}
      </div>

      {/* ── Pipeline toolbar ───────────────────────────────────────────────── */}
      <PipelineToolbar
        pipelines={pipelines}
        selectedPipelineId={selectedPipelineId}
        onSelectPipeline={setSelectedPipelineId}
        onCreatePipeline={(name, cellIds) => onCreatePipeline?.(notebookId, name, cellIds)}
        onRenamePipeline={(id, name) => onRenamePipeline?.(notebookId, id, name)}
        onDeletePipeline={(id) => onDeletePipeline?.(notebookId, id)}
        onRunPipeline={(id) => onRunPipeline?.(notebookId, id)}
        selectionMode={selectionMode}
        onToggleSelectionMode={() => {
          setSelectionMode((v) => !v);
          if (selectionMode) setSelectedCellIds(new Set());
        }}
        selectedCellIds={selectedCellIds}
      />
    </div>
  );
}
