import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { marked } from 'marked';
import { DOCS_TAB_ID } from '../constants.js';
import {
  makeLibEditorId, isLibEditorId, isNotebookId,
  getNotebookDisplayName,
} from '../utils.js';
import { DEFAULT_DOCK_LAYOUT, DEFAULT_FLOAT_W, DEFAULT_FLOAT_H } from '../config/dock-layout.jsx';
import { createNotebook, makeCell, DEFAULT_NUGET_SOURCES } from '../notebook-factory.js';
import { COMPLETION_TIMEOUT, LINT_TIMEOUT } from '../constants.js';
import { TabBar } from '../components/toolbar/TabBar.jsx';
import { NotebookView } from '../components/NotebookView.jsx';
import { LibraryEditorPane } from '../components/panels/library/LibraryEditorPane.jsx';
import { DocsPanel } from '../components/panels/docs/DocsPanel.jsx';
import { DockZone } from '../components/dock/DockZone.jsx';
import { FloatPanel } from '../components/dock/FloatPanel.jsx';
import { DockDropOverlay } from '../components/dock/DockDropOverlay.jsx';
import { QuitDialog } from '../components/dialogs/QuitDialog.jsx';
import { AboutDialog } from '../components/dialogs/AboutDialog.jsx';
import { SettingsDialog } from '../components/dialogs/SettingsDialog.jsx';
import { CommandPalette } from '../components/dialogs/CommandPalette.jsx';
import { VarInspectDialog } from '../components/dialogs/VarInspectDialog.jsx';
import { StatusBar } from './StatusBar.jsx';
import { renderPanelContent } from '../components/dock/renderPanelContent.jsx';

// ── Dock debug logging ────────────────────────────────────────────────────────
const dockLog = (...args) => window.electronAPI?.rendererLog('DOCK', args.join(' '));

