import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { DOCS_TAB_ID, CHANGELOG_TAB_ID, KAFKA_TAB_ID, PANEL_TAB_PREFIX } from '../constants.js';
import {
  makeLibEditorId, isLibEditorId, isNotebookId, isPanelTabId, getNotebookDisplayName, generateDockerCompose, makePanelTabId,
} from '../utils.js';
import { DEFAULT_DOCK_LAYOUT, DEFAULT_FLOAT_W, DEFAULT_FLOAT_H } from '../config/dock-layout.jsx';
import { TablePageSizeContext } from '../config/table-page-size-context.js';
import { useNotebookManager } from '../hooks/useNotebookManager.js';
import { useKernelManager } from '../hooks/useKernelManager.js';
import { useCellScheduler } from '../hooks/useCellScheduler.js';
import { useCellOrchestrator } from '../hooks/useCellOrchestrator.js';
import { useCellDependencies } from '../hooks/useCellDependencies.js';
import { usePipelineManager } from '../hooks/usePipelineManager.js';
import { useDockLayout } from '../hooks/useDockLayout.js';
import { TabBar } from '../components/toolbar/TabBar.jsx';
import { NotebookView } from '../components/NotebookView.jsx';
import { LibraryEditorPane } from '../components/panels/library/LibraryEditorPane.jsx';
import { DocsPanel } from '../components/panels/docs/DocsPanel.jsx';
import { ChangelogPanel } from '../components/panels/ChangelogPanel.jsx';
import { Ghost } from '../components/Ghost.jsx';
import { IdleSkyline } from '../components/IdleSkyline.jsx';
import { KafkaPanel } from '../components/panels/kafka/KafkaPanel.jsx';
import { DockZone } from '../components/dock/DockZone.jsx';
import { FloatPanel } from '../components/dock/FloatPanel.jsx';
import { DockDropOverlay } from '../components/dock/DockDropOverlay.jsx';
import { QuitDialog } from '../components/dialogs/QuitDialog.jsx';
import { AboutDialog } from '../components/dialogs/AboutDialog.jsx';
import { SettingsDialog } from '../components/dialogs/SettingsDialog.jsx';
import { CommandPalette } from '../components/dialogs/CommandPalette.jsx';
import { VarInspectDialog } from '../components/dialogs/VarInspectDialog.jsx';
import { DbConnectionDialog } from '../components/dialogs/DbConnectionDialog.jsx';
import { NewNotebookDialog } from '../components/dialogs/NewNotebookDialog.jsx';
import { ExportAppDialog } from '../components/dialogs/ExportAppDialog.jsx';
import { PassphraseDialog } from '../components/dialogs/PassphraseDialog.jsx';
import { CredentialsDialog } from '../components/dialogs/CredentialsDialog.jsx';
import { KeyboardShortcutsOverlay } from '../components/dialogs/KeyboardShortcutsOverlay.jsx';
import { StatusBar } from './StatusBar.jsx';
import { renderPanelContent } from '../components/dock/renderPanelContent.jsx';
import { makeCell } from '../notebook-factory.js';
import { panelTabsAfterDetach, panelTabsAfterReturn, panelTabsAfterNotebookClosed } from './panel-tabs.js';

// Maps a panel id to its corresponding boolean flag on the notebook state.
// The mapping is mostly trivial (`${panelId}PanelOpen`) but `api-editor`
// uses camelCase (`apiEditorPanelOpen`), so a centralised lookup avoids
// drift between setPanelVisible and the panel-tab return path.
const PANEL_NB_FLAG = {
  log: 'logPanelOpen', nuget: 'nugetPanelOpen', config: 'configPanelOpen',
  db: 'dbPanelOpen', vars: 'varsPanelOpen', toc: 'tocPanelOpen',
  graph: 'graphPanelOpen', todo: 'todoPanelOpen', regex: 'regexPanelOpen',
  history: 'historyPanelOpen', deps: 'depsPanelOpen', embed: 'embedPanelOpen', profile: 'profilePanelOpen',
  library: 'libraryPanelOpen', files: 'filesPanelOpen', api: 'apiPanelOpen',
  'api-editor': 'apiEditorPanelOpen', git: 'gitPanelOpen',
};

// One pane per detached panel-tab. The pane derives its props from the
// notebook the panel was popped out of, not the currently active one — so
// switching between notebook tabs no longer swaps the panel's data.
function PanelTabPane({ panelId, notebook, buildPanelProps, isActive }) {
  const props = useMemo(() => buildPanelProps(notebook), [buildPanelProps, notebook]);
  if (!notebook) return null;  // owner notebook was closed — see closeNotebookPanelTabs cleanup
  const p = props[panelId];
  return (
    <div className="notebook-pane" style={isActive ? undefined : { display: 'none' }}>
      {p && renderPanelContent(panelId, { ...p, isOpen: true })}
    </div>
  );
}

