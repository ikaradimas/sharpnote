import { useState, useRef, useCallback, useEffect } from 'react';
import { marked } from 'marked';
import { DOCS_TAB_ID, KAFKA_TAB_ID } from '../constants.js';
import { makeLibEditorId, isNotebookId, getNotebookDisplayName, scrollAndFlash } from '../utils.js';
import { createNotebook, makeCell, DEFAULT_NUGET_SOURCES } from '../notebook-factory.js';
import { generateImportCode } from '../data-import-templates.js';

/**
 * Manages notebook tabs: CRUD, save/load, pinned tabs, docs tab,
 * cell navigation, and library/API injection.
 *
 * @param {object} opts
 * @param {object} opts.cancelPendingCellsRef - Ref whose .current(cells) cancels pending executions
 * @param {object} opts.saveSettingsRef       - Ref whose .current() persists all app settings
 */
export function useNotebookManager({ cancelPendingCellsRef, saveSettingsRef }) {
  const initialNb = useRef(null);
  if (!initialNb.current) initialNb.current = createNotebook(true);

  const [notebooks, setNotebooks] = useState([initialNb.current]);
  const [activeId, setActiveId]   = useState(initialNb.current.id);
  const [docsOpen,      setDocsOpen]      = useState(false);
  const [kafkaTabOpen,  setKafkaTabOpen]  = useState(false);
  const [pinnedPaths, setPinnedPaths] = useState(() => new Set());

  const notebooksRef   = useRef(notebooks);
  const activeIdRef    = useRef(activeId);
  const pinnedPathsRef = useRef(pinnedPaths);
  const initialNbIdRef = useRef(initialNb.current.id);
  const prevNbIdRef    = useRef(initialNb.current.id);

  useEffect(() => { notebooksRef.current = notebooks; }, [notebooks]);
  useEffect(() => { activeIdRef.current  = activeId;  }, [activeId]);
  useEffect(() => { pinnedPathsRef.current = pinnedPaths; }, [pinnedPaths]);

  // ── State helpers ──────────────────────────────────────────────────────────

  const setNb = useCallback((id, updater) =>
    setNotebooks((prev) => prev.map((n) => n.id === id
      ? (typeof updater === 'function' ? { ...n, ...updater(n) } : { ...n, ...updater }) : n
    )), []);

  const setNbDirty = useCallback((id, updater) =>
    setNb(id, (n) => ({ ...(typeof updater === 'function' ? updater(n) : updater), isDirty: true })),
    [setNb]);

  // ── Build serialisable notebook data ──────────────────────────────────────

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
      autoRun: nb.autoRun || false,
      cells: nb.cells.map(({ id, type, content, name, color, outputMode, locked, codeFolded, db, label, mode, truePath, falsePath, switchPaths }) => ({
        id, type, content,
        ...(name ? { name } : {}),
        ...(color ? { color } : {}),
        ...(type === 'code' ? { outputMode: outputMode || 'auto', locked: locked || false, ...(codeFolded ? { codeFolded: true } : {}) } : {}),
        ...(type === 'sql'  ? { db: db || '' } : {}),
        ...(type === 'check' || type === 'decision' ? { label: label || '' } : {}),
        ...(type === 'decision' ? { mode: mode || 'bool', truePath: truePath || [], falsePath: falsePath || [], switchPaths: switchPaths || {} } : {}),
      })),
      pipelines: (nb.pipelines || []).map(({ id, name, cellIds, color }) => ({ id, name, cellIds, color: color || null })),
    };
  }, []);

  // ── Save / Load ────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (notebookId) => {
    if (!window.electronAPI) return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    const data = buildNotebookData(notebookId);
    if (nb.path) {
      await window.electronAPI.saveNotebookTo(nb.path, data);
      setNb(notebookId, { isDirty: false });
      window.electronAPI.deleteBackup?.(nb.path);
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
    if (result.success) {
      setNb(notebookId, { path: result.filePath, isDirty: false });
      window.electronAPI.deleteBackup?.(result.filePath);
    }
  }, [buildNotebookData, setNb]);

  const handleLoad = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.loadNotebook();
    if (!result.success || !result.data) return;
    const nb = createNotebook();
    setNotebooks((prev) => [...prev, {
      ...nb,
      path: result.filePath,
      color: result.data.color || null,
      autoRun: result.data.autoRun || false,
      cells: result.data.cells || [],
      pipelines: result.data.pipelines || [],
      nugetPackages: (result.data.packages || []).map((p) => ({ ...p, status: 'pending' })),
      nugetSources: result.data.sources || [...DEFAULT_NUGET_SOURCES],
      config: result.data.config || [],
      attachedDbs: (result.data.attachedDbIds || []).map((id) => ({
        connectionId: id, status: 'connecting', varName: '', schema: null, error: undefined,
      })),
      isDirty: false,
    }]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);
  }, []);

  const handleOpenRecent = useCallback(async (filePath) => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openRecentFile(filePath);
    if (!result.success) {
      alert(`Could not open file:\n${result.error || 'File not found'}`);
      return;
    }
    const nb = createNotebook();
    setNotebooks((prev) => [...prev, {
      ...nb,
      path: result.filePath,
      color: result.data.color || null,
      autoRun: result.data.autoRun || false,
      cells: result.data.cells || [],
      pipelines: result.data.pipelines || [],
      nugetPackages: (result.data.packages || []).map((p) => ({ ...p, status: 'pending' })),
      nugetSources: result.data.sources || [...DEFAULT_NUGET_SOURCES],
      config: result.data.config || [],
      attachedDbs: (result.data.attachedDbIds || []).map((id) => ({
        connectionId: id, status: 'connecting', varName: '', schema: null, error: undefined,
      })),
      isDirty: false,
    }]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);
  }, []);

  const handleImportPolyglot = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.importPolyglotNotebook();
    if (!result.success) {
      if (result.error) alert(`Import failed:\n${result.error}`);
      return;
    }

    const nb = {
      ...createNotebook(),
      title: result.title || 'Imported Notebook',
      path: null,
      cells: result.cells.map((c) => makeCell(c.type, c.content)),
      isDirty: true,
    };
    setNotebooks((prev) => [...prev, nb]);
    setActiveId(nb.id);
    window.electronAPI.startKernel(nb.id);

    if (result.skippedCount > 0) {
      alert(`Imported ${result.cells.length} cell${result.cells.length !== 1 ? 's' : ''} from ${result.format.toUpperCase()} notebook.\n${result.skippedCount} non-C# cell${result.skippedCount !== 1 ? 's' : ''} were skipped.`);
    }
  }, []);

  // ── Tab management ─────────────────────────────────────────────────────────

  const handleNew = useCallback((templateKey = undefined) => {
    const nb = createNotebook(templateKey);
    setNotebooks((prev) => [...prev, nb]);
    setActiveId(nb.id);
    window.electronAPI?.startKernel(nb.id);
  }, []);

  const handleCloseTab = useCallback((tabId) => {
    const current = notebooksRef.current;
    const nb = current.find((n) => n.id === tabId);
    if (!nb) return;
    if (nb.path && pinnedPathsRef.current.has(nb.path)) return;
    if (nb.isDirty && !window.confirm(`Close "${getNotebookDisplayName(nb.path, nb.title)}" without saving?`)) return;

    window.electronAPI?.stopKernel(tabId);
    cancelPendingCellsRef.current(nb.cells);

    const remaining = current.filter((n) => n.id !== tabId);
    if (remaining.length === 0) {
      const fresh = createNotebook();
      window.electronAPI?.startKernel(fresh.id);
      setNotebooks([fresh]);
      setActiveId(fresh.id);
    } else {
      setNotebooks(remaining);
      if (activeIdRef.current === tabId) {
        const idx = current.findIndex((n) => n.id === tabId);
        setActiveId(remaining[Math.min(idx, remaining.length - 1)].id);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReorder = useCallback((dragId, dropId) => {
    setNotebooks((prev) => {
      const from = prev.findIndex((n) => n.id === dragId);
      const to   = prev.findIndex((n) => n.id === dropId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  }, []);

  const handleRenameTab = useCallback(async (notebookId, newName) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    const title = newName.trim();
    if (!nb || !title) return;
    if (nb.path) {
      const safeName = title.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled';
      const newPath  = nb.path.replace(/[^/\\]+\.cnb$/, `${safeName}.cnb`);
      const result   = await window.electronAPI?.renameFile(nb.path, newPath);
      if (result?.success) setNb(notebookId, { path: newPath, title });
    } else {
      setNb(notebookId, { title });
    }
  }, [setNb]);

  const handleSetTabColor = useCallback((notebookId, color) => {
    setNb(notebookId, { color });
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (nb?.path) {
      const data = buildNotebookData(notebookId);
      window.electronAPI?.saveNotebookTo(nb.path, { ...data, color: color || null });
    }
  }, [setNb, buildNotebookData]);

  const handleTogglePin = useCallback((filePath) => {
    setPinnedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
      pinnedPathsRef.current = next;
      saveSettingsRef.current();
      return next;
    });
  }, [saveSettingsRef]);

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

  const handleOpenKafkaTab = useCallback(() => {
    if (activeIdRef.current !== KAFKA_TAB_ID) prevNbIdRef.current = activeIdRef.current;
    setKafkaTabOpen(true);
    setActiveId(KAFKA_TAB_ID);
  }, []);

  const handleCloseKafkaTab = useCallback(() => {
    setKafkaTabOpen(false);
    const target = prevNbIdRef.current ?? notebooksRef.current[0]?.id;
    if (target) setActiveId(target);
  }, []);

  // ── Cell navigation ────────────────────────────────────────────────────────

  const handleNavigateToCell = useCallback((notebookId, cellId) => {
    const pane = document.querySelector(`.notebook-pane[data-nb="${notebookId}"]`);
    if (!pane) return;
    const wrapper = pane.querySelector(`.cell-wrapper[data-cell-id="${cellId}"]`);
    if (!wrapper) return;
    scrollAndFlash(wrapper, 'center');
  }, []);

  // ── Track last focused code cell ──────────────────────────────────────────

  const lastFocusedCodeCellRef = useRef(null); // { nbId, cellId }

  useEffect(() => {
    const onFocusIn = (e) => {
      const editor = e.target.closest?.('.cm-editor');
      if (!editor) return;
      const wrapper = editor.closest('.cell-wrapper[data-cell-id]');
      if (!wrapper) return;
      const pane = editor.closest('.notebook-pane[data-nb]');
      if (!pane) return;
      lastFocusedCodeCellRef.current = { nbId: pane.dataset.nb, cellId: wrapper.dataset.cellId };
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // ── Library / API injection ────────────────────────────────────────────────

  const handleInsertLibraryFile = useCallback((content) => {
    const nbId = activeIdRef.current;
    if (!isNotebookId(nbId)) return;

    let insertAfterIndex = -1;
    const notebook = document.querySelector(`.notebook-pane[data-nb="${nbId}"] .notebook`);
    if (notebook) {
      const wrappers = notebook.querySelectorAll('.cell-wrapper');
      const viewportBottom = notebook.getBoundingClientRect().bottom;
      for (let i = 0; i < wrappers.length; i++) {
        if (wrappers[i].getBoundingClientRect().top < viewportBottom) insertAfterIndex = i;
        else break;
      }
      if (insertAfterIndex < 0 && wrappers.length > 0) insertAfterIndex = wrappers.length - 1;
    }

    const targetIndex = insertAfterIndex + 1;
    setNbDirty(nbId, (n) => {
      const next = [...n.cells];
      next.splice(targetIndex, 0, makeCell('code', content));
      return { cells: next };
    });

    setTimeout(() => {
      const nb = document.querySelector(`.notebook-pane[data-nb="${nbId}"] .notebook`);
      if (!nb) return;
      const target = nb.querySelectorAll('.cell-wrapper')[targetIndex];
      if (target) scrollAndFlash(target);
    }, 50);
  }, [setNbDirty]);

  // ── Data file import ───────────────────────────────────────────────────────

  const handleImportData = useCallback(async () => {
    const result = await window.electronAPI.importDataFile();
    if (!result?.success) return;
    const code = generateImportCode(result.filePath, result.ext);
    handleInsertLibraryFile(code);
  }, [handleInsertLibraryFile]);

  // ── HTML export ────────────────────────────────────────────────────────────

  const handleExportHtml = useCallback(async () => {
    const nbId = activeIdRef.current;
    if (!isNotebookId(nbId)) return;
    const nb = notebooksRef.current.find((n) => n.id === nbId);
    if (!nb) return;

    const title  = getNotebookDisplayName(nb.path, nb.title, 'notebook');
    const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const renderOutput = (msg) => {
      if (msg.type === 'stdout') return `<pre class="out-stdout">${escHtml(msg.content)}</pre>`;
      if (msg.type === 'error')  return `<pre class="out-error">${escHtml(msg.message)}</pre>`;
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
      if (cell.type === 'markdown') return `<div class="md-cell">${marked.parse(cell.content || '')}</div>`;
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

  // ── Pinned tab restore (called by App after settings load) ────────────────

  const openPinnedNotebooks = useCallback(async (pinned) => {
    if (!pinned.length || !window.electronAPI) return;
    setPinnedPaths(new Set(pinned));
    const results = await Promise.allSettled(pinned.map((fp) => window.electronAPI.openRecentFile(fp)));
    const toAdd = [];
    results.forEach((r) => {
      if (r.status !== 'fulfilled' || !r.value?.success) return;
      const nb = createNotebook();
      toAdd.push({
        nb: {
          ...nb,
          path: r.value.filePath,
          color: r.value.data.color || null,
          cells: r.value.data.cells || [],
          pipelines: r.value.data.pipelines || [],
          nugetPackages: (r.value.data.packages || []).map((p) => ({ ...p, status: 'pending' })),
          nugetSources: r.value.data.sources || [...DEFAULT_NUGET_SOURCES],
          config: r.value.data.config || [],
          attachedDbs: (r.value.data.attachedDbIds || []).map((id) => ({
            connectionId: id, status: 'connecting', varName: '', schema: null, error: undefined,
          })),
          isDirty: false,
        },
      });
    });
    if (toAdd.length === 0) return;
    setNotebooks((prev) => {
      const initId  = initialNbIdRef.current;
      const initNb  = prev.find((n) => n.id === initId);
      const isBlank = initNb && !initNb.isDirty && !initNb.path
        && initNb.cells.length <= 1 && !initNb.cells[0]?.content;
      const base    = isBlank ? prev.filter((n) => n.id !== initId) : prev;
      const existing = new Set(base.map((n) => n.path).filter(Boolean));
      return [...base, ...toAdd.filter(({ nb }) => !existing.has(nb.path)).map(({ nb }) => nb)];
    });
    toAdd.forEach(({ nb }) => window.electronAPI.startKernel(nb.id));
  }, []);

  return {
    // State
    notebooks,
    setNotebooks,
    activeId,
    setActiveId,
    docsOpen,
    setDocsOpen,
    kafkaTabOpen,
    setKafkaTabOpen,
    pinnedPaths,
    setPinnedPaths,
    // Refs
    notebooksRef,
    activeIdRef,
    pinnedPathsRef,
    // Helpers
    setNb,
    setNbDirty,
    buildNotebookData,
    // Handlers
    handleNew,
    handleLoad,
    handleImportPolyglot,
    handleOpenRecent,
    handleCloseTab,
    handleReorder,
    handleRenameTab,
    handleSetTabColor,
    handleSave,
    handleSaveAs,
    handleExportHtml,
    handleOpenDocs,
    handleCloseDocs,
    handleOpenKafkaTab,
    handleCloseKafkaTab,
    handleTogglePin,
    handleNavigateToCell,
    handleInsertLibraryFile,
    handleImportData,
    openPinnedNotebooks,
  };
}