export function App() {
  const [notebooks, setNotebooks] = useState(() => {
    const nb = createNotebook(true);
    return [nb];
  });
  const [activeId, setActiveId] = useState(notebooks[0].id);
  const [docsOpen, setDocsOpen] = useState(false);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen]     = useState(false);
  const [apiPanelOpen, setApiPanelOpen]         = useState(false);
  const [filesCurrentDir, setFilesCurrentDir]   = useState(null);
  const [libEditors, setLibEditors] = useState([]);
  const [dbConnections, setDbConnections] = useState([]);
  const [theme, setTheme] = useState('kl1nt');
  const isFirstThemeRender = useRef(true);
  const themeRef = useRef('kl1nt');
  useEffect(() => { themeRef.current = theme; }, [theme]);
  const [pinnedPaths, setPinnedPaths] = useState(() => new Set());
  const initialNbIdRef = useRef(notebooks[0].id);
  const [quitDirtyNbs, setQuitDirtyNbs] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSizeState] = useState(12.6);
  const fontSizeRef = useRef(12.6);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);

  const [panelFontSize, setPanelFontSizeState] = useState(11.5);
  const panelFontSizeRef = useRef(11.5);
  useEffect(() => { panelFontSizeRef.current = panelFontSize; }, [panelFontSize]);

  const [lineAltEnabled, setLineAltEnabled] = useState(true);
  const lineAltEnabledRef = useRef(true);
  useEffect(() => { lineAltEnabledRef.current = lineAltEnabled; }, [lineAltEnabled]);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // varInspectDialog: null | { name, typeName, value, notebookId, fullValue }
  const [varInspectDialog, setVarInspectDialog] = useState(null);

  // Refs for reactive cell dependency tracking
  const prevVarsSnapRef = useRef({}); // cellId -> vars snapshot before run

  // Dock layout state
  const [dockLayout, setDockLayout] = useState(DEFAULT_DOCK_LAYOUT);
  const [savedLayouts, setSavedLayouts] = useState([]);
  const [draggingPanel, setDraggingPanel] = useState(null);
  const [hoveredDropZone, setHoveredDropZone] = useState(null);
  const [layoutKey, setLayoutKey] = useState(0);
  const [flashingPanel, setFlashingPanel] = useState(null);
  const dockLayoutRef = useRef(DEFAULT_DOCK_LAYOUT);
  const savedLayoutsRef = useRef([]);
  const draggingPanelRef = useRef(null);
  const hoveredDropZoneRef = useRef(null);
  const pendingDragRef = useRef(null); // { panelId, startX, startY } | null
  useEffect(() => { dockLayoutRef.current = dockLayout; }, [dockLayout]);
  useEffect(() => { savedLayoutsRef.current = savedLayouts; }, [savedLayouts]);

  // Synchronized ref pair — callbacks read fresh state without stale closures
  const notebooksRef = useRef(notebooks);
  useEffect(() => { notebooksRef.current = notebooks; }, [notebooks]);
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const libEditorsRef = useRef(libEditors);
  useEffect(() => { libEditorsRef.current = libEditors; }, [libEditors]);
  const dbConnectionsRef = useRef(dbConnections);
  useEffect(() => { dbConnectionsRef.current = dbConnections; }, [dbConnections]);
  const pinnedPathsRef = useRef(pinnedPaths);
  useEffect(() => { pinnedPathsRef.current = pinnedPaths; }, [pinnedPaths]);

  // Auto-save the notebook file whenever DB attachment state changes (ready/detached),
  // so users don't need to manually save to persist which DBs are attached.
  const prevDbReadyRef = useRef({});
  useEffect(() => {
    for (const nb of notebooks) {
      if (!nb.path) continue;
      const curr = nb.attachedDbs
        .filter((d) => d.status === 'ready')
        .map((d) => d.connectionId)
        .sort()
        .join(',');
      const prev = prevDbReadyRef.current[nb.id];
      if (prev !== undefined && prev !== curr) {
        // Build data directly from nb (not via notebooksRef, which may lag)
        const data = {
          version: '1.0',
          title: getNotebookDisplayName(nb.path, nb.title, 'notebook'),
          color: nb.color || null,
          packages: nb.nugetPackages.map(({ id, version }) => ({ id, version: version || null })),
          sources: nb.nugetSources,
          config: nb.config.filter((e) => e.key.trim()),
          attachedDbIds: nb.attachedDbs.filter((d) => d.status === 'ready').map((d) => d.connectionId),
          cells: nb.cells.map(({ id, type, content, outputMode, locked }) => ({
            id, type, content,
            ...(type === 'code' ? { outputMode: outputMode || 'auto', locked: locked || false } : {}),
          })),
        };
        window.electronAPI?.saveNotebookTo(nb.path, data);
      }
      prevDbReadyRef.current[nb.id] = curr;
    }
  }, [notebooks]);

  const prevNbIdRef = useRef(notebooks[0].id);

  // ── State helpers ──────────────────────────────────────────────────────────

  // Update a specific notebook; updater returns a partial object merged into n
  const setNb = useCallback((id, updater) =>
    setNotebooks((prev) => prev.map((n) => n.id === id
      ? (typeof updater === 'function' ? { ...n, ...updater(n) } : { ...n, ...updater }) : n
    )), []);

  // Like setNb but also marks isDirty: true
  const setNbDirty = useCallback((id, updater) =>
    setNb(id, (n) => ({ ...(typeof updater === 'function' ? updater(n) : updater), isDirty: true })),
    [setNb]);

  // ── Pending resolver maps ──────────────────────────────────────────────────
  const pendingResolversRef = useRef({});    // cellId -> resolveFn
  const pendingCompletionsRef = useRef({});  // requestId -> resolveFn
  const pendingLintRef = useRef({});         // requestId -> resolveFn

  // Cancel all pending cell executions for a given cell list (e.g. on reset or tab close)
  const cancelPendingCells = useCallback((cells) => {
    cells.forEach((cell) => {
      const resolve = pendingResolversRef.current[cell.id];
      if (resolve) {
        delete pendingResolversRef.current[cell.id];
        resolve({ success: false });
      }
    });
  }, []);

  // ── DB connections load/save ───────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI?.loadDbConnections().then((list) => {
      if (Array.isArray(list)) setDbConnections(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    window.electronAPI?.saveDbConnections(dbConnections);
  }, [dbConnections]);

  // ── Theme load/apply/save + pinned tabs restore ────────────────────────────
  useEffect(() => {
    window.electronAPI?.loadAppSettings().then((s) => {
      if (s?.theme) setTheme(s.theme);
      if (typeof s?.lineAltEnabled === 'boolean') setLineAltEnabled(s.lineAltEnabled);
      if (s?.dockLayout) {
        const loaded = {
          ...DEFAULT_DOCK_LAYOUT,
          ...s.dockLayout,
          // Deep-merge sub-objects so newly added panels (e.g. vars) are always present
          assignments: { ...DEFAULT_DOCK_LAYOUT.assignments, ...(s.dockLayout.assignments || {}) },
          order:       { ...DEFAULT_DOCK_LAYOUT.order,       ...(s.dockLayout.order       || {}) },
        };
        setDockLayout(loaded);
        dockLayoutRef.current = loaded;
      }
      if (Array.isArray(s?.savedLayouts)) {
        setSavedLayouts(s.savedLayouts);
        savedLayoutsRef.current = s.savedLayouts;
      }
      const pinned = Array.isArray(s?.pinnedTabs) ? s.pinnedTabs : [];
      if (pinned.length === 0) return;
      setPinnedPaths(new Set(pinned));
      // Open pinned files in new tabs on startup
      Promise.allSettled(pinned.map((fp) => window.electronAPI.openRecentFile(fp)))
        .then((results) => {
          const toAdd = [];
          results.forEach((r) => {
            if (r.status !== 'fulfilled' || !r.value?.success) return;
            const nb = createNotebook(false);
            const loadedPkgs = (r.value.data.packages || []).map((p) => ({ ...p, status: 'pending' }));
            const savedDbIds = r.value.data.attachedDbIds || [];
            toAdd.push({
              nb: {
                ...nb,
                path: r.value.filePath,
                color: r.value.data.color || null,
                cells: r.value.data.cells || [],
                nugetPackages: loadedPkgs,
                nugetSources: r.value.data.sources || [...DEFAULT_NUGET_SOURCES],
                config: r.value.data.config || [],
                attachedDbs: savedDbIds.map((id) => ({
                  connectionId: id, status: 'connecting', varName: '', schema: null, error: undefined,
                })),
                isDirty: false,
              },
            });
          });
          if (toAdd.length === 0) return;
          setNotebooks((prev) => {
            // Remove initial blank tab if it was never touched
            const initId = initialNbIdRef.current;
            const initNb = prev.find((n) => n.id === initId);
            const isBlank = initNb && !initNb.isDirty && !initNb.path
              && initNb.cells.length <= 1 && !(initNb.cells[0]?.content);
            const base = isBlank ? prev.filter((n) => n.id !== initId) : prev;
            const existingPaths = new Set(base.map((n) => n.path).filter(Boolean));
            const fresh = toAdd.filter(({ nb }) => !existingPaths.has(nb.path)).map(({ nb }) => nb);
            return [...base, ...fresh];
          });
          toAdd.forEach(({ nb }) => window.electronAPI.startKernel(nb.id));
        });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.classList.toggle('line-alt-enabled', lineAltEnabled); }, [lineAltEnabled]);

  useEffect(() => {
    if (isFirstThemeRender.current) { isFirstThemeRender.current = false; return; }
    window.electronAPI?.saveAppSettings({ theme, lineAltEnabled: lineAltEnabledRef.current, pinnedTabs: [...pinnedPathsRef.current], dockLayout: dockLayoutRef.current, savedLayouts: savedLayoutsRef.current });
  }, [theme]); // pinnedPathsRef is stable ref, no dep needed

  useEffect(() => {
    window.electronAPI?.saveAppSettings({ theme: themeRef.current, lineAltEnabled, pinnedTabs: [...pinnedPathsRef.current], dockLayout: dockLayoutRef.current, savedLayouts: savedLayoutsRef.current });
  }, [lineAltEnabled]);

  // When dbConnections first loads, send db_connect for any notebooks whose
  // saved DBs are still 'connecting' (kernel was already ready before connections loaded).
  useEffect(() => {
    if (dbConnections.length === 0) return;
    for (const nb of notebooksRef.current) {
      if (nb.kernelStatus !== 'ready') continue;
      const toReattach = nb.attachedDbs.filter((d) => d.status === 'connecting');
      for (const d of toReattach) {
        const conn = dbConnections.find((c) => c.id === d.connectionId);
        if (!conn) continue;
        const varName = conn.name
          .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
          .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
          .replace(/^[^a-zA-Z]/, 'db');
        setNb(nb.id, (n) => ({
          attachedDbs: n.attachedDbs.map((a) =>
            a.connectionId === d.connectionId ? { ...a, varName } : a
          ),
        }));
        window.electronAPI?.sendToKernel(nb.id, {
          type: 'db_connect',
          connectionId: conn.id,
          name: conn.name,
          provider: conn.provider,
          connectionString: conn.connectionString,
          varName,
        });
      }
    }
  }, [dbConnections, setNb]);

  // ── Start kernels on mount ─────────────────────────────────────────────────
  useEffect(() => {
    for (const nb of notebooks) {
      window.electronAPI?.startKernel(nb.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Kernel message router ──────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return;

    const handler = (payload) => {
      const { notebookId, message: msg } = payload;

      switch (msg.type) {
        case 'ready':
          setNb(notebookId, { kernelStatus: 'ready', vars: [] });
          // Kick pending NuGet preloads
          {
            const nb = notebooksRef.current.find((n) => n.id === notebookId);
            if (nb) {
              const pending = nb.nugetPackages.filter((p) => p.status === 'pending');
              if (pending.length > 0 && window.electronAPI) {
                setNb(notebookId, (n) => ({
                  nugetPackages: n.nugetPackages.map((p) =>
                    p.status === 'pending' ? { ...p, status: 'loading' } : p
                  ),
                }));
                window.electronAPI.sendToKernel(notebookId, {
                  type: 'preload_nugets',
                  packages: pending.map(({ id, version }) => ({ id, version })),
                  sources: nb.nugetSources.filter((s) => s.enabled).map((s) => s.url),
                });
              }
              // Re-attach saved DBs
              const toReattach = nb.attachedDbs.filter((d) => d.status === 'connecting');
              for (const d of toReattach) {
                const conn = dbConnectionsRef.current.find((c) => c.id === d.connectionId);
                if (!conn) continue; // connections may not be loaded yet — leave as 'connecting'
                const varName = conn.name
                  .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
                  .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
                  .replace(/^[^a-zA-Z]/, 'db');
                setNb(notebookId, (n) => ({
                  attachedDbs: n.attachedDbs.map((a) =>
                    a.connectionId === d.connectionId ? { ...a, varName } : a
                  ),
                }));
                window.electronAPI?.sendToKernel(notebookId, {
                  type: 'db_connect',
                  connectionId: conn.id,
                  name: conn.name,
                  provider: conn.provider,
                  connectionString: conn.connectionString,
                  varName,
                });
              }
            }
          }
          break;

        case 'stdout':
          setNb(notebookId, (n) => ({
            outputs: { ...n.outputs, [msg.id]: [...(n.outputs[msg.id] || []), msg] },
          }));
          break;

        case 'display':
          if (msg.update && msg.handleId) {
            setNb(notebookId, (n) => ({
              outputs: {
                ...n.outputs,
                [msg.id]: (n.outputs[msg.id] || []).map((m) =>
                  m.handleId === msg.handleId ? { ...msg, title: m.title } : m
                ),
              },
            }));
          } else {
            setNb(notebookId, (n) => ({
              outputs: { ...n.outputs, [msg.id]: [...(n.outputs[msg.id] || []), msg] },
            }));
          }
          break;

        case 'error':
          if (msg.id) {
            setNb(notebookId, (n) => ({
              outputs: { ...n.outputs, [msg.id]: [...(n.outputs[msg.id] || []), msg] },
            }));
          } else {
            // Ignore process-exit errors that arrive while we're already restarting
            setNb(notebookId, (n) =>
              n.kernelStatus === 'starting' ? {} : { kernelStatus: 'error' }
            );
          }
          break;

        case 'complete': {
          const resolve = pendingResolversRef.current[msg.id];
          if (resolve) {
            delete pendingResolversRef.current[msg.id];
            resolve(msg);
          }
          setNb(notebookId, (n) => {
            const next = new Set(n.running);
            next.delete(msg.id);
            const result = (!msg.cancelled && msg.success) ? 'success' : 'error';
            const extra = msg.cancelled
              ? { outputs: { ...n.outputs, [msg.id]: [...(n.outputs[msg.id] || []), { type: 'interrupted' }] } }
              : {};

            // Reactive cell dependencies: detect which downstream cells may be stale
            let staleCellIds = [...(n.staleCellIds || [])].filter((id) => id !== msg.id);
            if (!msg.cancelled && msg.success) {
              const prevSnap = prevVarsSnapRef.current[msg.id] || [];
              delete prevVarsSnapRef.current[msg.id];
              const prevMap = Object.fromEntries(prevSnap.map((v) => [v.name, v.value]));
              const changedNames = (n.vars || [])
                .filter((v) => v.name in prevMap && prevMap[v.name] !== v.value)
                .map((v) => v.name);

              if (changedNames.length > 0) {
                const runIdx = n.cells.findIndex((c) => c.id === msg.id);
                for (const cell of n.cells.slice(runIdx + 1)) {
                  if (cell.type !== 'code' || staleCellIds.includes(cell.id)) continue;
                  const usesChanged = changedNames.some((name) => {
                    try { return new RegExp(`\\b${name}\\b`).test(cell.content || ''); }
                    catch { return false; }
                  });
                  if (usesChanged) staleCellIds.push(cell.id);
                }
              }
            }

            return {
              running: next,
              cellResults: { ...(n.cellResults || {}), [msg.id]: result },
              staleCellIds,
              ...extra,
            };
          });
          break;
        }

        case 'autocomplete_result': {
          const resolve = pendingCompletionsRef.current[msg.requestId];
          if (resolve) {
            delete pendingCompletionsRef.current[msg.requestId];
            resolve(msg.items || []);
          }
          break;
        }

        case 'lint_result': {
          const resolve = pendingLintRef.current[msg.requestId];
          if (resolve) {
            delete pendingLintRef.current[msg.requestId];
            resolve(msg.diagnostics || []);
          }
          break;
        }

        case 'nuget_status':
          setNb(notebookId, (n) => ({
            nugetPackages: n.nugetPackages.map((p) =>
              p.id === msg.id
                ? {
                    ...p,
                    status: msg.status,
                    ...(msg.status === 'loaded' && msg.version ? { version: msg.version } : {}),
                    ...(msg.message ? { error: msg.message } : { error: undefined }),
                  }
                : p
            ),
          }));
          break;

        case 'memory_mb':
          setNb(notebookId, (n) => ({
            memoryHistory: [...n.memoryHistory.slice(-59), msg.mb],
          }));
          break;

        case 'var_point': {
          setNb(notebookId, (n) => {
            const hist = { ...(n.varHistory || {}) };
            hist[msg.name] = [...(hist[msg.name] || []).slice(-49), msg.value];
            return { varHistory: hist };
          });
          break;
        }

        case 'vars_update': {
          setNb(notebookId, (n) => {
            const hist = { ...(n.varHistory || {}) };
            for (const v of msg.vars) {
              if (!v.isNull) {
                const num = Number(v.value);
                if (isFinite(num)) {
                  hist[v.name] = [...(hist[v.name] || []).slice(-49), num];
                }
              }
            }
            return { vars: msg.vars, varHistory: hist };
          });
          break;
        }

        case 'nuget_preload_complete':
          break;

        case 'var_inspect_result':
          setVarInspectDialog((prev) =>
            prev && prev.name === msg.name
              ? { ...prev, fullValue: msg.json }
              : prev
          );
          break;

        case 'reset_complete':
          setNb(notebookId, { kernelStatus: 'ready', vars: [], varHistory: {}, outputHistory: {}, staleCellIds: [] });
          break;

        case 'db_schema':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.map((d) =>
              d.connectionId === msg.connectionId
                ? { ...d, schema: { databaseName: msg.databaseName, tables: msg.tables } }
                : d
            ),
          }));
          break;

        case 'db_ready':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.map((d) =>
              d.connectionId === msg.connectionId
                ? { ...d, status: 'ready', varName: msg.varName, error: undefined }
                : d
            ),
          }));
          break;

        case 'db_error':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.map((d) =>
              d.connectionId === msg.connectionId
                ? { ...d, status: 'error', error: msg.message }
                : d
            ),
          }));
          break;

        case 'db_disconnected':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.filter((d) => d.connectionId !== msg.connectionId),
          }));
          break;

        default:
          break;
      }
    };

    window.electronAPI.onKernelMessage(handler);
    return () => window.electronAPI.offKernelMessage(handler);
  }, [setNb]);

  // ── Font size ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onFontSizeChange) return;
    window.electronAPI.onFontSizeChange((size) => {
      document.documentElement.style.setProperty('--base-font-size', String(size));
      setFontSizeState(size);
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onPanelFontSizeChange) return;
    window.electronAPI.onPanelFontSizeChange((size) => {
      document.documentElement.style.setProperty('--panel-zoom', String(size / 11.5));
      setPanelFontSizeState(size);
    });
  }, []);

  // ── Cell execution ─────────────────────────────────────────────────────────

  const runCell = useCallback((notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'code') return Promise.resolve();

    // Snapshot vars before running for reactive dependency detection
    prevVarsSnapRef.current[cell.id] = [...(notebooksRef.current.find((n) => n.id === notebookId)?.vars || [])];

    return new Promise((resolve) => {
      setNb(notebookId, (n) => {
        // Preserve previous outputs in history (max 5 snapshots)
        const prevOutputs = n.outputs[cell.id];
        const newOutputHistory = { ...(n.outputHistory || {}) };
        if (prevOutputs && prevOutputs.length > 0) {
          newOutputHistory[cell.id] = [...(newOutputHistory[cell.id] || []).slice(-4), prevOutputs];
        }
        return {
          outputs: { ...n.outputs, [cell.id]: [] },
          outputHistory: newOutputHistory,
          cellResults: { ...(n.cellResults || {}), [cell.id]: null },
          running: new Set([...n.running, cell.id]),
          staleCellIds: (n.staleCellIds || []).filter((id) => id !== cell.id),
        };
      });

      pendingResolversRef.current[cell.id] = resolve;

      const nb = notebooksRef.current.find((n) => n.id === notebookId);
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute',
        id: cell.id,
        code: cell.content,
        outputMode: cell.outputMode || 'auto',
        sources: nb ? nb.nugetSources.filter((s) => s.enabled).map((s) => s.url) : [],
        config: nb
          ? Object.fromEntries(nb.config.filter((e) => e.key.trim()).map((e) => [e.key, e.value]))
          : {},
      });
    });
  }, [setNb]);

  const runAll = useCallback(async (notebookId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    for (const cell of nb.cells.filter((c) => c.type === 'code')) {
      await runCell(notebookId, cell);
    }
  }, [runCell]);

  const runFrom = useCallback(async (notebookId, cellId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb || nb.running.size > 0) return;
    const idx = nb.cells.findIndex((c) => c.id === cellId);
    if (idx < 0) return;
    for (const cell of nb.cells.slice(idx).filter((c) => c.type === 'code'))
      await runCell(notebookId, cell);
  }, [runCell]);

  const runTo = useCallback(async (notebookId, cellId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb || nb.running.size > 0) return;
    const idx = nb.cells.findIndex((c) => c.id === cellId);
    if (idx < 0) return;
    for (const cell of nb.cells.slice(0, idx + 1).filter((c) => c.type === 'code'))
      await runCell(notebookId, cell);
  }, [runCell]);

  // ── Kernel interrupt ───────────────────────────────────────────────────────

  const handleInterrupt = useCallback((notebookId) => {
    window.electronAPI?.interruptKernel(notebookId);
  }, []);

  // ── Kernel reset ───────────────────────────────────────────────────────────

  const handleReset = useCallback((notebookId) => {
    if (!window.electronAPI) return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (nb) cancelPendingCells(nb.cells);
    setNb(notebookId, (n) => ({
      kernelStatus: 'starting',
      outputs: {},
      cellResults: {},
      running: new Set(),
      vars: [],
      // Reset loaded/loading packages to pending so the new kernel re-preloads them
      nugetPackages: n.nugetPackages.map((p) =>
        (p.status === 'loaded' || p.status === 'loading') ? { ...p, status: 'pending' } : p
      ),
      // Reset ready/connecting DBs to connecting so the new kernel re-attaches them
      attachedDbs: n.attachedDbs.map((d) =>
        d.status !== 'error' ? { ...d, status: 'connecting', schema: null } : d
      ),
    }));
    window.electronAPI.resetKernel(notebookId);
  }, [setNb]);

  // ── Save / Load ────────────────────────────────────────────────────────────

  const buildNotebookData = useCallback((notebookId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return null;
    return {
      version: '1.0',
      title: getNotebookDisplayName(nb.path, nb.title, 'notebook'),
      color: nb.color || null,
      packages: nb.nugetPackages.map(({ id, version }) => ({ id, version: version || null })),
      sources: nb.nugetSources,
      config: nb.config.filter((e) => e.key.trim()),
      attachedDbIds: nb.attachedDbs.filter((d) => d.status === 'ready').map((d) => d.connectionId),
      cells: nb.cells.map(({ id, type, content, outputMode, locked }) => ({
        id, type, content,
        ...(type === 'code' ? { outputMode: outputMode || 'auto', locked: locked || false } : {}),
      })),
    };
  }, []);

  const handleSave = useCallback(async (notebookId) => {
    if (!window.electronAPI) return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    const data = buildNotebookData(notebookId);
    if (nb.path) {
      await window.electronAPI.saveNotebookTo(nb.path, data);
      setNb(notebookId, { isDirty: false });
    } else {
      const result = await window.electronAPI.saveNotebook(data);
      if (result.success) setNb(notebookId, { path: result.filePath, isDirty: false });
    }
  }, [buildNotebookData, setNb]);

  const handleSaveAs = useCallback(async (notebookId) => {
    if (!window.electronAPI) return;
    const data = buildNotebookData(notebookId);
    if (!data) return;
    const result = await window.electronAPI.saveNotebook(data);
    if (result.success) setNb(notebookId, { path: result.filePath, isDirty: false });
  }, [buildNotebookData, setNb]);

  // Scroll to and briefly flash a specific cell in the active notebook
  const handleNavigateToCell = useCallback((notebookId, cellId) => {
    const pane = document.querySelector(`.notebook-pane[data-nb="${notebookId}"]`);
    if (!pane) return;
    const wrapper = pane.querySelector(`.cell-wrapper[data-cell-id="${cellId}"]`);
    if (!wrapper) return;
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    wrapper.classList.add('cell-flash');
    wrapper.addEventListener('animationend', () => wrapper.classList.remove('cell-flash'), { once: true });
  }, []);

  // handleLoad always opens a NEW tab
  const handleLoad = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.loadNotebook();
    if (!result.success || !result.data) return;

    const nb = createNotebook(false);
    const loadedPkgs = (result.data.packages || []).map((p) => ({ ...p, status: 'pending' }));
    const savedDbIds = result.data.attachedDbIds || [];
    const nbWithData = {
      ...nb,
      path: result.filePath,
      color: result.data.color || null,
      cells: result.data.cells || [],
      nugetPackages: loadedPkgs,
      nugetSources: result.data.sources || [...DEFAULT_NUGET_SOURCES],
      config: result.data.config || [],
      attachedDbs: savedDbIds.map((id) => ({ connectionId: id, status: 'connecting', varName: '', schema: null, error: undefined })),
      isDirty: false,
    };

    setNotebooks((prev) => [...prev, nbWithData]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);
  }, []);

  // Open a recently used file in a new tab
  const handleOpenRecent = useCallback(async (filePath) => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openRecentFile(filePath);
    if (!result.success) {
      alert(`Could not open file:\n${result.error || 'File not found'}`);
      return;
    }
    const nb = createNotebook(false);
    const loadedPkgs = (result.data.packages || []).map((p) => ({ ...p, status: 'pending' }));
    const savedDbIds2 = result.data.attachedDbIds || [];
    setNotebooks((prev) => [...prev, {
      ...nb,
      path: result.filePath,
      color: result.data.color || null,
      cells: result.data.cells || [],
      nugetPackages: loadedPkgs,
      nugetSources: result.data.sources || [...DEFAULT_NUGET_SOURCES],
      config: result.data.config || [],
      attachedDbs: savedDbIds2.map((id) => ({ connectionId: id, status: 'connecting', varName: '', schema: null, error: undefined })),
      isDirty: false,
    }]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);
  }, []);

  // Insert a library snippet at the current scroll position of the active notebook
  const handleInsertLibraryFile = useCallback((content) => {
    const nbId = activeIdRef.current;
    if (!isNotebookId(nbId)) return;

    // Find the last cell whose top edge is within the visible viewport of the scroll container
    let insertAfterIndex = -1; // -1 = prepend before all cells (edge case: empty or scrolled to top)
    const notebook = document.querySelector(`.notebook-pane[data-nb="${nbId}"] .notebook`);
    if (notebook) {
      const wrappers = notebook.querySelectorAll('.cell-wrapper');
      const viewportBottom = notebook.getBoundingClientRect().bottom;
      for (let i = 0; i < wrappers.length; i++) {
        if (wrappers[i].getBoundingClientRect().top < viewportBottom) insertAfterIndex = i;
        else break;
      }
      // Default to end if all cells are visible or list is short
      if (insertAfterIndex < 0 && wrappers.length > 0) insertAfterIndex = wrappers.length - 1;
    }

    const targetIndex = insertAfterIndex + 1;
    setNbDirty(nbId, (n) => {
      const next = [...n.cells];
      next.splice(targetIndex, 0, makeCell('code', content));
      return { cells: next };
    });

    // After React re-renders, scroll to the new cell and flash it
    setTimeout(() => {
      const nb = document.querySelector(`.notebook-pane[data-nb="${nbId}"] .notebook`);
      if (!nb) return;
      const wrappers = nb.querySelectorAll('.cell-wrapper');
      const target = wrappers[targetIndex];
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      target.classList.add('cell-flash');
      target.addEventListener('animationend', () => target.classList.remove('cell-flash'), { once: true });
    }, 50);
  }, [setNbDirty]);

  // Inject content into the currently focused cell, or create a new cell if none is focused.
  // Used by the API Browser "Inject" button.
  const handleInjectApiCall = useCallback((content) => {
    const nbId = activeIdRef.current;
    if (!isNotebookId(nbId)) return;

    // Detect the focused CodeMirror editor within the active notebook pane
    const focusedEditor = document.querySelector(
      `.notebook-pane[data-nb="${nbId}"] .cm-focused`
    );
    const cellWrapper = focusedEditor?.closest('.cell-wrapper[data-cell-id]');
    const focusedCellId = cellWrapper?.dataset?.cellId;

    if (focusedCellId) {
      // Replace the focused cell's content with the snippet
      setNbDirty(nbId, (n) => ({
        cells: n.cells.map((c) => c.id === focusedCellId ? { ...c, content } : c),
      }));
      setTimeout(() => {
        cellWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        cellWrapper.classList.add('cell-flash');
        cellWrapper.addEventListener('animationend', () => cellWrapper.classList.remove('cell-flash'), { once: true });
      }, 50);
    } else {
      // No focused cell — insert a new one after the last visible cell
      handleInsertLibraryFile(content);
    }
  }, [setNbDirty, handleInsertLibraryFile]);

  // Open a library file in an editor tab
  const handleOpenLibraryFile = useCallback(async (file) => {
    if (!window.electronAPI) return;
    const id = makeLibEditorId(file.fullPath);
    const existing = libEditorsRef.current.find((e) => e.id === id);
    if (existing) { setActiveId(id); return; }
    const content = await window.electronAPI.readLibraryFile(file.fullPath);
    setLibEditors((prev) => [...prev, {
      id, fullPath: file.fullPath, filename: file.name, content, isDirty: false,
    }]);
    setActiveId(id);
  }, []);

  const handleCloseLibEditor = useCallback((id) => {
    const editor = libEditorsRef.current.find((e) => e.id === id);
    if (!editor) return;
    if (editor.isDirty && !window.confirm(`Close "${editor.filename}" without saving?`)) return;
    setLibEditors((prev) => prev.filter((e) => e.id !== id));
    if (activeIdRef.current === id) {
      const nbs = notebooksRef.current;
      setActiveId(nbs[nbs.length - 1]?.id ?? null);
    }
  }, []);

  const handleLibEditorChange = useCallback((id, newContent) => {
    setLibEditors((prev) => prev.map((e) => e.id === id ? { ...e, content: newContent, isDirty: true } : e));
  }, []);

  const handleSaveLibEditor = useCallback(async (id) => {
    const editor = libEditorsRef.current.find((e) => e.id === id);
    if (!editor || !window.electronAPI) return;
    await window.electronAPI.saveLibraryFile(editor.fullPath, editor.content);
    setLibEditors((prev) => prev.map((e) => e.id === id ? { ...e, isDirty: false } : e));
  }, []);

  // ── Tab management ─────────────────────────────────────────────────────────

  const handleNew = useCallback(async () => {
    if (!window.electronAPI) return;
    const response = await window.electronAPI.showNewNotebookDialog();
    if (response === 2) return; // Cancel
    const nb = createNotebook(response === 0); // 0 = Examples, 1 = Blank
    setNotebooks((prev) => [...prev, nb]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);
  }, []);

  const handleSetTabColor = useCallback((notebookId, color) => {
    setNb(notebookId, { color });
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (nb?.path) {
      const data = buildNotebookData(notebookId);
      window.electronAPI?.saveNotebookTo(nb.path, { ...data, color: color || null });
    }
  }, [setNb, buildNotebookData]);

  const handleRenameTab = useCallback(async (notebookId, newName) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    const title = newName.trim();
    if (!nb || !title) return;
    if (nb.path) {
      // Strip characters illegal in filenames on Windows/macOS/Linux
      const safeName = title.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled';
      const newPath = nb.path.replace(/[^/\\]+\.cnb$/, `${safeName}.cnb`);
      const result = await window.electronAPI?.renameFile(nb.path, newPath);
      if (result?.success) setNb(notebookId, { path: newPath, title });
    } else {
      setNb(notebookId, { title });
    }
  }, [setNb]);

  const handleTogglePin = useCallback((filePath) => {
    setPinnedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
      window.electronAPI?.saveAppSettings({ theme: themeRef.current, lineAltEnabled: lineAltEnabledRef.current, pinnedTabs: [...next], dockLayout: dockLayoutRef.current, savedLayouts: savedLayoutsRef.current });
      return next;
    });
  }, []);

  const handleExportSettings = useCallback(async () => {
    const apiSaved = await window.electronAPI?.loadApiSaved() ?? [];
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      appSettings: {
        theme: themeRef.current,
        dockLayout: dockLayoutRef.current,
        savedLayouts: savedLayoutsRef.current,
        pinnedTabs: [...pinnedPathsRef.current],
      },
      fontSize: fontSizeRef.current,
      panelFontSize: panelFontSizeRef.current,
      dbConnections: dbConnectionsRef.current,
      apiSaved,
    };
    return window.electronAPI?.exportSettings(data);
  }, []);

  const handleImportSettings = useCallback(async () => {
    const result = await window.electronAPI?.importSettings();
    if (!result?.success || !result?.data) return result;
    const { data } = result;

    if (data.appSettings?.theme) setTheme(data.appSettings.theme);

    if (data.appSettings?.dockLayout) {
      const loaded = {
        ...DEFAULT_DOCK_LAYOUT,
        ...data.appSettings.dockLayout,
        assignments: { ...DEFAULT_DOCK_LAYOUT.assignments, ...(data.appSettings.dockLayout.assignments || {}) },
        order:       { ...DEFAULT_DOCK_LAYOUT.order,       ...(data.appSettings.dockLayout.order       || {}) },
      };
      setDockLayout(loaded);
      dockLayoutRef.current = loaded;
    }
    if (Array.isArray(data.appSettings?.savedLayouts)) {
      setSavedLayouts(data.appSettings.savedLayouts);
      savedLayoutsRef.current = data.appSettings.savedLayouts;
    }
    if (Array.isArray(data.appSettings?.pinnedTabs)) {
      setPinnedPaths(new Set(data.appSettings.pinnedTabs));
    }
    if (typeof data.fontSize === 'number') {
      window.electronAPI?.setFontSize(data.fontSize);
    }
    if (typeof data.panelFontSize === 'number') {
      window.electronAPI?.setPanelFontSize(data.panelFontSize);
    }
    if (Array.isArray(data.dbConnections)) {
      setDbConnections(data.dbConnections);
      window.electronAPI?.saveDbConnections(data.dbConnections);
    }
    if (Array.isArray(data.apiSaved)) {
      window.electronAPI?.saveApiSaved(data.apiSaved);
    }

    // Persist the merged app settings
    window.electronAPI?.saveAppSettings({
      theme:          data.appSettings?.theme          ?? themeRef.current,
      lineAltEnabled: data.appSettings?.lineAltEnabled ?? lineAltEnabledRef.current,
      dockLayout:     data.appSettings?.dockLayout     ?? dockLayoutRef.current,
      savedLayouts:   data.appSettings?.savedLayouts   ?? savedLayoutsRef.current,
      pinnedTabs:     data.appSettings?.pinnedTabs     ?? [...pinnedPathsRef.current],
    });

    return result;
  }, []);

  const handleExportHtml = useCallback(async () => {
    const nbId = activeIdRef.current;
    if (!isNotebookId(nbId)) return;
    const nb = notebooksRef.current.find((n) => n.id === nbId);
    if (!nb) return;

    const title = getNotebookDisplayName(nb.path, nb.title, 'notebook');

    const escHtml = (s) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const renderOutput = (msg) => {
      if (msg.type === 'stdout') return `<pre class="out-stdout">${escHtml(msg.content)}</pre>`;
      if (msg.type === 'error') return `<pre class="out-error">${escHtml(msg.message)}</pre>`;
      if (msg.type === 'display') {
        if (msg.format === 'html') return `<div class="out-html">${msg.content}</div>`;
        if (msg.format === 'table' && Array.isArray(msg.content) && msg.content.length > 0) {
          const cols = Object.keys(msg.content[0]);
          const head = cols.map((c) => `<th>${escHtml(c)}</th>`).join('');
          const rows = msg.content.map((r) =>
            `<tr>${cols.map((c) => `<td>${escHtml(r[c])}</td>`).join('')}</tr>`
          ).join('');
          return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
        }
        if (msg.format === 'csv') return `<pre class="out-stdout">${escHtml(msg.content)}</pre>`;
      }
      if (msg.type === 'interrupted') return '<p class="out-error">⏹ Interrupted</p>';
      return '';
    };

    const cellsHtml = nb.cells.map((cell, i) => {
      if (cell.type === 'markdown') {
        return `<div class="md-cell">${marked.parse(cell.content || '')}</div>`;
      }
      const outs = (nb.outputs[cell.id] || []).map(renderOutput).join('');
      return `<div class="code-cell">
  <div class="cell-hdr"><span class="cell-num">[${i + 1}]</span><span class="cell-lang">C#</span></div>
  <pre class="cell-src">${escHtml(cell.content)}</pre>
  ${outs ? `<div class="cell-out">${outs}</div>` : ''}
</div>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;background:#1e1e1e;color:#d4d4d4}
h1,h2,h3,h4{color:#e8e8e8}a{color:#4fc3f7}
code,pre{font-family:Consolas,monospace}code{background:#2a2a2a;padding:2px 5px;border-radius:3px;font-size:.88em}
pre{background:#2a2a2a;padding:12px 16px;border-radius:4px;overflow-x:auto;margin:0}
blockquote{border-left:3px solid #555;margin:0;padding-left:12px;color:#aaa}
table{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0}
th{background:#252525;padding:6px 10px;text-align:left;color:#9cdcfe}
td{padding:5px 10px;border-bottom:1px solid #2d2d2d}
.code-cell{margin:12px 0;border:1px solid #2d2d2d;border-radius:4px;overflow:hidden}
.md-cell{padding:4px 0}
.cell-hdr{background:#252525;padding:4px 12px;display:flex;gap:8px;font-size:11px;color:#666}
.cell-num{color:#555}.cell-lang{color:#569cd6}
.cell-src{background:#1e1e1e;padding:12px 16px;color:#d4d4d4}
.cell-out{padding:8px 12px;border-top:1px solid #2a2a2a}
.out-stdout{color:#d4d4d4;white-space:pre-wrap;font-size:12px;padding:0;background:none}
.out-error{color:#f48771;white-space:pre-wrap;font-size:12px;padding:0;background:none}
.out-html{padding:4px 0}
</style>
</head><body>
<h1>${escHtml(title)}</h1>
${cellsHtml}
</body></html>`;

    await window.electronAPI?.saveFile({
      content: html,
      defaultName: `${title}.html`,
      filters: [{ name: 'HTML File', extensions: ['html'] }],
    });
  }, []);

  const handleCloseTab = useCallback((tabId) => {
    const currentNotebooks = notebooksRef.current;
    const nb = currentNotebooks.find((n) => n.id === tabId);
    if (!nb) return;

    if (nb.path && pinnedPathsRef.current.has(nb.path)) return; // pinned — not closeable

    if (nb.isDirty) {
      if (!window.confirm(`Close "${getNotebookDisplayName(nb.path, nb.title)}" without saving?`)) return;
    }

    // Stop kernel
    window.electronAPI?.stopKernel(tabId);

    // Resolve any pending cell executions with failure
    cancelPendingCells(nb.cells);

    const remaining = currentNotebooks.filter((n) => n.id !== tabId);

    if (remaining.length === 0) {
      const fresh = createNotebook(false);
      window.electronAPI?.startKernel(fresh.id);
      setNotebooks([fresh]);
      setActiveId(fresh.id);
    } else {
      setNotebooks(remaining);
      if (activeIdRef.current === tabId) {
        const idx = currentNotebooks.findIndex((n) => n.id === tabId);
        const newActive = remaining[Math.min(idx, remaining.length - 1)];
        setActiveId(newActive.id);
      }
    }
  }, []);

  const handleOpenDocs = useCallback(() => {
    if (activeIdRef.current !== DOCS_TAB_ID) prevNbIdRef.current = activeIdRef.current;
    setDocsOpen(true);
    setActiveId(DOCS_TAB_ID);
  }, []);

  const handleCloseDocs = useCallback(() => {
    setDocsOpen(false);
    const target = prevNbIdRef.current ?? notebooksRef.current[0]?.id;
    if (target) setActiveId(target);
  }, []);

  const handleReorder = useCallback((dragId, dropId) => {
    setNotebooks((prev) => {
      const from = prev.findIndex((n) => n.id === dragId);
      const to = prev.findIndex((n) => n.id === dropId);
      if (from < 0 || to < 0 || from === to) return prev;
      const result = [...prev];
      const [item] = result.splice(from, 1);
      result.splice(to, 0, item);
      return result;
    });
  }, []);

  // ── NuGet package management ───────────────────────────────────────────────

  const addNugetPackage = useCallback((notebookId, id, version) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    const isReady = nb.kernelStatus === 'ready';
    setNb(notebookId, (n) => {
      if (n.nugetPackages.some((p) => p.id.toLowerCase() === id.toLowerCase())) return {};
      return {
        nugetPackages: [...n.nugetPackages, { id, version: version || null, status: isReady ? 'loading' : 'pending' }],
        isDirty: true,
      };
    });
    if (isReady && window.electronAPI) {
      window.electronAPI.sendToKernel(notebookId, {
        type: 'preload_nugets',
        packages: [{ id, version: version || null }],
        sources: nb.nugetSources.filter((s) => s.enabled).map((s) => s.url),
      });
    }
  }, [setNb]);

  const removeNugetPackage = useCallback((notebookId, id) => {
    setNbDirty(notebookId, (n) => ({
      nugetPackages: n.nugetPackages.filter((p) => p.id !== id),
    }));
  }, [setNbDirty]);

  const retryNugetPackage = useCallback((notebookId, id, version) => {
    if (!window.electronAPI) return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    setNb(notebookId, (n) => ({
      nugetPackages: n.nugetPackages.map((p) =>
        p.id === id ? { ...p, status: 'loading', error: undefined } : p
      ),
    }));
    window.electronAPI.sendToKernel(notebookId, {
      type: 'preload_nugets',
      packages: [{ id, version: version || null }],
      sources: nb.nugetSources.filter((s) => s.enabled).map((s) => s.url),
    });
  }, [setNb]);

  const changeNugetVersion = useCallback((notebookId, id, newVersion) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    const isReady = nb.kernelStatus === 'ready';
    setNb(notebookId, (n) => ({
      nugetPackages: n.nugetPackages.map((p) =>
        p.id === id
          ? { ...p, version: newVersion || null, status: isReady ? 'loading' : 'pending', error: undefined }
          : p
      ),
      isDirty: true,
    }));
    if (isReady && window.electronAPI) {
      window.electronAPI.sendToKernel(notebookId, {
        type: 'preload_nugets',
        packages: [{ id, version: newVersion || null }],
        sources: nb.nugetSources.filter((s) => s.enabled).map((s) => s.url),
      });
    }
  }, [setNb]);

  // ── DB connection management ───────────────────────────────────────────────

  const handleAddDbConnection = useCallback((conn) => {
    setDbConnections((prev) => [...prev, conn]);
  }, []);

  const handleUpdateDbConnection = useCallback((id, updates) => {
    setDbConnections((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const handleRemoveDbConnection = useCallback((id) => {
    setDbConnections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleAttachDb = useCallback((notebookId, connectionId) => {
    const conn = dbConnections.find((c) => c.id === connectionId);
    if (!conn) return;
    const varName = conn.name
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
      .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
      .replace(/^[^a-zA-Z]/, 'db');
    setNb(notebookId, (n) => {
      if (n.attachedDbs.some((d) => d.connectionId === connectionId)) return {};
      return { attachedDbs: [...n.attachedDbs, { connectionId, status: 'connecting', varName, schema: null, error: undefined }] };
    });
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'db_connect',
      connectionId,
      name: conn.name,
      provider: conn.provider,
      connectionString: conn.connectionString,
      varName,
    });
  }, [setNb, dbConnections]);

  const handleDetachDb = useCallback((notebookId, connectionId) => {
    window.electronAPI?.sendToKernel(notebookId, { type: 'db_disconnect', connectionId });
    setNb(notebookId, (n) => ({
      attachedDbs: n.attachedDbs.filter((d) => d.connectionId !== connectionId),
    }));
  }, [setNb]);

  const handleRefreshDb = useCallback((notebookId, connectionId) => {
    setNb(notebookId, (n) => ({
      attachedDbs: n.attachedDbs.map((d) =>
        d.connectionId === connectionId ? { ...d, status: 'connecting' } : d
      ),
    }));
    window.electronAPI?.sendToKernel(notebookId, { type: 'db_refresh', connectionId });
  }, [setNb]);

  const handleRetryDb = useCallback((notebookId, connectionId) => {
    const conn = dbConnections.find((c) => c.id === connectionId);
    if (!conn) return;
    const varName = conn.name
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
      .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
      .replace(/^[^a-zA-Z]/, 'db');
    setNb(notebookId, (n) => ({
      attachedDbs: n.attachedDbs.map((d) =>
        d.connectionId === connectionId ? { ...d, status: 'connecting', error: undefined } : d
      ),
    }));
    window.electronAPI?.sendToKernel(notebookId, {
      type: 'db_connect',
      connectionId,
      name: conn.name,
      provider: conn.provider,
      connectionString: conn.connectionString,
      varName,
    });
  }, [setNb, dbConnections]);

  // ── Dock layout handlers ───────────────────────────────────────────────────

  const handlePanelZoneChange = useCallback((panelId, newZone) => {
    setDockLayout((prev) => {
      const newAssignments = { ...prev.assignments, [panelId]: newZone };
      const newZoneTab = { ...prev.zoneTab, [newZone]: panelId };
      let newFloatPos = prev.floatPos;
      if (newZone === 'float' && !prev.floatPos[panelId]) {
        newFloatPos = { ...prev.floatPos, [panelId]: { x: 200, y: 100, w: DEFAULT_FLOAT_W, h: DEFAULT_FLOAT_H } };
      }
      const updated = { ...prev, assignments: newAssignments, zoneTab: newZoneTab, floatPos: newFloatPos };
      dockLayoutRef.current = updated;
      return updated;
    });
  }, []);

  const handleZoneTabChange = useCallback((zone, panelId) => {
    setDockLayout((prev) => {
      const updated = { ...prev, zoneTab: { ...prev.zoneTab, [zone]: panelId } };
      dockLayoutRef.current = updated;
      return updated;
    });
  }, []);

  // Called when a panel is opened: switches to its tab in its zone and triggers a flash.
  const handleFocusPanel = useCallback((panelId) => {
    const zone = dockLayoutRef.current.assignments[panelId];
    if (zone && zone !== 'float') handleZoneTabChange(zone, panelId);
    setFlashingPanel(panelId);
    setTimeout(() => setFlashingPanel((p) => p === panelId ? null : p), 700);
  }, [handleZoneTabChange]);

  const handlePanelClose = useCallback((panelId) => {
    if (panelId === 'library') { setLibraryPanelOpen(false); return; }
    if (panelId === 'files')   { setFilesPanelOpen(false);   return; }
    if (panelId === 'api')     { setApiPanelOpen(false);     return; }
    const nbId = activeIdRef.current;
    if (isNotebookId(nbId)) {
      const flagMap = { log: 'logPanelOpen', nuget: 'nugetPanelOpen', config: 'configPanelOpen', db: 'dbPanelOpen', vars: 'varsPanelOpen', toc: 'tocPanelOpen', graph: 'graphPanelOpen', todo: 'todoPanelOpen' };
      const flag = flagMap[panelId];
      if (flag) setNb(nbId, { [flag]: false });
    }
  }, [setNb]);

  const handleZoneResizeEnd = useCallback((zone, newSize) => {
    setDockLayout((prev) => {
      const updated = { ...prev, sizes: { ...prev.sizes, [zone]: newSize } };
      dockLayoutRef.current = updated;
      window.electronAPI?.saveAppSettings({
        theme: themeRef.current,
        lineAltEnabled: lineAltEnabledRef.current,
        pinnedTabs: [...pinnedPathsRef.current],
        dockLayout: updated,
        savedLayouts: savedLayoutsRef.current,
      });
      return updated;
    });
  }, []);

  const handleFloatMove = useCallback((panelId, newPos) => {
    setDockLayout((prev) => {
      const updated = { ...prev, floatPos: { ...prev.floatPos, [panelId]: newPos } };
      dockLayoutRef.current = updated;
      return updated;
    });
  }, []);

  // handleStartDrag: called from DockZone tab onMouseDown and FloatPanel grip onMouseDown.
  // Stores the pending drag start position; actual drag is activated after a 6px threshold.
  const handleStartDrag = useCallback((panelId, startX, startY) => {
    pendingDragRef.current = panelId ? { panelId, startX, startY } : null;
  }, []);

  // Document-level mousemove/mouseup replace HTML5 DnD.
  // Avoids the Electron/Chromium bug where dragend fires immediately after dragstart
  // for elements near the bottom edge of the window.
  useEffect(() => {
    const THRESHOLD = 6;

    function getDropZone(x, y) {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (x < 100) return 'left';
      if (x > vw - 100) return 'right';
      if (y > vh - 100) return 'bottom';
      if (Math.abs(x - vw / 2) < 52 && Math.abs(y - vh / 2) < 36) return 'float';
      return null;
    }

    const onMouseMove = (e) => {
      const pending = pendingDragRef.current;
      if (!pending) return;

      if (!draggingPanelRef.current) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
        dockLog('drag-start panel=' + pending.panelId);
        document.body.classList.add('dock-panel-dragging');
        setDraggingPanel(pending.panelId);
        draggingPanelRef.current = pending.panelId;
      }

      const zone = getDropZone(e.clientX, e.clientY);
      if (zone !== hoveredDropZoneRef.current) {
        hoveredDropZoneRef.current = zone;
        setHoveredDropZone(zone);
      }
    };

    const onMouseUp = () => {
      const panelId = draggingPanelRef.current;
      pendingDragRef.current = null;
      document.body.classList.remove('dock-panel-dragging');

      if (panelId !== null) {
        const zone = hoveredDropZoneRef.current;
        dockLog('drop panel=' + panelId + ' zone=' + (zone ?? 'none'));
        hoveredDropZoneRef.current = null;
        setHoveredDropZone(null);
        setDraggingPanel(null);
        draggingPanelRef.current = null;
        if (zone && zone !== dockLayoutRef.current.assignments[panelId]) {
          handlePanelZoneChange(panelId, zone);
          setTimeout(() => {
            window.electronAPI?.saveAppSettings({
              theme: themeRef.current,
              lineAltEnabled: lineAltEnabledRef.current,
              pinnedTabs: [...pinnedPathsRef.current],
              dockLayout: dockLayoutRef.current,
              savedLayouts: savedLayoutsRef.current,
            });
          }, 50);
        }
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
  }, [handlePanelZoneChange]);

  const handleSaveLayout = useCallback((name, layout) => {
    setSavedLayouts((prev) => {
      const exists = prev.findIndex((sl) => sl.name === name);
      const updated = exists >= 0
        ? prev.map((sl, i) => i === exists ? { name, layout } : sl)
        : [...prev, { name, layout }];
      savedLayoutsRef.current = updated;
      window.electronAPI?.saveAppSettings({
        theme: themeRef.current,
        lineAltEnabled: lineAltEnabledRef.current,
        pinnedTabs: [...pinnedPathsRef.current],
        dockLayout: dockLayoutRef.current,
        savedLayouts: updated,
      });
      return updated;
    });
  }, []);

  const handleLoadLayout = useCallback((savedLayout) => {
    const layout = {
      ...DEFAULT_DOCK_LAYOUT,
      ...savedLayout.layout,
      assignments: { ...DEFAULT_DOCK_LAYOUT.assignments, ...(savedLayout.layout.assignments || {}) },
      order:       { ...DEFAULT_DOCK_LAYOUT.order,       ...(savedLayout.layout.order       || {}) },
    };
    setDockLayout(layout);
    dockLayoutRef.current = layout;
    setLayoutKey((k) => k + 1);
    window.electronAPI?.saveAppSettings({
      theme: themeRef.current,
      lineAltEnabled: lineAltEnabledRef.current,
      pinnedTabs: [...pinnedPathsRef.current],
      dockLayout: layout,
      savedLayouts: savedLayoutsRef.current,
    });
  }, []);

  const handleDeleteLayout = useCallback((name) => {
    setSavedLayouts((prev) => {
      const updated = prev.filter((sl) => sl.name !== name);
      savedLayoutsRef.current = updated;
      window.electronAPI?.saveAppSettings({
        theme: themeRef.current,
        lineAltEnabled: lineAltEnabledRef.current,
        pinnedTabs: [...pinnedPathsRef.current],
        dockLayout: dockLayoutRef.current,
        savedLayouts: updated,
      });
      return updated;
    });
  }, []);

  // ── Completions & lint ─────────────────────────────────────────────────────

  const requestCompletions = useCallback((notebookId, code, position) => {
    return new Promise((resolve) => {
      if (!window.electronAPI) return resolve([]);
      const requestId = uuidv4();
      pendingCompletionsRef.current[requestId] = resolve;
      window.electronAPI.sendToKernel(notebookId, { type: 'autocomplete', requestId, code, position });
      setTimeout(() => {
        if (pendingCompletionsRef.current[requestId]) {
          delete pendingCompletionsRef.current[requestId];
          resolve([]);
        }
      }, COMPLETION_TIMEOUT);
    });
  }, []);

  const requestLint = useCallback((notebookId, code) => {
    return new Promise((resolve) => {
      if (!window.electronAPI) return resolve([]);
      const requestId = uuidv4();
      pendingLintRef.current[requestId] = resolve;
      window.electronAPI.sendToKernel(notebookId, { type: 'lint', requestId, code });
      setTimeout(() => {
        if (pendingLintRef.current[requestId]) {
          delete pendingLintRef.current[requestId];
          resolve([]);
        }
      }, LINT_TIMEOUT);
    });
  }, []);

  // ── Menu action dispatch ───────────────────────────────────────────────────

  const menuHandlersRef = useRef({});
  const isNotebook = () => isNotebookId(activeIdRef.current);

  menuHandlersRef.current = {
    new: handleNew,
    open: handleLoad,
    save: () => {
      const id = activeIdRef.current;
      if (isLibEditorId(id)) handleSaveLibEditor(id);
      else handleSave(id);
    },
    'save-as': () => { if (isNotebook()) handleSaveAs(activeIdRef.current); },
    'run-all': () => { if (isNotebook()) runAll(activeIdRef.current); },
    reset: () => { if (isNotebook()) handleReset(activeIdRef.current); },
    'clear-output': () => { if (isNotebook()) setNb(activeIdRef.current, { outputs: {} }); },
    docs: handleOpenDocs,
    'toggle-packages': () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ nugetPanelOpen: !n.nugetPanelOpen })); },
    'toggle-config':   () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ configPanelOpen: !n.configPanelOpen })); },
    'toggle-logs':     () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ logPanelOpen: !n.logPanelOpen })); },
    'toggle-library':  () => setLibraryPanelOpen((v) => !v),
    'toggle-db':       () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ dbPanelOpen: !n.dbPanelOpen })); },
    'toggle-vars':     () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ varsPanelOpen: !n.varsPanelOpen })); },
    'toggle-toc':      () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ tocPanelOpen: !n.tocPanelOpen })); },
    'toggle-files':    () => setFilesPanelOpen((v) => !v),
    'toggle-api':      () => setApiPanelOpen((v) => !v),
    'toggle-graph':    () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ graphPanelOpen: !n.graphPanelOpen })); },
    'toggle-todo':     () => { if (isNotebook()) setNb(activeIdRef.current, (n) => ({ todoPanelOpen: !n.todoPanelOpen })); },
    about: () => setAboutOpen(true),
    settings: () => setSettingsOpen(true),
    'export-html': handleExportHtml,
    'command-palette': () => setCommandPaletteOpen(true),
  };

  // Sync open tabs to main process so it can build the Window menu.
  useEffect(() => {
    if (!window.electronAPI?.updateWindowTabs) return;
    const tabs = [
      ...notebooks.map((nb) => ({
        id: nb.id,
        label: getNotebookDisplayName(nb.path, nb.title),
        isDirty: nb.isDirty,
        isActive: nb.id === activeId,
      })),
      ...libEditors.map((e) => ({
        id: e.id,
        label: e.filename,
        isDirty: e.isDirty,
        isActive: e.id === activeId,
      })),
      ...(docsOpen ? [{ id: DOCS_TAB_ID, label: 'Documentation', isDirty: false, isActive: activeId === DOCS_TAB_ID }] : []),
    ];
    window.electronAPI.updateWindowTabs(tabs);
  }, [notebooks, libEditors, docsOpen, activeId]);

  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return;
    window.electronAPI.onMenuAction((action) => {
      if (action && typeof action === 'object') {
        if (action.type === 'open-recent') { handleOpenRecent(action.path); return; }
        if (action.type === 'activate-tab') {
          const { id } = action;
          setActiveId(id);
          if (isNotebookId(id)) {
            const nbs = notebooksRef.current;
            const nb = nbs.find((n) => n.id === id);
            if (nb) {
              const pinned = nb.path && pinnedPathsRef.current.has(nb.path);
              const first = nbs.find((n) => pinned
                ? (n.path && pinnedPathsRef.current.has(n.path))
                : (!n.path || !pinnedPathsRef.current.has(n.path)));
              if (first && first.id !== id) handleReorder(id, first.id);
            }
          }
          return;
        }
        return;
      }
      menuHandlersRef.current[action]?.();
    });
  }, [handleOpenRecent]);

  // ── Command palette keyboard shortcut ─────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Quit guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onBeforeQuit) return;
    window.electronAPI.onBeforeQuit(() => {
      const dirty = notebooksRef.current.filter((n) => n.isDirty);
      if (dirty.length === 0) {
        window.electronAPI.confirmQuit();
      } else {
        setQuitDirtyNbs(dirty.map((n) => ({ id: n.id, title: n.title, path: n.path })));
      }
    });
  }, []);

  const handleQuitSave = useCallback(async (selectedIds) => {
    setQuitDirtyNbs(null);
    try {
      for (const id of selectedIds) await handleSave(id);
    } finally {
      window.electronAPI?.confirmQuit();
    }
  }, [handleSave]);

  const handleQuitDiscard = useCallback(() => {
    setQuitDirtyNbs(null);
    window.electronAPI?.confirmQuit();
  }, []);

  // ── Panel props + open flags ───────────────────────────────────────────────

  const activeNb = notebooks.find((n) => n.id === activeId) ?? null;

  const openFlags = useMemo(() => ({
    log:     isNotebookId(activeId) ? (activeNb?.logPanelOpen ?? false) : false,
    nuget:   isNotebookId(activeId) ? (activeNb?.nugetPanelOpen ?? false) : false,
    config:  isNotebookId(activeId) ? (activeNb?.configPanelOpen ?? false) : false,
    db:      isNotebookId(activeId) ? (activeNb?.dbPanelOpen ?? false) : false,
    library: libraryPanelOpen,
    vars:    isNotebookId(activeId) ? (activeNb?.varsPanelOpen ?? false) : false,
    toc:     isNotebookId(activeId) ? (activeNb?.tocPanelOpen ?? false) : false,
    files:   filesPanelOpen,
    api:     apiPanelOpen,
    graph:   isNotebookId(activeId) ? (activeNb?.graphPanelOpen ?? false) : false,
    todo:    isNotebookId(activeId) ? (activeNb?.todoPanelOpen ?? false) : false,
  }), [activeId, activeNb, libraryPanelOpen, filesPanelOpen, apiPanelOpen]);

  const panelPropsMap = useMemo(() => {
    const nbId = activeNb?.id ?? null;
    return {
      log: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ logPanelOpen: !n.logPanelOpen })) : () => {},
        currentMemoryMb: activeNb?.memoryHistory?.length
          ? activeNb.memoryHistory[activeNb.memoryHistory.length - 1] : null,
        cells: activeNb?.cells ?? [],
        onNavigateToCell: nbId ? (cellId) => handleNavigateToCell(nbId, cellId) : () => {},
      },
      nuget: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ nugetPanelOpen: !n.nugetPanelOpen })) : () => {},
        packages: activeNb?.nugetPackages ?? [],
        kernelStatus: activeNb?.kernelStatus ?? 'starting',
        sources: activeNb?.nugetSources ?? [],
        onAdd: nbId ? (id, ver) => addNugetPackage(nbId, id, ver) : () => {},
        onRemove: nbId ? (id) => removeNugetPackage(nbId, id) : () => {},
        onRetry: nbId ? (id, ver) => retryNugetPackage(nbId, id, ver) : () => {},
        onChangeVersion: nbId ? (id, ver) => changeNugetVersion(nbId, id, ver) : () => {},
        onAddSource: nbId ? (name, url) => setNbDirty(nbId, (n) => ({
          nugetSources: n.nugetSources.some((s) => s.url === url)
            ? n.nugetSources : [...n.nugetSources, { name, url, enabled: true }],
        })) : () => {},
        onRemoveSource: nbId ? (url) => setNbDirty(nbId, (n) => ({
          nugetSources: n.nugetSources.filter((s) => s.url !== url),
        })) : () => {},
        onToggleSource: nbId ? (url) => setNbDirty(nbId, (n) => ({
          nugetSources: n.nugetSources.map((s) => s.url === url ? { ...s, enabled: !s.enabled } : s),
        })) : () => {},
      },
      config: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ configPanelOpen: !n.configPanelOpen })) : () => {},
        config: activeNb?.config ?? [],
        onAdd: nbId ? (k, v) => setNbDirty(nbId, (n) => ({ config: [...n.config, { key: k, value: v }] })) : () => {},
        onRemove: nbId ? (i) => setNbDirty(nbId, (n) => ({ config: n.config.filter((_, idx) => idx !== i) })) : () => {},
        onUpdate: nbId ? (i, val) => setNbDirty(nbId, (n) => ({
          config: n.config.map((e, idx) => idx === i ? { ...e, value: val } : e),
        })) : () => {},
      },
      db: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ dbPanelOpen: !n.dbPanelOpen })) : () => {},
        connections: dbConnections,
        attachedDbs: activeNb?.attachedDbs ?? [],
        notebookId: nbId,
        onAttach: nbId ? (connId) => handleAttachDb(nbId, connId) : () => {},
        onDetach: nbId ? (connId) => handleDetachDb(nbId, connId) : () => {},
        onRefresh: nbId ? (connId) => handleRefreshDb(nbId, connId) : () => {},
        onRetry: nbId ? (connId) => handleRetryDb(nbId, connId) : () => {},
        onAdd: handleAddDbConnection,
        onUpdate: handleUpdateDbConnection,
        onRemove: handleRemoveDbConnection,
      },
      library: {
        onInsert: handleInsertLibraryFile,
        onClose: () => setLibraryPanelOpen(false),
        onOpenFile: handleOpenLibraryFile,
      },
      vars: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ varsPanelOpen: !n.varsPanelOpen })) : () => {},
        vars: activeNb?.vars ?? [],
        varHistory: activeNb?.varHistory ?? {},
        onInspect: nbId ? (name) => {
          const v = (activeNb?.vars ?? []).find((vv) => vv.name === name);
          setVarInspectDialog({ name, typeName: v?.typeName ?? '', value: v?.value ?? '', notebookId: nbId, fullValue: null });
        } : null,
      },
      toc: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ tocPanelOpen: !n.tocPanelOpen })) : () => {},
        cells: activeNb?.cells ?? [],
      },
      files: {
        onToggle: () => {
          if (!filesPanelOpen && !filesCurrentDir && activeNb?.path) {
            // Navigate to the active notebook's directory on first open
            const p = activeNb.path.replace(/\\/g, '/');
            setFilesCurrentDir(p.slice(0, p.lastIndexOf('/')));
          }
          setFilesPanelOpen((v) => !v);
        },
        currentDir: filesCurrentDir,
        onNavigate: setFilesCurrentDir,
        onOpenNotebook: handleOpenRecent,
        notebookDir: activeNb?.path
          ? (() => { const p = activeNb.path.replace(/\\/g, '/'); return p.slice(0, p.lastIndexOf('/')); })()
          : null,
      },
      api: {
        onToggle: () => setApiPanelOpen((v) => !v),
        onInsert: handleInjectApiCall,
      },
      graph: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ graphPanelOpen: !n.graphPanelOpen })) : () => {},
        varHistory: activeNb?.varHistory ?? {},
      },
      todo: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ todoPanelOpen: !n.todoPanelOpen })) : () => {},
        cells: activeNb?.cells ?? [],
        onNavigateToCell: nbId ? (cellId) => handleNavigateToCell(nbId, cellId) : () => {},
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNb, dbConnections, filesPanelOpen, filesCurrentDir, apiPanelOpen]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const dockZoneProps = {
    dockLayout,
    openFlags,
    panelProps: panelPropsMap,
    onTabChange: handleZoneTabChange,
    onPanelClose: handlePanelClose,
    onStartDrag: handleStartDrag,
    onResizeEnd: handleZoneResizeEnd,
    flashingPanel,
  };

  return (
    <div id="app">
      <TabBar
        notebooks={notebooks}
        activeId={activeId}
        onActivate={setActiveId}
        onClose={handleCloseTab}
        onNew={handleNew}
        onRename={handleRenameTab}
        onReorder={handleReorder}
        onSetColor={handleSetTabColor}
        activeTabColor={notebooks.find((n) => n.id === activeId)?.color ?? null}
        docsOpen={docsOpen}
        onActivateDocs={handleOpenDocs}
        onCloseDocs={handleCloseDocs}
        libEditors={libEditors}
        onCloseLibEditor={handleCloseLibEditor}
        pinnedPaths={pinnedPaths}
        onTogglePin={handleTogglePin}
      />
      <div className="dock-workspace" key={layoutKey}>
        <DockZone zone="left" {...dockZoneProps} />
        <div className="dock-center-col">
          <div className="dock-content-row">
            <div id="notebooks-container">
              {notebooks.map((notebook) => (
                <div
                  key={notebook.id}
                  className="notebook-pane"
                  data-nb={notebook.id}
                  style={notebook.id === activeId ? undefined : { display: 'none' }}
                >
                  <NotebookView
                    nb={notebook}
                    onSetNb={(updater) => setNb(notebook.id, updater)}
                    onSetNbDirty={(updater) => setNbDirty(notebook.id, updater)}
                    onRunCell={runCell}
                    onRunAll={runAll}
                    onInterrupt={handleInterrupt}
                    onRunFrom={runFrom}
                    onRunTo={runTo}
                    onSave={handleSave}
                    onLoad={handleLoad}
                    onReset={handleReset}
                    onRename={(newName) => handleRenameTab(notebook.id, newName)}
                    requestCompletions={requestCompletions}
                    requestLint={requestLint}
                    libraryPanelOpen={libraryPanelOpen}
                    onToggleLibrary={() => {
                      if (!libraryPanelOpen) handleFocusPanel('library');
                      setLibraryPanelOpen((v) => !v);
                    }}
                    filesPanelOpen={filesPanelOpen}
                    onToggleFiles={() => {
                      if (!filesPanelOpen) handleFocusPanel('files');
                      panelPropsMap.files.onToggle();
                    }}
                    apiPanelOpen={apiPanelOpen}
                    onToggleApi={() => {
                      if (!apiPanelOpen) handleFocusPanel('api');
                      setApiPanelOpen((v) => !v);
                    }}
                    onFocusPanel={handleFocusPanel}
                    theme={theme}
                    onThemeChange={setTheme}
                    lineAltEnabled={lineAltEnabled}
                    onLineAltChange={setLineAltEnabled}
                    dockLayout={dockLayout}
                    savedLayouts={savedLayouts}
                    onSaveLayout={handleSaveLayout}
                    onLoadLayout={handleLoadLayout}
                    onDeleteLayout={handleDeleteLayout}
                  />
                </div>
              ))}
              {libEditors.map((editor) => (
                <div
                  key={editor.id}
                  className="notebook-pane"
                  style={editor.id === activeId ? undefined : { display: 'none' }}
                >
                  <LibraryEditorPane
                    editor={editor}
                    onContentChange={handleLibEditorChange}
                    onSave={handleSaveLibEditor}
                  />
                </div>
              ))}
              {docsOpen && (
                <div
                  className="notebook-pane"
                  style={activeId === DOCS_TAB_ID ? undefined : { display: 'none' }}
                >
                  <DocsPanel />
                </div>
              )}
            </div>
            <DockZone zone="right" {...dockZoneProps} />
          </div>
          <DockZone zone="bottom" {...dockZoneProps} />
        </div>
      </div>
      <StatusBar notebooks={notebooks} activeId={activeId} />
      {Object.entries(dockLayout.assignments)
        .filter(([panelId, z]) => z === 'float' && !!openFlags[panelId])
        .map(([panelId]) => {
          const p = panelPropsMap[panelId];
          if (!p) return null;
          const pos = dockLayout.floatPos[panelId] ?? { x: 200, y: 100, w: DEFAULT_FLOAT_W, h: DEFAULT_FLOAT_H };
          return (
            <FloatPanel key={panelId} panelId={panelId} pos={pos} onMove={handleFloatMove} onClose={handlePanelClose} onStartDrag={handleStartDrag} flashing={flashingPanel === panelId}>
              {renderPanelContent(panelId, { ...p, isOpen: true })}
            </FloatPanel>
          );
        })}
      <DockDropOverlay
        active={!!draggingPanel}
        sourceZone={draggingPanel ? dockLayout.assignments[draggingPanel] : null}
        hovered={hoveredDropZone}
      />
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          fontSize={fontSize}
          onThemeChange={setTheme}
          onFontSizeChange={(size) => window.electronAPI?.setFontSize(size)}
          panelFontSize={panelFontSize}
          onPanelFontSizeChange={(size) => window.electronAPI?.setPanelFontSize(size)}
          lineAltEnabled={lineAltEnabled}
          onLineAltChange={setLineAltEnabled}
          pinnedPaths={pinnedPaths}
          onUnpin={handleTogglePin}
          onExport={handleExportSettings}
          onImport={handleImportSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {quitDirtyNbs && (
        <QuitDialog
          dirtyNbs={quitDirtyNbs}
          onSaveSelected={handleQuitSave}
          onDiscardAll={handleQuitDiscard}
          onCancel={() => setQuitDirtyNbs(null)}
        />
      )}
      {commandPaletteOpen && (
        <CommandPalette
          onExecute={(id) => menuHandlersRef.current[id]?.()}
          onClose={() => setCommandPaletteOpen(false)}
        />
      )}
      {varInspectDialog && (
        <VarInspectDialog
          name={varInspectDialog.name}
          typeName={varInspectDialog.typeName}
          value={varInspectDialog.value}
          fullValue={varInspectDialog.fullValue}
          onLoadFull={() => {
            const nbId = varInspectDialog.notebookId;
            if (nbId) window.electronAPI?.sendToKernel(nbId, { type: 'var_inspect', name: varInspectDialog.name });
          }}
          onClose={() => setVarInspectDialog(null)}
        />
      )}
    </div>
  );
}
