import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { DOCS_TAB_ID } from '../constants.js';
import {
  makeLibEditorId, isLibEditorId, isNotebookId, getNotebookDisplayName,
} from '../utils.js';
import { DEFAULT_DOCK_LAYOUT, DEFAULT_FLOAT_W, DEFAULT_FLOAT_H } from '../config/dock-layout.jsx';
import { useNotebookManager } from '../hooks/useNotebookManager.js';
import { useKernelManager } from '../hooks/useKernelManager.js';
import { useDockLayout } from '../hooks/useDockLayout.js';
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

export function App() {
  // ── UI settings ────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState('kl1nt');
  const isFirstThemeRender = useRef(true);
  const themeRef = useRef('kl1nt');
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const [lineAltEnabled, setLineAltEnabled] = useState(true);
  const lineAltEnabledRef = useRef(true);
  useEffect(() => { lineAltEnabledRef.current = lineAltEnabled; }, [lineAltEnabled]);

  const [lintEnabled, setLintEnabled] = useState(true);
  const lintEnabledRef = useRef(true);
  useEffect(() => { lintEnabledRef.current = lintEnabled; }, [lintEnabled]);

  const [customShortcuts, setCustomShortcuts] = useState({});
  const customShortcutsRef = useRef({});
  useEffect(() => { customShortcutsRef.current = customShortcuts; }, [customShortcuts]);

  const [fontSize, setFontSizeState] = useState(12.6);
  const fontSizeRef = useRef(12.6);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);

  const [panelFontSize, setPanelFontSizeState] = useState(11.5);
  const panelFontSizeRef = useRef(11.5);
  useEffect(() => { panelFontSizeRef.current = panelFontSize; }, [panelFontSize]);

  // ── Dialogs ────────────────────────────────────────────────────────────────
  const [quitDirtyNbs, setQuitDirtyNbs] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [varInspectDialog, setVarInspectDialog] = useState(null);

  // ── Panel / pane states ────────────────────────────────────────────────────
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen]     = useState(false);
  const [apiPanelOpen, setApiPanelOpen]         = useState(false);
  const [filesCurrentDir, setFilesCurrentDir]   = useState(null);
  const [libEditors, setLibEditors] = useState([]);
  const libEditorsRef = useRef([]);
  useEffect(() => { libEditorsRef.current = libEditors; }, [libEditors]);

  // ── DB connections ─────────────────────────────────────────────────────────
  const [dbConnections, setDbConnections] = useState([]);
  const dbConnectionsRef = useRef([]);
  useEffect(() => { dbConnectionsRef.current = dbConnections; }, [dbConnections]);

  // ── Cross-hook bridge refs ─────────────────────────────────────────────────
  const saveSettingsRef       = useRef(() => {});
  const cancelPendingCellsRef = useRef(() => {});

  // ── Custom hooks ───────────────────────────────────────────────────────────

  const {
    notebooks, setNotebooks, activeId, setActiveId, docsOpen,
    pinnedPaths, setPinnedPaths, notebooksRef, activeIdRef, pinnedPathsRef,
    setNb, setNbDirty, buildNotebookData,
    handleNew, handleLoad, handleOpenRecent, handleCloseTab, handleReorder,
    handleRenameTab, handleSetTabColor, handleSave, handleSaveAs, handleExportHtml,
    handleOpenDocs, handleCloseDocs, handleTogglePin, handleNavigateToCell,
    handleInsertLibraryFile, handleInjectApiCall, openPinnedNotebooks,
  } = useNotebookManager({ cancelPendingCellsRef, saveSettingsRef });

  // ── Panel visibility (shared by close button, menu, and kernel messages) ─────

  const setPanelVisible = useCallback((panelId, open) => {
    // open: true = open, false = close, null = toggle
    const globalSetters = { library: setLibraryPanelOpen, files: setFilesPanelOpen, api: setApiPanelOpen };
    const nbFlagMap = {
      log: 'logPanelOpen', nuget: 'nugetPanelOpen', config: 'configPanelOpen',
      db: 'dbPanelOpen', vars: 'varsPanelOpen', toc: 'tocPanelOpen',
      graph: 'graphPanelOpen', todo: 'todoPanelOpen',
    };
    if (globalSetters[panelId]) {
      globalSetters[panelId](open === null ? (v) => !v : open);
    } else {
      const flag = nbFlagMap[panelId];
      const nbId = activeIdRef.current;
      if (flag && isNotebookId(nbId))
        setNb(nbId, open === null ? (n) => ({ [flag]: !n[flag] }) : { [flag]: open });
    }
  }, [setNb, setLibraryPanelOpen, setFilesPanelOpen, setApiPanelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const { runCell, runAll, runFrom, runTo, handleInterrupt, handleReset,
          requestCompletions, requestLint, cancelPendingCells } =
    useKernelManager({ setNb, notebooksRef, dbConnectionsRef, setVarInspectDialog, onPanelVisible: setPanelVisible, setDbConnections });
  cancelPendingCellsRef.current = cancelPendingCells;

  const {
    dockLayout, setDockLayout, savedLayouts, setSavedLayouts,
    draggingPanel, hoveredDropZone, layoutKey, flashingPanel,
    dockLayoutRef, savedLayoutsRef,
    handlePanelZoneChange, handleZoneTabChange, handleFocusPanel,
    handleZoneResizeEnd, handleFloatMove, handleStartDrag,
    handleSaveLayout, handleLoadLayout, handleDeleteLayout,
  } = useDockLayout({ saveSettingsRef });

  // Wire up the settings-persist function. Called by hooks and effects whenever
  // settings need persisting. Reads all state from stable refs in one place.
  saveSettingsRef.current = () => {
    window.electronAPI?.saveAppSettings({
      theme: themeRef.current,
      lineAltEnabled: lineAltEnabledRef.current,
      lintEnabled: lintEnabledRef.current,
      customShortcuts: customShortcutsRef.current,
      pinnedTabs: [...pinnedPathsRef.current],
      dockLayout: dockLayoutRef.current,
      savedLayouts: savedLayoutsRef.current,
    });
  };

  // ── DB connections: load on mount, persist on change ──────────────────────
  useEffect(() => {
    window.electronAPI?.loadDbConnections().then((list) => {
      if (Array.isArray(list)) setDbConnections(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    window.electronAPI?.saveDbConnections(dbConnections);
  }, [dbConnections]);

  // ── App settings: load on mount ───────────────────────────────────────────
  useEffect(() => {
    window.electronAPI?.loadAppSettings().then((s) => {
      if (s?.theme) setTheme(s.theme);
      if (typeof s?.lineAltEnabled === 'boolean') setLineAltEnabled(s.lineAltEnabled);
      if (typeof s?.lintEnabled === 'boolean') setLintEnabled(s.lintEnabled);
      if (s?.customShortcuts && typeof s.customShortcuts === 'object') {
        setCustomShortcuts(s.customShortcuts);
        window.electronAPI?.rebuildMenu(s.customShortcuts);
      }
      if (s?.dockLayout) {
        setDockLayout({
          ...DEFAULT_DOCK_LAYOUT,
          ...s.dockLayout,
          assignments: { ...DEFAULT_DOCK_LAYOUT.assignments, ...(s.dockLayout.assignments || {}) },
          order:       { ...DEFAULT_DOCK_LAYOUT.order,       ...(s.dockLayout.order       || {}) },
        });
      }
      if (Array.isArray(s?.savedLayouts)) setSavedLayouts(s.savedLayouts);
      const pinned = Array.isArray(s?.pinnedTabs) ? s.pinnedTabs : [];
      if (pinned.length > 0) openPinnedNotebooks(pinned);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Theme + lineAlt: apply to DOM, persist on change ─────────────────────
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.classList.toggle('line-alt-enabled', lineAltEnabled); }, [lineAltEnabled]);

  useEffect(() => {
    if (isFirstThemeRender.current) { isFirstThemeRender.current = false; return; }
    saveSettingsRef.current();
  }, [theme]); // pinnedPathsRef / dockLayoutRef are stable refs, no dep needed

  useEffect(() => {
    saveSettingsRef.current();
  }, [lineAltEnabled]);

  useEffect(() => {
    saveSettingsRef.current();
  }, [lintEnabled]);

  const handleShortcutsChange = useCallback((id, combo) => {
    setCustomShortcuts((prev) => {
      const next = { ...prev };
      if (combo == null) delete next[id]; else next[id] = combo;
      customShortcutsRef.current = next;
      saveSettingsRef.current();
      window.electronAPI?.rebuildMenu(next);
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DB reconnect when connections first load ───────────────────────────────
  useEffect(() => {
    if (dbConnections.length === 0) return;
    for (const nb of notebooksRef.current) {
      if (nb.kernelStatus !== 'ready') continue;
      for (const d of nb.attachedDbs.filter((d) => d.status === 'connecting')) {
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

  // ── Auto-save when DB attachment state changes ────────────────────────────
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
        const data = buildNotebookData(nb.id);
        if (data) window.electronAPI?.saveNotebookTo(nb.path, data);
      }
      prevDbReadyRef.current[nb.id] = curr;
    }
  }, [notebooks, buildNotebookData]);

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
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DB connection management ───────────────────────────────────────────────

  const handleAddDbConnection    = useCallback((conn) => {
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
      type: 'db_connect', connectionId,
      name: conn.name, provider: conn.provider,
      connectionString: conn.connectionString, varName,
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
      type: 'db_connect', connectionId,
      name: conn.name, provider: conn.provider,
      connectionString: conn.connectionString, varName,
    });
  }, [setNb, dbConnections]);

  // ── Lib editor handlers ────────────────────────────────────────────────────

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
  }, [setActiveId]);

  const handleCloseLibEditor = useCallback((id) => {
    const editor = libEditorsRef.current.find((e) => e.id === id);
    if (!editor) return;
    if (editor.isDirty && !window.confirm(`Close "${editor.filename}" without saving?`)) return;
    setLibEditors((prev) => prev.filter((e) => e.id !== id));
    if (activeIdRef.current === id) {
      const nbs = notebooksRef.current;
      setActiveId(nbs[nbs.length - 1]?.id ?? null);
    }
  }, [setActiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLibEditorChange = useCallback((id, newContent) => {
    setLibEditors((prev) => prev.map((e) => e.id === id ? { ...e, content: newContent, isDirty: true } : e));
  }, []);

  const handleSaveLibEditor = useCallback(async (id) => {
    const editor = libEditorsRef.current.find((e) => e.id === id);
    if (!editor || !window.electronAPI) return;
    await window.electronAPI.saveLibraryFile(editor.fullPath, editor.content);
    setLibEditors((prev) => prev.map((e) => e.id === id ? { ...e, isDirty: false } : e));
  }, []);

  // ── Panel close ────────────────────────────────────────────────────────────

  const handlePanelClose = useCallback((panelId) => setPanelVisible(panelId, false), [setPanelVisible]);

  // ── Settings export / import ───────────────────────────────────────────────

  const handleExportSettings = useCallback(async () => {
    const apiSaved = await window.electronAPI?.loadApiSaved() ?? [];
    return window.electronAPI?.exportSettings({
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
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    }
    if (Array.isArray(data.appSettings?.savedLayouts)) setSavedLayouts(data.appSettings.savedLayouts);
    if (Array.isArray(data.appSettings?.pinnedTabs))   setPinnedPaths(new Set(data.appSettings.pinnedTabs));
    if (typeof data.fontSize === 'number')      window.electronAPI?.setFontSize(data.fontSize);
    if (typeof data.panelFontSize === 'number') window.electronAPI?.setPanelFontSize(data.panelFontSize);
    if (Array.isArray(data.dbConnections)) {
      setDbConnections(data.dbConnections);
      window.electronAPI?.saveDbConnections(data.dbConnections);
    }
    if (Array.isArray(data.apiSaved)) window.electronAPI?.saveApiSaved(data.apiSaved);

    window.electronAPI?.saveAppSettings({
      theme:          data.appSettings?.theme          ?? themeRef.current,
      lineAltEnabled: data.appSettings?.lineAltEnabled ?? lineAltEnabledRef.current,
      dockLayout:     data.appSettings?.dockLayout     ?? dockLayoutRef.current,
      savedLayouts:   data.appSettings?.savedLayouts   ?? savedLayoutsRef.current,
      pinnedTabs:     data.appSettings?.pinnedTabs     ?? [...pinnedPathsRef.current],
    });
    return result;
  }, [setDockLayout, setSavedLayouts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Quit handlers ──────────────────────────────────────────────────────────

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

  // ── Menu action dispatch ───────────────────────────────────────────────────

  const menuHandlersRef = useRef({});
  const isNotebook = () => isNotebookId(activeIdRef.current);

  menuHandlersRef.current = {
    new:  handleNew,
    open: handleLoad,
    save: () => {
      const id = activeIdRef.current;
      if (isLibEditorId(id)) handleSaveLibEditor(id);
      else handleSave(id);
    },
    'save-as':         () => { if (isNotebook()) handleSaveAs(activeIdRef.current); },
    'run-all':         () => { if (isNotebook()) runAll(activeIdRef.current); },
    reset:             () => { if (isNotebook()) handleReset(activeIdRef.current); },
    'clear-output':    () => { if (isNotebook()) setNb(activeIdRef.current, { outputs: {} }); },
    docs:              handleOpenDocs,
    'toggle-packages': () => setPanelVisible('nuget',   null),
    'toggle-config':   () => setPanelVisible('config',  null),
    'toggle-logs':     () => setPanelVisible('log',     null),
    'toggle-library':  () => setPanelVisible('library', null),
    'toggle-db':       () => setPanelVisible('db',      null),
    'toggle-vars':     () => setPanelVisible('vars',    null),
    'toggle-toc':      () => setPanelVisible('toc',     null),
    'toggle-files':    () => setPanelVisible('files',   null),
    'toggle-api':      () => setPanelVisible('api',     null),
    'toggle-graph':    () => setPanelVisible('graph',   null),
    'toggle-todo':     () => setPanelVisible('todo',    null),
    about:             () => setAboutOpen(true),
    settings:          () => setSettingsOpen(true),
    'export-html':     handleExportHtml,
    'command-palette': () => setCommandPaletteOpen(true),
  };

  // ── Window tabs sync ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.updateWindowTabs) return;
    window.electronAPI.updateWindowTabs([
      ...notebooks.map((nb) => ({
        id: nb.id,
        label: getNotebookDisplayName(nb.path, nb.title),
        isDirty: nb.isDirty,
        isActive: nb.id === activeId,
      })),
      ...libEditors.map((e) => ({
        id: e.id, label: e.filename, isDirty: e.isDirty, isActive: e.id === activeId,
      })),
      ...(docsOpen ? [{ id: DOCS_TAB_ID, label: 'Documentation', isDirty: false, isActive: activeId === DOCS_TAB_ID }] : []),
    ]);
  }, [notebooks, libEditors, docsOpen, activeId]);

  // ── Menu action handler ────────────────────────────────────────────────────
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
            const nb  = nbs.find((n) => n.id === id);
            if (nb) {
              const pinned = nb.path && pinnedPathsRef.current.has(nb.path);
              const first  = nbs.find((n) => pinned
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
  }, [handleOpenRecent]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Panel props + open flags ───────────────────────────────────────────────

  const activeNb = notebooks.find((n) => n.id === activeId) ?? null;

  const openFlags = useMemo(() => ({
    log:     isNotebookId(activeId) ? (activeNb?.logPanelOpen    ?? false) : false,
    nuget:   isNotebookId(activeId) ? (activeNb?.nugetPanelOpen  ?? false) : false,
    config:  isNotebookId(activeId) ? (activeNb?.configPanelOpen ?? false) : false,
    db:      isNotebookId(activeId) ? (activeNb?.dbPanelOpen     ?? false) : false,
    library: libraryPanelOpen,
    vars:    isNotebookId(activeId) ? (activeNb?.varsPanelOpen   ?? false) : false,
    toc:     isNotebookId(activeId) ? (activeNb?.tocPanelOpen    ?? false) : false,
    files:   filesPanelOpen,
    api:     apiPanelOpen,
    graph:   isNotebookId(activeId) ? (activeNb?.graphPanelOpen  ?? false) : false,
    todo:    isNotebookId(activeId) ? (activeNb?.todoPanelOpen   ?? false) : false,
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
        onAdd:           nbId ? (id, ver) => addNugetPackage(nbId, id, ver)    : () => {},
        onRemove:        nbId ? (id)       => removeNugetPackage(nbId, id)     : () => {},
        onRetry:         nbId ? (id, ver)  => retryNugetPackage(nbId, id, ver) : () => {},
        onChangeVersion: nbId ? (id, ver)  => changeNugetVersion(nbId, id, ver) : () => {},
        onAddSource:    nbId ? (name, url) => setNbDirty(nbId, (n) => ({
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
        onAdd:    nbId ? (k, v) => setNbDirty(nbId, (n) => ({ config: [...n.config, { key: k, value: v }] })) : () => {},
        onRemove: nbId ? (i)    => setNbDirty(nbId, (n) => ({ config: n.config.filter((_, idx) => idx !== i) })) : () => {},
        onUpdate: nbId ? (i, val) => setNbDirty(nbId, (n) => ({
          config: n.config.map((e, idx) => idx === i ? { ...e, value: val } : e),
        })) : () => {},
      },
      db: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ dbPanelOpen: !n.dbPanelOpen })) : () => {},
        connections: dbConnections,
        attachedDbs: activeNb?.attachedDbs ?? [],
        notebookId: nbId,
        onAttach:  nbId ? (connId) => handleAttachDb(nbId, connId)  : () => {},
        onDetach:  nbId ? (connId) => handleDetachDb(nbId, connId)  : () => {},
        onRefresh: nbId ? (connId) => handleRefreshDb(nbId, connId) : () => {},
        onRetry:   nbId ? (connId) => handleRetryDb(nbId, connId)   : () => {},
        onAdd:    handleAddDbConnection,
        onUpdate: handleUpdateDbConnection,
        onRemove: handleRemoveDbConnection,
      },
      library: {
        onInsert:   handleInsertLibraryFile,
        onClose:    () => setLibraryPanelOpen(false),
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
        onClearGraph: nbId ? () => setNb(nbId, { varHistory: {} }) : null,
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
    onTabChange:  handleZoneTabChange,
    onPanelClose: handlePanelClose,
    onStartDrag:  handleStartDrag,
    onResizeEnd:  handleZoneResizeEnd,
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
                    lintEnabled={lintEnabled}
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
          lintEnabled={lintEnabled}
          onLintEnabledChange={setLintEnabled}
          customShortcuts={customShortcuts}
          onShortcutsChange={handleShortcutsChange}
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
