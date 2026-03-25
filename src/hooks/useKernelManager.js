import { useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { COMPLETION_TIMEOUT, LINT_TIMEOUT } from '../constants.js';

/**
 * Manages kernel communication: message routing, cell execution,
 * completions, lint, interrupt, and reset.
 *
 * @param {object}   opts
 * @param {function} opts.setNb               - Notebook state updater from useNotebookManager
 * @param {object}   opts.notebooksRef        - Ref to current notebooks array
 * @param {object}   opts.dbConnectionsRef    - Ref to current DB connections array
 * @param {function} opts.setVarInspectDialog - Dialog state setter for var_inspect_result
 * @param {function} opts.onPanelVisible      - (panelId, open: true|false|null) — open, close, or toggle a panel
 * @param {function} opts.onPanelDock         - (panelId, zone, size: number|null) — dock panel to a zone
 * @param {function} opts.onPanelFloat        - (panelId, x, y, w, h) — float panel with optional position/size
 * @param {function} opts.onPanelCloseAll     - () — close all open panels
 * @param {function} opts.setDbConnections    - DB connections state setter
 */
export function useKernelManager({ setNb, notebooksRef, dbConnectionsRef, setVarInspectDialog, onPanelVisible, onPanelDock, onPanelFloat, onPanelCloseAll, setDbConnections }) {
  const pendingResolversRef   = useRef({});
  const pendingCompletionsRef = useRef({});
  const pendingLintRef        = useRef({});
  const prevVarsSnapRef       = useRef({});

  const cancelPendingCells = useCallback((cells) => {
    cells.forEach((cell) => {
      const resolve = pendingResolversRef.current[cell.id];
      if (resolve) {
        delete pendingResolversRef.current[cell.id];
        resolve({ success: false });
      }
    });
  }, []);

  // Start kernels for all open notebooks on mount
  useEffect(() => {
    for (const nb of notebooksRef.current) {
      window.electronAPI?.startKernel(nb.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Kernel message router ──────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return;

    const handler = ({ notebookId, message: msg }) => {
      switch (msg.type) {

        case 'ready': {
          setNb(notebookId, { kernelStatus: 'ready', vars: [] });
          const nb = notebooksRef.current.find((n) => n.id === notebookId);
          if (!nb) break;

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

          for (const d of nb.attachedDbs.filter((d) => d.status === 'connecting')) {
            const conn = dbConnectionsRef.current.find((c) => c.id === d.connectionId);
            if (!conn) continue;
            const varName = conn.name
              .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
              .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
              .replace(/^[^a-zA-Z]/, 'db');
            setNb(notebookId, (n) => ({
              attachedDbs: n.attachedDbs.map((a) =>
                a.connectionId === d.connectionId ? { ...a, varName } : a
              ),
            }));
            window.electronAPI.sendToKernel(notebookId, {
              type: 'db_connect',
              connectionId: conn.id,
              name: conn.name,
              provider: conn.provider,
              connectionString: conn.connectionString,
              varName,
            });
          }
          break;
        }

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
            const extra  = msg.cancelled
              ? { outputs: { ...n.outputs, [msg.id]: [...(n.outputs[msg.id] || []), { type: 'interrupted' }] } }
              : {};

            // Reactive cell dependency tracking
            let staleCellIds = [...(n.staleCellIds || [])].filter((id) => id !== msg.id);
            if (!msg.cancelled && msg.success) {
              const prevSnap  = prevVarsSnapRef.current[msg.id] || [];
              delete prevVarsSnapRef.current[msg.id];
              const prevMap   = Object.fromEntries(prevSnap.map((v) => [v.name, v.value]));
              const changed   = (n.vars || [])
                .filter((v) => v.name in prevMap && prevMap[v.name] !== v.value)
                .map((v) => v.name);
              if (changed.length > 0) {
                const runIdx = n.cells.findIndex((c) => c.id === msg.id);
                for (const cell of n.cells.slice(runIdx + 1)) {
                  if (cell.type !== 'code' || staleCellIds.includes(cell.id)) continue;
                  const uses = changed.some((name) => {
                    try { return new RegExp(`\\b${name}\\b`).test(cell.content || ''); }
                    catch { return false; }
                  });
                  if (uses) staleCellIds.push(cell.id);
                }
              }
            }

            return { running: next, cellResults: { ...(n.cellResults || {}), [msg.id]: result }, staleCellIds, ...extra };
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
          setNb(notebookId, (n) => ({ memoryHistory: [...n.memoryHistory.slice(-59), msg.mb] }));
          break;

        case 'var_point':
          setNb(notebookId, (n) => {
            const hist = { ...(n.varHistory || {}) };
            hist[msg.name] = [...(hist[msg.name] || []).slice(-49), msg.value];
            return { varHistory: hist };
          });
          break;

        case 'vars_update':
          setNb(notebookId, { vars: msg.vars });
          break;

        case 'graph_clear':
          setNb(notebookId, { varHistory: {} });
          break;

        // ── Panel control ───────────────────────────────────────────────────────

        case 'panel_open':
          onPanelVisible?.(msg.panel, true);
          break;

        case 'panel_close':
          onPanelVisible?.(msg.panel, false);
          break;

        case 'panel_toggle':
          onPanelVisible?.(msg.panel, null);
          break;

        case 'panel_dock':
          onPanelDock?.(msg.panel, msg.zone, msg.size ?? null);
          break;

        case 'panel_float':
          onPanelFloat?.(msg.panel, msg.x ?? null, msg.y ?? null, msg.w ?? null, msg.h ?? null);
          break;

        case 'panel_close_all':
          onPanelCloseAll?.();
          break;

        // ── DB management ───────────────────────────────────────────────────────

        case 'db_add': {
          const newConn = { id: uuidv4(), name: msg.name, provider: msg.provider, connectionString: msg.connectionString };
          setDbConnections?.((cs) => [...cs, newConn]);
          break;
        }

        case 'db_remove':
          setDbConnections?.((cs) => cs.filter((c) => c.name !== msg.name));
          break;

        case 'db_attach': {
          const conn = dbConnectionsRef.current.find((c) => c.name === msg.name);
          if (!conn) break;
          const varName = conn.name
            .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
            .replace(/^[A-Z]/, (ch) => ch.toLowerCase())
            .replace(/^[^a-zA-Z]/, 'db');
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.some((d) => d.connectionId === conn.id)
              ? n.attachedDbs
              : [...n.attachedDbs, { connectionId: conn.id, status: 'connecting', varName }],
          }));
          window.electronAPI?.sendToKernel(notebookId, {
            type: 'db_connect',
            connectionId: conn.id,
            name: conn.name,
            provider: conn.provider,
            connectionString: conn.connectionString,
            varName,
          });
          break;
        }

        case 'db_detach': {
          const connToDetach = dbConnectionsRef.current.find((c) => c.name === msg.name);
          if (!connToDetach) break;
          window.electronAPI?.sendToKernel(notebookId, {
            type: 'db_disconnect',
            connectionId: connToDetach.id,
          });
          break;
        }

        case 'db_list_request': {
          const nb = notebooksRef.current.find((n) => n.id === notebookId);
          const connections = (dbConnectionsRef.current || []).map((c) => ({
            name: c.name,
            provider: c.provider,
            isAttached: !!(nb?.attachedDbs?.some((d) => d.connectionId === c.id && d.status === 'ready')),
          }));
          window.electronAPI?.sendToKernel(notebookId, {
            type: 'db_list_response',
            requestId: msg.requestId,
            connections,
          });
          break;
        }

        // ── Config write-back ───────────────────────────────────────────────────

        case 'config_set':
          setNb(notebookId, (n) => {
            const existing = n.config.findIndex((e) => e.key === msg.key);
            const config = existing >= 0
              ? n.config.map((e, i) => (i === existing ? { ...e, value: msg.value } : e))
              : [...n.config, { key: msg.key, value: msg.value }];
            return { config };
          });
          break;

        case 'config_remove':
          setNb(notebookId, (n) => ({ config: n.config.filter((e) => e.key !== msg.key) }));
          break;

        case 'nuget_preload_complete':
          break;

        case 'var_inspect_result':
          setVarInspectDialog((prev) =>
            prev && prev.name === msg.name ? { ...prev, fullValue: msg.json } : prev
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
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cell execution ─────────────────────────────────────────────────────────

  const runCell = useCallback((notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'code') return Promise.resolve();
    prevVarsSnapRef.current[cell.id] = [
      ...(notebooksRef.current.find((n) => n.id === notebookId)?.vars || []),
    ];
    return new Promise((resolve) => {
      setNb(notebookId, (n) => {
        const prevOutputs = n.outputs[cell.id];
        const newOutputHistory = { ...(n.outputHistory || {}) };
        if (prevOutputs?.length > 0) {
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
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAll = useCallback(async (notebookId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    for (const cell of nb.cells.filter((c) => c.type === 'code')) await runCell(notebookId, cell);
  }, [runCell]); // eslint-disable-line react-hooks/exhaustive-deps

  const runFrom = useCallback(async (notebookId, cellId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb || nb.running.size > 0) return;
    const idx = nb.cells.findIndex((c) => c.id === cellId);
    if (idx < 0) return;
    for (const cell of nb.cells.slice(idx).filter((c) => c.type === 'code'))
      await runCell(notebookId, cell);
  }, [runCell]); // eslint-disable-line react-hooks/exhaustive-deps

  const runTo = useCallback(async (notebookId, cellId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb || nb.running.size > 0) return;
    const idx = nb.cells.findIndex((c) => c.id === cellId);
    if (idx < 0) return;
    for (const cell of nb.cells.slice(0, idx + 1).filter((c) => c.type === 'code'))
      await runCell(notebookId, cell);
  }, [runCell]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInterrupt = useCallback((notebookId) => {
    window.electronAPI?.interruptKernel(notebookId);
  }, []);

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
      nugetPackages: n.nugetPackages.map((p) =>
        (p.status === 'loaded' || p.status === 'loading') ? { ...p, status: 'pending' } : p
      ),
      attachedDbs: n.attachedDbs.map((d) =>
        d.status !== 'error' ? { ...d, status: 'connecting', schema: null } : d
      ),
    }));
    window.electronAPI.resetKernel(notebookId);
  }, [setNb, cancelPendingCells]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return {
    runCell,
    runAll,
    runFrom,
    runTo,
    handleInterrupt,
    handleReset,
    requestCompletions,
    requestLint,
    cancelPendingCells,
  };
}