export function App() {
  // ── UI settings ────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState('kl1nt');
  const isFirstThemeRender  = useRef(true);
  const settingsLoadedRef   = useRef(false);
  const themeRef = useRef('kl1nt');
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const [lineAltEnabled, setLineAltEnabled] = useState(true);
  const lineAltEnabledRef = useRef(true);
  useEffect(() => { lineAltEnabledRef.current = lineAltEnabled; }, [lineAltEnabled]);

  const [lintEnabled, setLintEnabled] = useState(true);
  const [strongCuesEnabled, setStrongCuesEnabled] = useState(false);
  const [formatOnSave, setFormatOnSave] = useState(false);
  const lintEnabledRef = useRef(true);
  useEffect(() => { lintEnabledRef.current = lintEnabled; }, [lintEnabled]);
  const strongCuesRef = useRef(false);
  useEffect(() => { strongCuesRef.current = strongCuesEnabled; }, [strongCuesEnabled]);
  const formatOnSaveRef = useRef(false);
  useEffect(() => { formatOnSaveRef.current = formatOnSave; }, [formatOnSave]);

  const [showFish, setShowFish] = useState(true);
  const showFishRef = useRef(true);
  useEffect(() => { showFishRef.current = showFish; }, [showFish]);
  const [showCircuit, setShowCircuit] = useState(true);
  const showCircuitRef = useRef(true);
  useEffect(() => { showCircuitRef.current = showCircuit; }, [showCircuit]);
  const [showGhost, setShowGhost] = useState(true);
  const showGhostRef = useRef(true);
  useEffect(() => { showGhostRef.current = showGhost; }, [showGhost]);
  const [showSkyline, setShowSkyline] = useState(true);
  const showSkylineRef = useRef(true);
  useEffect(() => { showSkylineRef.current = showSkyline; }, [showSkyline]);
  const skylineTriggerRef = useRef(null);

  const [notebookBg, setNotebookBg] = useState('none');
  const notebookBgRef = useRef('none');
  useEffect(() => { notebookBgRef.current = notebookBg; }, [notebookBg]);
  const [notebookBgOpacity, setNotebookBgOpacity] = useState(0.15);
  const notebookBgOpacityRef = useRef(0.15);
  useEffect(() => { notebookBgOpacityRef.current = notebookBgOpacity; }, [notebookBgOpacity]);
  const [notebookBgTint, setNotebookBgTint] = useState(false);
  const notebookBgTintRef = useRef(false);
  useEffect(() => { notebookBgTintRef.current = notebookBgTint; }, [notebookBgTint]);

  const [tablePageSize, setTablePageSize] = useState(10);
  const tablePageSizeRef = useRef(10);
  useEffect(() => { tablePageSizeRef.current = tablePageSize; }, [tablePageSize]);

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
  const [newNbDialogOpen, setNewNbDialogOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [varInspectDialog, setVarInspectDialog] = useState(null);
  const [dbConnDialog, setDbConnDialog] = useState(null); // null | connection object (edit) | opened with null (new)
  const [exportAppOpen, setExportAppOpen] = useState(false);
  const [viewerMode, setViewerMode] = useState(null);
  const [passphraseDialogOpen, setPassphraseDialogOpen] = useState(false);
  const [credentialsDialogData, setCredentialsDialogData] = useState(null);

  const [dashboardMode, setDashboardMode] = useState(false);
  const [highlightedCellIds, setHighlightedCellIds] = useState(null);

  // ── Panel / pane states ────────────────────────────────────────────────────
  const [apiEditorRequestedId, setApiEditorRequestedId] = useState(null);
  const [gitRefreshKey, setGitRefreshKey]       = useState(0);
  const [filesCurrentDir, setFilesCurrentDir]   = useState(null);
  const [favoriteFolders, setFavoriteFolders]   = useState([]);
  const favoriteFoldersRef = useRef([]);
  useEffect(() => { favoriteFoldersRef.current = favoriteFolders; }, [favoriteFolders]);
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
    handleNew, handleLoad, handleImportPolyglot, handleOpenRecent, handleCloseTab, handleReorder,
    handleRenameTab, handleSetTabColor, handleSave, handleSaveAs, handleExportHtml, handleExportGoogleDoc,
    handleOpenDocs, handleCloseDocs,
    changelogOpen, handleOpenChangelog, handleCloseChangelog,
    kafkaTabOpen, handleOpenKafkaTab, handleCloseKafkaTab,
    handleTogglePin, handleNavigateToCell,
    handleInsertLibraryFile, handleImportData, openPinnedNotebooks,
    handleRetainOutput, handleUnretainOutput,
  } = useNotebookManager({ cancelPendingCellsRef, saveSettingsRef, formatOnSaveRef });

  const {
    dockLayout, setDockLayout, savedLayouts, setSavedLayouts,
    draggingPanel, hoveredDropZone, layoutKey, flashingPanel,
    dockLayoutRef, savedLayoutsRef,
    handlePanelZoneChange, handleZoneTabChange, handleFocusPanel,
    handleZoneResizeEnd, handleFloatMove, handleStartDrag,
    handleSaveLayout, handleLoadLayout, handleDeleteLayout,
  } = useDockLayout({ saveSettingsRef });

  // Map<panelId, notebookId> — each detached panel-tab remembers the
  // notebook it was popped out of, so it keeps showing that notebook's data
  // even when the user switches between notebook tabs, and it pops back
  // into the same notebook's dock zone.
  const [panelTabs, setPanelTabs] = useState(new Map());
  const panelTabsRef = useRef(panelTabs);
  useEffect(() => { panelTabsRef.current = panelTabs; }, [panelTabs]);

  // ── Panel visibility and layout (shared by close button, menu, and kernel messages) ──

  const setPanelVisible = useCallback((panelId, open) => {
    // open: true = open, false = close, null = toggle
    if (panelId === 'kafka') {
      // Kafka always opens as a tab, not a dock panel
      const shouldOpen = open === null ? !kafkaTabOpen : open;
      if (shouldOpen) handleOpenKafkaTab(); else handleCloseKafkaTab();
      return;
    }
    const flag = PANEL_NB_FLAG[panelId];
    const nbId = activeIdRef.current;
    if (flag && isNotebookId(nbId))
      setNbDirty(nbId, open === null ? (n) => ({ [flag]: !n[flag] }) : { [flag]: open });
  }, [setNbDirty, handleOpenKafkaTab, handleCloseKafkaTab, kafkaTabOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPanelDock = useCallback((panelId, zone, size) => {
    setDockLayout((prev) => {
      const assignments = { ...prev.assignments, [panelId]: zone };
      const zoneTab     = { ...prev.zoneTab, [zone]: panelId };
      if (size == null) return { ...prev, assignments, zoneTab };
      const dim = zone === 'bottom' ? window.innerHeight : window.innerWidth;
      const px  = size > 0 && size < 1 ? Math.round(dim * size) : Math.round(size);
      return { ...prev, assignments, zoneTab, sizes: { ...prev.sizes, [zone]: px } };
    });
    saveSettingsRef.current();
  }, [setDockLayout, saveSettingsRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPanelFloat = useCallback((panelId, x, y, w, h) => {
    setDockLayout((prev) => {
      const existing = prev.floatPos[panelId] ?? { x: 200, y: 100, w: DEFAULT_FLOAT_W, h: DEFAULT_FLOAT_H };
      return {
        ...prev,
        assignments: { ...prev.assignments, [panelId]: 'float' },
        floatPos: {
          ...prev.floatPos,
          [panelId]: { x: x ?? existing.x, y: y ?? existing.y, w: w ?? existing.w, h: h ?? existing.h },
        },
      };
    });
    saveSettingsRef.current();
  }, [setDockLayout, saveSettingsRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPanelCloseAll = useCallback(() => {
    const nbId = activeIdRef.current;
    if (isNotebookId(nbId))
      setNbDirty(nbId, () => ({
        logPanelOpen: false, nugetPanelOpen: false, configPanelOpen: false,
        dbPanelOpen: false, varsPanelOpen: false, tocPanelOpen: false,
        graphPanelOpen: false, todoPanelOpen: false, regexPanelOpen: false,
        historyPanelOpen: false, depsPanelOpen: false, embedPanelOpen: false, profilePanelOpen: false,
        libraryPanelOpen: false, filesPanelOpen: false, apiPanelOpen: false,
        apiEditorPanelOpen: false, gitPanelOpen: false,
      }));
  }, [setNbDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Panel-as-tab ──────────────────────────────────────────────────────────
  const detachPanelToTab = useCallback((panelId) => {
    const ownerNbId = activeIdRef.current && !isPanelTabId(activeIdRef.current)
      ? activeIdRef.current
      : notebooksRef.current[0]?.id;
    if (!ownerNbId) return;
    setPanelVisible(panelId, false);
    setPanelTabs((prev) => panelTabsAfterDetach(prev, panelId, ownerNbId));
    setActiveId(makePanelTabId(panelId));
  }, [setPanelVisible, setActiveId]);

  const returnPanelFromTab = useCallback((panelId) => {
    const ids = notebooksRef.current.map((n) => n.id);
    const { next, target } = panelTabsAfterReturn(panelTabsRef.current, panelId, ids);
    setPanelTabs(next);
    if (activeIdRef.current === makePanelTabId(panelId) && target) setActiveId(target);
    // Re-open the panel directly on its bound notebook — no setTimeout/race
    // needed because we know the target nbId without going through activeId.
    const flag = PANEL_NB_FLAG[panelId];
    if (target && flag) setNbDirty(target, () => ({ [flag]: true }));
  }, [setActiveId, setNbDirty]);

  const closePanelTab = useCallback((panelId) => {
    const ids = notebooksRef.current.map((n) => n.id);
    const { next } = panelTabsAfterReturn(panelTabsRef.current, panelId, ids);
    setPanelTabs(next);
    if (activeIdRef.current === makePanelTabId(panelId)) {
      const first = notebooksRef.current[0];
      if (first) setActiveId(first.id);
    }
  }, [setActiveId]);

  const { runCell, runCellWithFormData, runSqlCell, runHttpCell, runShellCell, runDockerCell, runFlociCell, dispatchCellRun, stopDockerCell, pollDockerStatus, fetchDockerLogs, runCheckCell, runDecisionCell, runAll, runFrom, runTo, handleInterrupt, handleReset,
          cancelPendingCells, debugResume, debugStep, toggleBreakpoint } =
    useKernelManager({
      setNb, notebooksRef, dbConnectionsRef, setVarInspectDialog,
      onPanelVisible: setPanelVisible,
      onPanelDock:    setPanelDock,
      onPanelFloat:   setPanelFloat,
      onPanelCloseAll: setPanelCloseAll,
      onApiEditorLoad: (apiIdOrTitle) => {
        setApiEditorRequestedId(apiIdOrTitle);
        setPanelVisible('api-editor', true);
      },
      setDbConnections,
    });
  cancelPendingCellsRef.current = cancelPendingCells;

  const { scheduledCells, startSchedule, stopSchedule, stopAllSchedules,
          scheduledNotebooks, startNotebookSchedule, stopNotebookSchedule } =
    useCellScheduler({ notebooksRef, runCell, runAll });

  // ── Pipeline manager ─────────────────────────────────────────────────────
  const pipelineManager = usePipelineManager({ setNbDirty });

  const handleRunCellByName = useCallback((notebookId, targetName, formData) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    const cell = nb.cells.find((c) => c.name === targetName || c.id === targetName);
    if (cell && cell.type === 'code') runCellWithFormData(notebookId, cell, formData);
  }, [runCellWithFormData]);

  const handleResetWithSchedules = useCallback((notebookId) => {
    stopAllSchedules(notebookId);
    handleReset(notebookId);
  }, [handleReset, stopAllSchedules]);

  const handleCloseTabWithSchedules = useCallback((...args) => {
    // args[0] is the tab id (notebookId) for notebook tabs
    const tabId = args[0];
    if (tabId) stopAllSchedules(tabId);
    // Drop any popped-out panel-tabs that were bound to this notebook —
    // their file is gone, they can't keep showing it.
    setPanelTabs((prev) => {
      const { next, droppedTabIds } = panelTabsAfterNotebookClosed(prev, tabId);
      if (droppedTabIds.includes(activeIdRef.current)) {
        const remaining = notebooksRef.current.filter((n) => n.id !== tabId);
        if (remaining.length > 0) setActiveId(remaining[0].id);
      }
      return next;
    });
    handleCloseTab(...args);
  }, [handleCloseTab, stopAllSchedules, setActiveId]);

  // Wire up the settings-persist function. Called by hooks and effects whenever
  // settings need persisting. Reads all state from stable refs in one place.
  saveSettingsRef.current = () => {
    window.electronAPI?.saveAppSettings({
      theme: themeRef.current,
      lineAltEnabled: lineAltEnabledRef.current,
      lintEnabled: lintEnabledRef.current,
      strongCuesEnabled: strongCuesRef.current,
      formatOnSave: formatOnSaveRef.current,
      showFish: showFishRef.current,
      showCircuit: showCircuitRef.current,
      showGhost: showGhostRef.current,
      showSkyline: showSkylineRef.current,
      notebookBg: notebookBgRef.current,
      notebookBgOpacity: notebookBgOpacityRef.current,
      notebookBgTint: notebookBgTintRef.current,
      tablePageSize: tablePageSizeRef.current,
      customShortcuts: customShortcutsRef.current,
      pinnedTabs: [...pinnedPathsRef.current],
      dockLayout: dockLayoutRef.current,
      savedLayouts: savedLayoutsRef.current,
      favoriteFolders: favoriteFoldersRef.current,
    });
  };

  // ── DB connections + app settings: load in parallel on mount ──────────────
  const dbLoadedRef = useRef(null);
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    Promise.all([
      api.loadDbConnections().catch(() => null),
      api.loadAppSettings().catch(() => null),
    ]).then(([dbList, s]) => {
      // DB connections
      if (Array.isArray(dbList)) {
        dbLoadedRef.current = dbList;
        setDbConnections(dbList);
      }
      // App settings
      if (s?.theme) setTheme(s.theme);
      if (typeof s?.lineAltEnabled === 'boolean') setLineAltEnabled(s.lineAltEnabled);
      if (typeof s?.lintEnabled === 'boolean') setLintEnabled(s.lintEnabled);
      if (typeof s?.strongCuesEnabled === 'boolean') setStrongCuesEnabled(s.strongCuesEnabled);
      if (typeof s?.formatOnSave === 'boolean') setFormatOnSave(s.formatOnSave);
      if (typeof s?.showFish === 'boolean') setShowFish(s.showFish);
      if (typeof s?.showCircuit === 'boolean') setShowCircuit(s.showCircuit);
      else if (typeof s?.showMinigame === 'boolean') setShowCircuit(s.showMinigame);
      if (typeof s?.showGhost === 'boolean') setShowGhost(s.showGhost);
      if (typeof s?.showSkyline === 'boolean') setShowSkyline(s.showSkyline);
      if (s?.notebookBg) setNotebookBg(s.notebookBg);
      if (typeof s?.notebookBgOpacity === 'number') setNotebookBgOpacity(s.notebookBgOpacity);
      if (typeof s?.notebookBgTint === 'boolean') setNotebookBgTint(s.notebookBgTint);
      if (typeof s?.tablePageSize === 'number') setTablePageSize(s.tablePageSize);
      if (s?.customShortcuts && typeof s.customShortcuts === 'object') {
        setCustomShortcuts(s.customShortcuts);
        api.rebuildMenu(s.customShortcuts);
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
      if (Array.isArray(s?.favoriteFolders)) setFavoriteFolders(s.favoriteFolders);
      settingsLoadedRef.current = true;
      const pinned = (!viewerMode && Array.isArray(s?.pinnedTabs)) ? s.pinnedTabs : [];
      if (pinned.length > 0) {
        openPinnedNotebooks(pinned);
      } else {
        // No pinned tabs — focus a random existing notebook
        const nbs = notebooksRef.current;
        if (nbs.length > 0) {
          const pick = nbs[Math.floor(Math.random() * nbs.length)];
          setActiveId(pick.id);
        }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Skip the initial empty state and the freshly-loaded data.
    if (dbConnections === dbLoadedRef.current || dbConnections.length === 0) return;
    window.electronAPI?.saveDbConnections(dbConnections);
  }, [dbConnections]);

  // ── Auto-save: write .bak for dirty notebooks every 60s ──────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      for (const nb of notebooksRef.current) {
        if (nb.isDirty && nb.path) {
          const data = buildNotebookData(nb);
          window.electronAPI?.autoSaveBackup(nb.path, data);
        }
      }
    }, 60000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Theme + lineAlt: apply to DOM, persist on change ─────────────────────
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.classList.toggle('line-alt-enabled', lineAltEnabled); }, [lineAltEnabled]);
  useEffect(() => { document.documentElement.classList.toggle('strong-cues', strongCuesEnabled); }, [strongCuesEnabled]);

  // Faster toolbar tooltips: swap title→data-title on enter so the native ~500ms
  // browser tooltip is suppressed; CSS pseudo-element shows at 250ms instead.
  useEffect(() => {
    const onEnter = (e) => {
      const el = e.target.closest('.toolbar [title]');
      if (!el) return;
      el.dataset.title = el.title;
      el.removeAttribute('title');
    };
    const onLeave = (e) => {
      const el = e.target.closest('.toolbar [data-title]');
      if (!el || !el.dataset.title) return;
      el.title = el.dataset.title;
      delete el.dataset.title;
    };
    document.addEventListener('mouseenter', onEnter, true);
    document.addEventListener('mouseleave', onLeave, true);
    return () => {
      document.removeEventListener('mouseenter', onEnter, true);
      document.removeEventListener('mouseleave', onLeave, true);
    };
  }, []);

  useEffect(() => {
    if (isFirstThemeRender.current) { isFirstThemeRender.current = false; return; }
    saveSettingsRef.current();
  }, [theme]); // pinnedPathsRef / dockLayoutRef are stable refs, no dep needed

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    saveSettingsRef.current();
  }, [lineAltEnabled]);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    saveSettingsRef.current();
  }, [lintEnabled]);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    saveSettingsRef.current();
  }, [tablePageSize]);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    saveSettingsRef.current();
  }, [formatOnSave]);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    saveSettingsRef.current();
  }, [notebookBg, notebookBgOpacity, notebookBgTint]);

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
    // Auto-reconnect attached databases using the updated properties
    const merged = { ...dbConnectionsRef.current.find((c) => c.id === id), ...updates };
    for (const nb of notebooksRef.current) {
      const attached = nb.attachedDbs.find((d) => d.connectionId === id);
      if (!attached || nb.kernelStatus !== 'ready') continue;
      // Re-send db_connect with updated properties; kernel handles reconnect idempotently
      setNb(nb.id, (n) => ({
        attachedDbs: n.attachedDbs.map((d) =>
          d.connectionId === id ? { ...d, status: 'connecting', error: undefined } : d
        ),
      }));
      window.electronAPI?.sendToKernel(nb.id, {
        type: 'db_connect', connectionId: id,
        name: merged.name, provider: merged.provider,
        connectionString: merged.connectionString, varName: attached.varName,
      });
    }
  }, [setNb]);

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

  const handleExportDbConnections = useCallback(async () => {
    // Export unencrypted — strip the encrypted flag so the file is plaintext
    const plain = dbConnectionsRef.current.map(({ encrypted, ...c }) => c);
    return window.electronAPI?.exportDbConnections(plain);
  }, []);

  const handleImportDbConnections = useCallback(async () => {
    const result = await window.electronAPI?.importDbConnections();
    if (!result?.success || !result?.data) return result;
    // Merge: imported connections replace existing ones with the same id, others are appended
    setDbConnections((prev) => {
      const merged = [...prev];
      for (const imported of result.data) {
        const idx = merged.findIndex((c) => c.id === imported.id);
        if (idx >= 0) merged[idx] = imported; else merged.push(imported);
      }
      window.electronAPI?.saveDbConnections(merged);
      return merged;
    });
    return result;
  }, []);

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
    new:              () => setNewNbDialogOpen(true),
    open:             handleLoad,
    'import-polyglot': handleImportPolyglot,
    'import-data':     handleImportData,
    save: async () => {
      const id = activeIdRef.current;
      if (isLibEditorId(id)) handleSaveLibEditor(id);
      else { await handleSave(id); setGitRefreshKey((k) => k + 1); }
    },
    'save-as':         () => { if (isNotebook()) handleSaveAs(activeIdRef.current); },
    'run-all':         () => { if (isNotebook()) runAll(activeIdRef.current); },
    reset:             () => { if (isNotebook()) handleResetWithSchedules(activeIdRef.current); },
    'clear-output':    () => { if (isNotebook()) setNb(activeIdRef.current, { outputs: {} }); },
    docs:              handleOpenDocs,
    changelog:         handleOpenChangelog,
    'toggle-packages': () => setPanelVisible('nuget',   null),
    'toggle-config':   () => setPanelVisible('config',  null),
    'toggle-logs':     () => setPanelVisible('log',     null),
    'toggle-library':  () => setPanelVisible('library', null),
    'toggle-db':       () => setPanelVisible('db',      null),
    'toggle-vars':     () => setPanelVisible('vars',    null),
    'toggle-toc':      () => setPanelVisible('toc',     null),
    'toggle-files':    () => setPanelVisible('files',   null),
    'toggle-api':      () => setPanelVisible('api',     null),
    'toggle-api-editor': () => setPanelVisible('api-editor', null),
    'toggle-git':      () => setPanelVisible('git',     null),
    'toggle-kafka':    () => setPanelVisible('kafka',   null),
    'toggle-graph':    () => setPanelVisible('graph',   null),
    'toggle-todo':     () => setPanelVisible('todo',    null),
    'toggle-regex':    () => setPanelVisible('regex',   null),
    'toggle-history':  () => setPanelVisible('history', null),
    'toggle-deps':     () => setPanelVisible('deps', null),
    'toggle-embed':    () => setPanelVisible('embed', null),
    about:             () => setAboutOpen(true),
    settings:          () => setSettingsOpen(true),
    'export-html':     handleExportHtml,
    'export-gdoc-all':    () => handleExportGoogleDoc({ includeCode: true, includeResults: true }),
    'export-gdoc-code':   () => handleExportGoogleDoc({ includeCode: true, includeResults: false }),
    'export-gdoc-results': () => handleExportGoogleDoc({ includeCode: false, includeResults: true }),
    'export-pdf':      () => window.electronAPI?.exportPdf(),
    'export-app':      () => setExportAppOpen(true),
    'export-exe':      () => {
      const nb = notebooksRef.current.find((n) => n.id === activeIdRef.current);
      if (!nb) return;
      const codeCells = nb.cells.filter((c) => c.type === 'code');
      if (codeCells.length === 0) return;
      window.electronAPI?.exportExecutable({
        cells: codeCells.map((c) => ({ name: c.name, content: c.content })),
        packages: (nb.nugetPackages || []).filter((p) => p.status === 'loaded').map((p) => ({ id: p.id, version: p.version })),
        config: (nb.config || []).filter((e) => e.key.trim()).map((e) => ({ key: e.key, value: e.value })),
        title: getNotebookDisplayName(nb.path, nb.title, 'notebook'),
      });
    },
    'export-docker-compose': () => {
      const nb = notebooksRef.current.find((n) => n.id === activeIdRef.current);
      if (!nb) return;
      const dockerCells = nb.cells.filter((c) => c.type === 'docker' && c.image);
      if (dockerCells.length === 0) return;
      const yaml = generateDockerCompose(dockerCells);
      window.electronAPI?.saveFile({
        content: yaml,
        defaultName: 'docker-compose.yml',
        filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }],
      });
    },
    'command-palette': () => setCommandPaletteOpen(true),
    dashboard:         () => setDashboardMode((v) => !v),
  };

  // ── Window tabs sync ───────────────────────────────────────────────────────
  const tabFingerprint = useMemo(() => {
    const parts = notebooks.map((nb) => `${nb.id}:${getNotebookDisplayName(nb.path, nb.title)}:${nb.isDirty}`);
    parts.push(...libEditors.map((e) => `${e.id}:${e.filename}:${e.isDirty}`));
    if (docsOpen) parts.push(DOCS_TAB_ID);
    if (changelogOpen) parts.push(CHANGELOG_TAB_ID);
    if (kafkaTabOpen) parts.push(KAFKA_TAB_ID);
    parts.push(`active:${activeId}`);
    return parts.join('|');
  }, [notebooks, libEditors, docsOpen, changelogOpen, kafkaTabOpen, activeId]);

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
      ...(docsOpen      ? [{ id: DOCS_TAB_ID,      label: 'Documentation', isDirty: false, isActive: activeId === DOCS_TAB_ID      }] : []),
      ...(changelogOpen ? [{ id: CHANGELOG_TAB_ID, label: 'Changelog',     isDirty: false, isActive: activeId === CHANGELOG_TAB_ID }] : []),
      ...(kafkaTabOpen  ? [{ id: KAFKA_TAB_ID,     label: 'Kafka',         isDirty: false, isActive: activeId === KAFKA_TAB_ID     }] : []),
    ]);
  }, [tabFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Command palette keyboard shortcut + double-shift ───────────────────────
  const lastShiftRef = useRef(0);
  const shiftPendingRef = useRef(false);
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
      // Track shift for double-tap detection
      if (e.key === 'Shift') shiftPendingRef.current = true;
      else shiftPendingRef.current = false;
    };
    const onKeyUp = (e) => {
      if (e.key !== 'Shift' || !shiftPendingRef.current) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const now = Date.now();
      if (now - lastShiftRef.current < 400) {
        setCommandPaletteOpen((v) => !v);
        lastShiftRef.current = 0;
      } else {
        lastShiftRef.current = now;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ── Viewer mode helpers ──────────────────────────────────────────────
  const applyEmbeddedSettings = useCallback((s) => {
    if (!s) return;
    // Visual / appearance
    if (s.theme) setTheme(s.theme);
    if (typeof s.lineAltEnabled === 'boolean') setLineAltEnabled(s.lineAltEnabled);
    if (typeof s.lintEnabled === 'boolean') setLintEnabled(s.lintEnabled);
    if (typeof s.strongCuesEnabled === 'boolean') setStrongCuesEnabled(s.strongCuesEnabled);
    if (typeof s.formatOnSave === 'boolean') setFormatOnSave(s.formatOnSave);
    if (typeof s.showFish === 'boolean') setShowFish(s.showFish);
    if (typeof s.showCircuit === 'boolean') setShowCircuit(s.showCircuit);
    if (typeof s.showGhost === 'boolean') setShowGhost(s.showGhost);
    if (typeof s.showSkyline === 'boolean') setShowSkyline(s.showSkyline);
    if (s.notebookBg) setNotebookBg(s.notebookBg);
    if (typeof s.notebookBgOpacity === 'number') setNotebookBgOpacity(s.notebookBgOpacity);
    if (typeof s.notebookBgTint === 'boolean') setNotebookBgTint(s.notebookBgTint);
    if (typeof s.tablePageSize === 'number') setTablePageSize(s.tablePageSize);
    // Keyboard shortcuts
    if (s.customShortcuts && typeof s.customShortcuts === 'object') {
      setCustomShortcuts(s.customShortcuts);
      window.electronAPI?.rebuildMenu?.(s.customShortcuts);
    }
    // Favorite folders
    if (Array.isArray(s.favoriteFolders)) setFavoriteFolders(s.favoriteFolders);
    // DB connections
    if (Array.isArray(s.dbConnections) && s.dbConnections.length > 0) {
      setDbConnections(s.dbConnections);
      window.electronAPI?.saveDbConnections?.(s.dbConnections);
    }
    // API saved configs
    if (Array.isArray(s.apiSaved) && s.apiSaved.length > 0) {
      window.electronAPI?.saveApiSaved?.(s.apiSaved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const findStrippedCredentials = useCallback((s) => {
    const items = [];
    if (Array.isArray(s.dbConnections)) {
      for (const c of s.dbConnections) {
        if (c.stripped) items.push({ type: 'db', id: c.id, name: c.name, field: 'connectionString', label: `DB: ${c.name}` });
      }
    }
    return items;
  }, []);

  const handlePassphraseSubmit = useCallback(async (passphrase) => {
    const result = await window.electronAPI?.decryptViewerSettings?.({ passphrase });
    if (result?.success) {
      setPassphraseDialogOpen(false);
      applyEmbeddedSettings(result.settings);
      const stripped = findStrippedCredentials(result.settings);
      if (stripped.length > 0) setCredentialsDialogData(stripped);
      if (viewerMode?.notebookPath) {
        window.electronAPI?.openRecentFile?.(viewerMode.notebookPath);
      }
      return { success: true };
    }
    return { success: false, error: result?.error || 'Decryption failed' };
  }, [viewerMode, applyEmbeddedSettings, findStrippedCredentials]);

  const handleCredentialsSubmit = useCallback((filled) => {
    for (const item of filled) {
      if (item.type === 'db') {
        setDbConnections(prev => prev.map(c => c.id === item.id ? { ...c, connectionString: item.value, stripped: false } : c));
      }
    }
    setCredentialsDialogData(null);
  }, []);

  // ── Viewer mode listener ─────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI?.onViewerMode?.((data) => {
      setViewerMode(data);
      if (data.needsPassphrase) {
        setPassphraseDialogOpen(true);
        return;
      }
      // Apply embedded settings if present
      if (data.embeddedSettings) {
        applyEmbeddedSettings(data.embeddedSettings);
        const stripped = findStrippedCredentials(data.embeddedSettings);
        if (stripped.length > 0) setCredentialsDialogData(stripped);
      }
      if (data.notebookPath) {
        window.electronAPI?.loadNotebookFromPath?.(data.notebookPath).then((result) => {
          if (result?.success && result.data) {
            window.electronAPI?.openRecentFile?.(data.notebookPath);
          }
        });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Quit guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onBeforeQuit) return;
    window.electronAPI.onBeforeQuit(() => {
      const dirty = notebooksRef.current.filter((n) => n.isDirty);
      if (dirty.length === 0) {
        window.electronAPI.confirmQuit();
      } else {
        setQuitDirtyNbs(dirty.map((n) => ({ id: n.id, title: getNotebookDisplayName(n.path, n.title), path: n.path })));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Panel props + open flags ───────────────────────────────────────────────

  const activeNb = notebooks.find((n) => n.id === activeId) ?? null;

  // ── Orchestration ──────────────────────────────────────────────────────────
  const depGraph = useCellDependencies(activeNb);
  const orchestrator = useCellOrchestrator({
    notebooksRef, nodes: depGraph.nodes, edges: depGraph.edges,
    dispatchCellRun,
  });

  // ── Per-notebook dock layout sync ──────────────────────────────────────────
  // When switching notebooks, restore the saved layout; when layout changes, save to notebook
  const prevActiveIdRef = useRef(activeId);
  useEffect(() => {
    if (!isNotebookId(activeId)) return;
    if (prevActiveIdRef.current !== activeId) {
      prevActiveIdRef.current = activeId;
      const nb = notebooksRef.current.find((n) => n.id === activeId);
      if (nb?.dockLayout) {
        setDockLayout({ ...DEFAULT_DOCK_LAYOUT, ...nb.dockLayout });
      }
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save dock layout to active notebook whenever it changes
  const dockLayoutJsonRef = useRef('');
  useEffect(() => {
    const json = JSON.stringify(dockLayout);
    if (json === dockLayoutJsonRef.current) return;
    dockLayoutJsonRef.current = json;
    const nbId = activeIdRef.current;
    if (isNotebookId(nbId)) {
      setNbDirty(nbId, { dockLayout });
    }
  }, [dockLayout]); // eslint-disable-line react-hooks/exhaustive-deps

  const nb_ = isNotebookId(activeId) ? activeNb : null;
  const openFlags = useMemo(() => ({
    log:          nb_?.logPanelOpen      ?? false,
    nuget:        nb_?.nugetPanelOpen    ?? false,
    config:       nb_?.configPanelOpen   ?? false,
    db:           nb_?.dbPanelOpen       ?? false,
    library:      nb_?.libraryPanelOpen  ?? false,
    vars:         nb_?.varsPanelOpen     ?? false,
    toc:          nb_?.tocPanelOpen      ?? false,
    files:        nb_?.filesPanelOpen    ?? false,
    api:          nb_?.apiPanelOpen      ?? false,
    'api-editor': nb_?.apiEditorPanelOpen ?? false,
    git:          nb_?.gitPanelOpen      ?? false,
    graph:        nb_?.graphPanelOpen    ?? false,
    todo:         nb_?.todoPanelOpen     ?? false,
    regex:        nb_?.regexPanelOpen    ?? false,
    history:      nb_?.historyPanelOpen  ?? false,
    deps:         nb_?.depsPanelOpen     ?? false,
    embed:        nb_?.embedPanelOpen    ?? false,
    profile:      nb_?.profilePanelOpen  ?? false,
  }), [activeId, activeNb]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suppress dock rendering for a panel only when it is popped out as a tab
  // for the *currently active* notebook. If A's logs are popped out and the
  // user switches to B, B's dock-attached logs panel is still allowed to
  // render — the popped-out tab is bound to A.
  const effectiveOpenFlags = useMemo(() => {
    if (panelTabs.size === 0) return openFlags;
    const flags = { ...openFlags };
    for (const [pid, ownerNbId] of panelTabs) {
      if (ownerNbId === activeId) flags[pid] = false;
    }
    return flags;
  }, [openFlags, panelTabs, activeId]);

  // buildPanelProps(nb) — derive the per-panel prop bag for ANY notebook,
  // not just the active one. Detached panel-tabs call this with their bound
  // notebook so they keep showing that notebook's data even when the user
  // switches between notebook tabs.
  const buildPanelProps = useCallback((nb) => {
    const nbId = nb?.id ?? null;
    return {
      log: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ logPanelOpen: !n.logPanelOpen })) : () => {},
        currentMemoryMb: nb?.memoryHistory?.length
          ? (typeof nb.memoryHistory[nb.memoryHistory.length - 1] === 'number'
            ? nb.memoryHistory[nb.memoryHistory.length - 1]
            : nb.memoryHistory[nb.memoryHistory.length - 1]?.mb) : null,
        cells: nb?.cells ?? [],
        onNavigateToCell: nbId ? (cellId) => handleNavigateToCell(nbId, cellId) : () => {},
      },
      nuget: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ nugetPanelOpen: !n.nugetPanelOpen })) : () => {},
        packages: nb?.nugetPackages ?? [],
        kernelStatus: nb?.kernelStatus ?? 'starting',
        sources: nb?.nugetSources ?? [],
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
        config: nb?.config ?? [],
        onAdd:    nbId ? (k, v, type, envVar) => setNbDirty(nbId, (n) => ({ config: [...n.config, { key: k, value: v, type: type || 'string', envVar }] })) : () => {},
        onRemove: nbId ? (i)    => setNbDirty(nbId, (n) => ({ config: n.config.filter((_, idx) => idx !== i) })) : () => {},
        onUpdate: nbId ? (i, updates) => setNbDirty(nbId, (n) => ({
          config: n.config.map((e, idx) => idx === i ? { ...e, ...updates } : e),
        })) : () => {},
      },
      db: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ dbPanelOpen: !n.dbPanelOpen })) : () => {},
        connections: dbConnections,
        attachedDbs: nb?.attachedDbs ?? [],
        notebookId: nbId,
        onAttach:  nbId ? (connId) => handleAttachDb(nbId, connId)  : () => {},
        onDetach:  nbId ? (connId) => handleDetachDb(nbId, connId)  : () => {},
        onRefresh: nbId ? (connId) => handleRefreshDb(nbId, connId) : () => {},
        onRetry:   nbId ? (connId) => handleRetryDb(nbId, connId)   : () => {},
        onEditConnection: (conn) => setDbConnDialog(conn === null ? 'new' : conn),
        onRemove: handleRemoveDbConnection,
        onLoadMoreRedis: nbId ? (connId, cursor) => {
          window.electronAPI?.sendToKernel(nbId, { type: 'db_redis_scan', connectionId: connId, cursor });
        } : () => {},
      },
      library: {
        onInsert:   handleInsertLibraryFile,
        onClose:    () => setPanelVisible('library', false),
        onOpenFile: handleOpenLibraryFile,
      },
      vars: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ varsPanelOpen: !n.varsPanelOpen })) : () => {},
        vars: nb?.vars ?? [],
        varHistory: nb?.varHistory ?? {},
        varDiff: nb?.varDiff ?? null,
        onInspect: nbId ? (name) => {
          const v = (nb?.vars ?? []).find((vv) => vv.name === name);
          setVarInspectDialog({ name, typeName: v?.typeName ?? '', value: v?.value ?? '', notebookId: nbId, fullValue: null });
        } : null,
        watchExpressions: nb?.watchExpressions ?? [],
        onAddWatch: nbId ? (name) => setNbDirty(nbId, (n) => {
          const existing = n.watchExpressions || [];
          if (existing.some(w => w.name === name)) return {};
          return { watchExpressions: [...existing, { name }] };
        }) : null,
        onRemoveWatch: nbId ? (name) => setNbDirty(nbId, (n) => ({
          watchExpressions: (n.watchExpressions || []).filter(w => w.name !== name),
        })) : null,
      },
      toc: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ tocPanelOpen: !n.tocPanelOpen })) : () => {},
        cells: nb?.cells ?? [],
        onAddCell: nbId ? (type, afterCellId) => {
          const newCell = makeCell(type, '');
          setNbDirty(nbId, (n) => {
            const next = [...n.cells];
            const idx = afterCellId ? next.findIndex((c) => c.id === afterCellId) + 1 : next.length;
            next.splice(idx < 0 ? next.length : idx, 0, newCell);
            return { cells: next };
          });
        } : null,
      },
      files: {
        onToggle: () => {
          if (!(nb?.filesPanelOpen) && !filesCurrentDir && nb?.path) {
            const p = nb.path.replace(/\\/g, '/');
            setFilesCurrentDir(p.slice(0, p.lastIndexOf('/')));
          }
          setPanelVisible('files', null);
        },
        currentDir: filesCurrentDir,
        onNavigate: setFilesCurrentDir,
        onOpenNotebook: handleOpenRecent,
        notebookDir: nb?.path
          ? (() => { const p = nb.path.replace(/\\/g, '/'); return p.slice(0, p.lastIndexOf('/')); })()
          : null,
        favoriteFolders,
        onToggleFavorite: (path) => {
          setFavoriteFolders((prev) => {
            const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
            favoriteFoldersRef.current = next;
            saveSettingsRef.current();
            return next;
          });
        },
      },
      api: {
        onToggle: () => setPanelVisible('api', null),
      },
      'api-editor': {
        onToggle: () => setPanelVisible('api-editor', null),
        requestedApiId: apiEditorRequestedId,
        onRequestedApiHandled: () => setApiEditorRequestedId(null),
        lastApiId: nb?.apiEditorSelectedId ?? null,
        onApiSelectionChange: nbId ? (id) => setNb(nbId, { apiEditorSelectedId: id }) : null,
      },
      git: {
        onToggle: () => setPanelVisible('git', null),
        notebookDir: nb?.path ? nb.path.replace(/\\/g, '/').replace(/\/[^/]+$/, '') : null,
        refreshKey: gitRefreshKey,
      },
      graph: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ graphPanelOpen: !n.graphPanelOpen })) : () => {},
        varHistory: nb?.varHistory ?? {},
        onClearGraph: nbId ? () => setNb(nbId, { varHistory: {} }) : null,
      },
      todo: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ todoPanelOpen: !n.todoPanelOpen })) : () => {},
        cells: nb?.cells ?? [],
        onNavigateToCell: nbId ? (cellId) => handleNavigateToCell(nbId, cellId) : () => {},
      },
      profile: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ profilePanelOpen: !n.profilePanelOpen })) : () => {},
        cells: nb?.cells ?? [],
        cellRunHistory: nb?.cellRunHistory ?? {},
        onNavigateToCell: nbId ? (cellId) => handleNavigateToCell(nbId, cellId) : () => {},
      },
      regex: {},
      history: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ historyPanelOpen: !n.historyPanelOpen })) : () => {},
        notebookPath: nb?.path ?? null,
        onRestore: nbId ? (data) => {
          setNbDirty(nbId, () => ({
            cells: data.cells ?? [],
            config: data.config ?? [],
            title: data.title,
          }));
        } : () => {},
      },
      deps: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ depsPanelOpen: !n.depsPanelOpen })) : () => {},
        notebook: nb,
        notebookId: nbId,
        onNavigateToCell: nbId ? (cellId) => handleNavigateToCell(nbId, cellId) : () => {},
        onRunWithDeps: orchestrator.runWithDeps,
        onRunDownstream: orchestrator.runDownstream,
        onRunPipeline: orchestrator.runPipeline,
        executionProgress: orchestrator.executionProgress,
        onCancelOrchestration: orchestrator.cancelOrchestration,
        dispatchRun: orchestrator.dispatchRun,
        pipelines: nb?.pipelines || [],
        onCreatePipeline: pipelineManager.createPipeline,
        onRenamePipeline: pipelineManager.renamePipeline,
        onDeletePipeline: pipelineManager.deletePipeline,
        onSetPipelineCells: pipelineManager.setPipelineCells,
        scheduledCells,
        onAddCell: nbId ? (type) => {
          const cell = makeCell(type);
          setNbDirty(nbId, (n) => ({ cells: [...n.cells, cell] }));
        } : null,
        onWireCell: nbId ? (cellId, prop, value) => {
          setNbDirty(nbId, (n) => ({
            cells: n.cells.map(c => c.id === cellId ? { ...c, [prop]: value } : c),
          }));
        } : null,
      },
      embed: {
        onToggle: nbId ? () => setNb(nbId, (n) => ({ embedPanelOpen: !n.embedPanelOpen })) : () => {},
        files: nb?.embeddedFiles || [],
        onAdd: async () => {
          if (!nbId) return;
          const result = await window.electronAPI?.pickEmbedFile?.();
          if (!result) return;
          const name = result.filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
          setNbDirty(nbId, (n) => ({
            embeddedFiles: [...(n.embeddedFiles || []), { name, ...result, variables: {} }],
          }));
          if (nb?.kernelStatus === 'ready') {
            window.electronAPI?.sendToKernel(nbId, {
              type: 'set_embedded_files',
              files: [...(nb.embeddedFiles || []), { name, ...result, variables: {} }],
            });
          }
        },
        onDelete: (name) => {
          if (!nbId) return;
          const newFiles = (nb?.embeddedFiles || []).filter(f => f.name !== name);
          setNbDirty(nbId, () => ({ embeddedFiles: newFiles }));
          if (nb?.kernelStatus === 'ready') {
            window.electronAPI?.sendToKernel(nbId, { type: 'set_embedded_files', files: newFiles });
          }
        },
        onUpdateVars: (name, key, value) => {
          if (!nbId) return;
          setNbDirty(nbId, (n) => ({
            embeddedFiles: (n.embeddedFiles || []).map(f =>
              f.name === name ? { ...f, variables: { ...f.variables, [key]: value } } : f
            ),
          }));
        },
        onUpdate: (oldName, updated) => {
          if (!nbId) return;
          const newFiles = (nb?.embeddedFiles || []).map(f => f.name === oldName ? updated : f);
          setNbDirty(nbId, () => ({ embeddedFiles: newFiles }));
          if (nb?.kernelStatus === 'ready') {
            window.electronAPI?.sendToKernel(nbId, { type: 'set_embedded_files', files: newFiles });
          }
        },
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbConnections, filesCurrentDir, favoriteFolders]); // eslint-disable-line react-hooks/exhaustive-deps

  const panelPropsMap = useMemo(() => buildPanelProps(activeNb), [buildPanelProps, activeNb]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const dockZoneProps = {
    dockLayout,
    openFlags: effectiveOpenFlags,
    panelProps: panelPropsMap,
    onTabChange:  handleZoneTabChange,
    onPanelClose: handlePanelClose,
    onDetachToTab: detachPanelToTab,
    onStartDrag:  handleStartDrag,
    onResizeEnd:  handleZoneResizeEnd,
    flashingPanel,
  };

  return (
    <TablePageSizeContext.Provider value={tablePageSize}>
    <div id="app">
      <TabBar
        notebooks={notebooks}
        activeId={activeId}
        onActivate={setActiveId}
        onClose={handleCloseTabWithSchedules}
        onNew={() => setNewNbDialogOpen(true)}
        onRename={handleRenameTab}
        viewerMode={!!viewerMode}
        onReorder={handleReorder}
        onSetColor={handleSetTabColor}
        activeTabColor={notebooks.find((n) => n.id === activeId)?.color ?? null}
        docsOpen={docsOpen}
        onActivateDocs={handleOpenDocs}
        onCloseDocs={handleCloseDocs}
        changelogOpen={changelogOpen}
        onActivateChangelog={handleOpenChangelog}
        onCloseChangelog={handleCloseChangelog}
        kafkaTabOpen={kafkaTabOpen}
        onActivateKafka={handleOpenKafkaTab}
        onCloseKafka={handleCloseKafkaTab}
        libEditors={libEditors}
        onCloseLibEditor={handleCloseLibEditor}
        pinnedPaths={pinnedPaths}
        onTogglePin={handleTogglePin}
        panelTabs={panelTabs}
        onActivatePanelTab={(pid) => setActiveId(makePanelTabId(pid))}
        onClosePanelTab={closePanelTab}
        onReturnPanelToPanel={returnPanelFromTab}
      />
      <div id="toolbar-portal-root" />
      <div className="dock-workspace" key={layoutKey}>
        {!viewerMode && <DockZone zone="left" {...dockZoneProps} />}
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
                    isActive={notebook.id === activeId}
                    onSetNb={(updater) => setNb(notebook.id, updater)}
                    onSetNbDirty={(updater) => setNbDirty(notebook.id, updater)}
                    onRunCell={runCell}
                    onRunSqlCell={runSqlCell}
                    onRunHttpCell={runHttpCell}
                    onRunShellCell={runShellCell}
                    onRunDockerCell={runDockerCell}
                    onRunFlociCell={runFlociCell}
                    onStopDockerCell={stopDockerCell}
                    onPollDockerStatus={pollDockerStatus}
                    onFetchDockerLogs={fetchDockerLogs}
                    onRunCheckCell={runCheckCell}
                    onRunDecisionCell={runDecisionCell}
                    onRunCellByName={handleRunCellByName}
                    onRunAll={runAll}
                    onInterrupt={handleInterrupt}
                    onRunFrom={runFrom}
                    onRunTo={runTo}
                    onSave={handleSave}
                    onLoad={handleLoad}
                    onReset={handleResetWithSchedules}
                    onRename={(newName) => handleRenameTab(notebook.id, newName)}
                    libraryPanelOpen={notebook.libraryPanelOpen || false}
                    onToggleLibrary={() => {
                      if (!notebook.libraryPanelOpen) handleFocusPanel('library');
                      setPanelVisible('library', null);
                    }}
                    filesPanelOpen={notebook.filesPanelOpen || false}
                    onToggleFiles={() => {
                      if (!notebook.filesPanelOpen) handleFocusPanel('files');
                      panelPropsMap.files.onToggle();
                    }}
                    apiPanelOpen={notebook.apiPanelOpen || false}
                    onToggleApi={() => {
                      if (!notebook.apiPanelOpen) handleFocusPanel('api');
                      setPanelVisible('api', null);
                    }}
                    apiEditorPanelOpen={notebook.apiEditorPanelOpen || false}
                    onToggleApiEditor={() => {
                      if (!notebook.apiEditorPanelOpen) handleFocusPanel('api-editor');
                      setPanelVisible('api-editor', null);
                    }}
                    gitPanelOpen={notebook.gitPanelOpen || false}
                    onToggleGit={() => {
                      if (!notebook.gitPanelOpen) handleFocusPanel('git');
                      setPanelVisible('git', null);
                    }}
                    kafkaPanelOpen={kafkaTabOpen}
                    onToggleKafka={() => {
                      if (kafkaTabOpen) handleCloseKafkaTab(); else handleOpenKafkaTab();
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
                    onCloseAllPanels={setPanelCloseAll}
                    onImportData={handleImportData}
                    scheduledCells={scheduledCells}
                    onScheduleStart={startSchedule}
                    onScheduleStop={stopSchedule}
                    scheduledNotebooks={scheduledNotebooks}
                    onNotebookScheduleStart={startNotebookSchedule}
                    onNotebookScheduleStop={stopNotebookSchedule}
                    dashboardMode={dashboardMode}
                    onToggleDashboard={() => setDashboardMode((v) => !v)}
                    onDebugResume={debugResume}
                    onDebugStep={debugStep}
                    onToggleBreakpoint={toggleBreakpoint}
                    onRetainOutput={handleRetainOutput}
                    onUnretainOutput={handleUnretainOutput}
                    showCircuit={showCircuit}
                    notebookBg={notebookBg}
                    notebookBgOpacity={notebookBgOpacity}
                    notebookBgTint={notebookBgTint}
                    highlightedCellIds={highlightedCellIds}
                    onHighlightCells={setHighlightedCellIds}
                    viewerMode={!!viewerMode}
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
              {changelogOpen && (
                <div
                  className="notebook-pane"
                  style={activeId === CHANGELOG_TAB_ID ? undefined : { display: 'none' }}
                >
                  <ChangelogPanel />
                </div>
              )}
              {kafkaTabOpen && (
                <div
                  className="notebook-pane"
                  style={activeId === KAFKA_TAB_ID ? undefined : { display: 'none' }}
                >
                  <KafkaPanel
                    asTab
                    onToggle={handleCloseKafkaTab}
                  />
                </div>
              )}
              {[...panelTabs].map(([panelId, ownerNbId]) => (
                <PanelTabPane
                  key={makePanelTabId(panelId)}
                  panelId={panelId}
                  notebook={notebooks.find((n) => n.id === ownerNbId)}
                  buildPanelProps={buildPanelProps}
                  isActive={activeId === makePanelTabId(panelId)}
                />
              ))}
            </div>
            {!viewerMode && <DockZone zone="right" {...dockZoneProps} />}
          </div>
          {!viewerMode && <DockZone zone="bottom" {...dockZoneProps} />}
        </div>
      </div>
      <StatusBar notebooks={notebooks} activeId={activeId} showFish={showFish}
        showSkyline={showSkyline} onTriggerSkyline={() => skylineTriggerRef.current?.()} />
      {showGhost && <Ghost />}
      {showSkyline && <IdleSkyline triggerRef={skylineTriggerRef} />}
      {!viewerMode && Object.entries(dockLayout.assignments)
        .filter(([panelId, z]) => z === 'float' && !!effectiveOpenFlags[panelId])
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
      {exportAppOpen && (
        <ExportAppDialog
          notebookTitle={activeNb?.title || 'Notebook'}
          onExport={async (appName, outputDir, passphrase, stripSecrets) => {
            const nb = activeNb;
            if (!nb) return { success: false, error: 'No notebook open' };
            const notebookData = buildNotebookData(nb.id);
            // Capture current settings to embed in the exported app
            const apiSaved = await window.electronAPI?.loadApiSaved?.() ?? [];
            const appSettings = {
              theme: themeRef.current,
              lineAltEnabled: lineAltEnabledRef.current,
              lintEnabled: lintEnabledRef.current,
              strongCuesEnabled: strongCuesRef.current,
              formatOnSave: formatOnSaveRef.current,
              showFish: showFishRef.current,
              showCircuit: showCircuitRef.current,
              showGhost: showGhostRef.current,
              showSkyline: showSkylineRef.current,
              notebookBg: notebookBgRef.current,
              notebookBgOpacity: notebookBgOpacityRef.current,
              tablePageSize: tablePageSizeRef.current,
              customShortcuts: customShortcutsRef.current,
              favoriteFolders: favoriteFoldersRef.current,
              dbConnections: dbConnectionsRef.current,
              apiSaved,
            };
            return window.electronAPI?.exportStandaloneApp({
              notebookData, title: nb.title, appName, outputDir, appSettings,
              passphrase: passphrase || undefined,
              stripSecrets: stripSecrets || false,
            });
          }}
          onClose={() => setExportAppOpen(false)}
        />
      )}
      {passphraseDialogOpen && <PassphraseDialog onSubmit={handlePassphraseSubmit} />}
      {credentialsDialogData && <CredentialsDialog items={credentialsDialogData} onSubmit={handleCredentialsSubmit} />}
      {newNbDialogOpen && (
        <NewNotebookDialog
          onSelect={(templateKey) => { setNewNbDialogOpen(false); handleNew(templateKey); }}
          onCancel={() => setNewNbDialogOpen(false)}
        />
      )}
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
          strongCuesEnabled={strongCuesEnabled}
          onStrongCuesChange={setStrongCuesEnabled}
          formatOnSave={formatOnSave}
          onFormatOnSaveChange={setFormatOnSave}
          showFish={showFish}
          onShowFishChange={setShowFish}
          showCircuit={showCircuit}
          onShowCircuitChange={setShowCircuit}
          showGhost={showGhost}
          onShowGhostChange={setShowGhost}
          showSkyline={showSkyline}
          onShowSkylineChange={setShowSkyline}
          notebookBg={notebookBg}
          onNotebookBgChange={setNotebookBg}
          notebookBgOpacity={notebookBgOpacity}
          onNotebookBgOpacityChange={setNotebookBgOpacity}
          notebookBgTint={notebookBgTint}
          onNotebookBgTintChange={setNotebookBgTint}
          tablePageSize={tablePageSize}
          onTablePageSizeChange={setTablePageSize}
          customShortcuts={customShortcuts}
          onShortcutsChange={handleShortcutsChange}
          pinnedPaths={pinnedPaths}
          onUnpin={handleTogglePin}
          onExport={handleExportSettings}
          onImport={handleImportSettings}
          onExportDb={handleExportDbConnections}
          onImportDb={handleImportDbConnections}
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
          onExecute={(id) => {
            if (id === 'shortcuts') { setCommandPaletteOpen(false); setShortcutsOpen(true); return; }
            menuHandlersRef.current[id]?.();
          }}
          onClose={() => setCommandPaletteOpen(false)}
          cells={(() => { const nb = notebooksRef.current.find((n) => n.id === activeIdRef.current); return nb?.cells || []; })()}
          onNavigateToCell={(cellId) => {
            const el = document.querySelector(`[data-cell-id="${cellId}"]`);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('cell-flash'); el.addEventListener('animationend', () => el.classList.remove('cell-flash'), { once: true }); }
          }}
        />
      )}
      {shortcutsOpen && (
        <KeyboardShortcutsOverlay onClose={() => setShortcutsOpen(false)} />
      )}
      {dbConnDialog && (
        <DbConnectionDialog
          connection={dbConnDialog === 'new' ? null : dbConnDialog}
          existingNames={dbConnections
            .filter((c) => dbConnDialog === 'new' || c.id !== dbConnDialog.id)
            .map((c) => c.name)}
          onSave={(conn) => {
            if (dbConnDialog === 'new') handleAddDbConnection(conn);
            else handleUpdateDbConnection(conn.id, conn);
          }}
          onClose={() => setDbConnDialog(null)}
          onTestConnection={(provider, connectionString) => {
            const nbId = activeIdRef.current;
            if (!nbId || !window.electronAPI) return Promise.resolve({ success: false, message: 'No active kernel' });
            const requestId = Math.random().toString(36).slice(2);
            return new Promise((resolve) => {
              const timeout = setTimeout(() => { cleanup(); resolve({ success: false, message: 'Test timed out' }); }, 15000);
              const handler = (payload) => {
                if (payload.notebookId !== nbId) return;
                const msg = payload.message;
                if (msg.type === 'db_test_result' && msg.requestId === requestId) {
                  cleanup();
                  resolve(msg);
                }
              };
              const cleanup = () => { clearTimeout(timeout); window.electronAPI.offKernelMessage(handler); };
              window.electronAPI.onKernelMessage(handler);
              window.electronAPI.sendToKernel(nbId, { type: 'db_test', provider, connectionString, requestId });
            });
          }}
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
    </TablePageSizeContext.Provider>
  );
}
