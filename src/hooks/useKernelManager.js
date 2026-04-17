import { useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

async function resolveConfig(nb) {
  const configEntries = nb?.config || [];
  const resolved = {};
  for (const e of configEntries) resolved[e.key] = e.value;
  const envEntries = configEntries.filter((e) => e.envVar);
  if (envEntries.length > 0) {
    const envVals = await Promise.all(envEntries.map((e) => window.electronAPI.getEnvVar(e.envVar)));
    envEntries.forEach((e, i) => { if (envVals[i]) resolved[e.key] = envVals[i]; });
  }
  return resolved;
}

function prepareCellRun(setNb, pendingResolversRef, notebookId, cellId, resolve) {
  setNb(notebookId, (n) => {
    const prevOutputs = n.outputs[cellId];
    const newOutputHistory = { ...(n.outputHistory || {}) };
    if (prevOutputs?.length > 0) {
      newOutputHistory[cellId] = [...(newOutputHistory[cellId] || []).slice(-4), prevOutputs];
    }
    const cell = n.cells.find(c => c.id === cellId);
    const updatedCells = cell ? n.cells.map(c => c.id === cellId ? { ...c, _lastRunCode: c.content } : c) : n.cells;
    return {
      cells: updatedCells,
      outputs: { ...n.outputs, [cellId]: [] },
      outputHistory: newOutputHistory,
      cellResults: { ...(n.cellResults || {}), [cellId]: null },
      running: new Set([...n.running, cellId]),
    };
  });
  pendingResolversRef.current[cellId] = resolve;
}

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
export function useKernelManager({ setNb, notebooksRef, dbConnectionsRef, setVarInspectDialog, onPanelVisible, onPanelDock, onPanelFloat, onPanelCloseAll, onApiEditorLoad, setDbConnections }) {
  const pendingResolversRef = useRef({});
  const prevVarsSnapRef       = useRef({});
  const runAllRef             = useRef(null);

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

          // Send embedded files to kernel
          if (nb.embeddedFiles?.length > 0) {
            window.electronAPI.sendToKernel(notebookId, {
              type: 'set_embedded_files',
              files: nb.embeddedFiles,
            });
          }

          // Auto-run on open
          if (nb.autoRun) {
            setTimeout(() => runAllRef.current?.(notebookId), 200);
          } else {
            // Auto-execute presenting cells on kernel ready
            const presentingCells = nb.cells.filter((c) => c.type === 'code' && c.presenting);
            if (presentingCells.length > 0) {
              setTimeout(async () => {
                for (const cell of presentingCells) {
                  const nbNow = notebooksRef.current.find((n) => n.id === notebookId);
                  if (!nbNow || nbNow.kernelStatus !== 'ready') break;
                  await runCell(notebookId, cell);
                }
              }, 200);
            }

            // Auto-execute docker cells with runOnStartup
            const startupDockerCells = nb.cells.filter((c) => c.type === 'docker' && c.runOnStartup && c.image);
            if (startupDockerCells.length > 0) {
              setTimeout(async () => {
                for (const cell of startupDockerCells) {
                  const nbNow = notebooksRef.current.find((n) => n.id === notebookId);
                  if (!nbNow || nbNow.kernelStatus !== 'ready') break;
                  await runDockerCell(notebookId, cell);
                }
              }, 300);
            }
          }

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

        case 'check_result':
          if (msg.id) {
            setNb(notebookId, (n) => ({
              checkResults: { ...(n.checkResults || {}), [msg.id]: { passed: msg.passed, message: msg.message } },
            }));
          }
          break;

        case 'decision_result':
          if (msg.id) {
            setNb(notebookId, (n) => ({
              decisionResults: { ...(n.decisionResults || {}), [msg.id]: { result: msg.result, message: msg.message } },
            }));
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

            return { running: next, cellResults: { ...(n.cellResults || {}), [msg.id]: result }, cellElapsed: { ...(n.cellElapsed || {}), [msg.id]: msg.durationMs ?? null }, staleCellIds, debugState: null, ...extra };
          });
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

        case 'memory_mb': {
          const gc = msg.gc ?? 0;
          setNb(notebookId, (n) => {
            const prevGc = n._lastGcCount ?? 0;
            const gcHappened = gc > prevGc;
            return {
              memoryHistory: [...n.memoryHistory.slice(-59), { mb: msg.mb, gc: gcHappened }],
              memoryWarning: msg.mb > 1024 ? `Kernel memory: ${Math.round(msg.mb)}MB` : null,
              _lastGcCount: gc,
            };
          });
          break;
        }

        case 'var_point':
          setNb(notebookId, (n) => {
            const hist = { ...(n.varHistory || {}) };
            const pt = { v: msg.value, t: msg.time ?? Date.now(), axis: msg.axis ?? 'y', ...(msg.chartType ? { chartType: msg.chartType } : {}) };
            hist[msg.name] = [...(hist[msg.name] || []).slice(-49), pt];
            return { varHistory: hist };
          });
          break;

        case 'inline_diagnostics':
          if (msg.id) {
            setNb(notebookId, (n) => ({
              inlineDiagnostics: { ...(n.inlineDiagnostics || {}), [msg.id]: msg.diagnostics },
            }));
          }
          break;

        case 'paused':
          setNb(notebookId, {
            debugState: { cellId: msg.id, line: msg.line, variables: msg.variables, paused: true },
          });
          break;

        case 'vars_update': {
          setNb(notebookId, (n) => {
            const prevVars = n.vars || [];
            const prevMap = new Map(prevVars.map(v => [v.name, v.value]));
            const newMap = new Map(msg.vars.map(v => [v.name, v.value]));
            const diff = {};
            for (const v of msg.vars) {
              if (!prevMap.has(v.name)) diff[v.name] = 'new';
              else if (prevMap.get(v.name) !== v.value) diff[v.name] = 'modified';
            }
            for (const v of prevVars) {
              if (!newMap.has(v.name)) diff[v.name] = 'removed';
            }
            return { vars: msg.vars, varDiff: Object.keys(diff).length > 0 ? diff : null };
          });
          // Clear diff highlight after 5 seconds
          setTimeout(() => setNb(notebookId, { varDiff: null }), 5000);
          break;
        }

        case 'docker_started':
          setNb(notebookId, (n) => ({
            cells: n.cells.map((c) =>
              c.id === msg.id ? { ...c, containerId: msg.containerId, containerState: 'running' } : c
            ),
          }));
          break;

        case 'docker_stopped':
          setNb(notebookId, (n) => ({
            cells: n.cells.map((c) =>
              c.id === msg.id ? { ...c, containerId: null, containerState: 'stopped' } : c
            ),
          }));
          break;

        case 'docker_status': {
          const newState = msg.running ? 'running' : 'stopped';
          const newPorts = msg.ports || '';
          setNb(notebookId, (n) => ({
            cells: n.cells.map((c) => {
              if (c.id !== msg.id) return c;
              const newHealth = msg.healthStatus || null;
              if (c.containerState === newState && c.containerPorts === newPorts && c.healthStatus === newHealth) return c;
              return { ...c, containerState: newState, containerPorts: newPorts, healthStatus: newHealth };
            }),
          }));
          break;
        }

        case 'docker_logs':
          setNb(notebookId, (n) => ({
            cells: n.cells.map((c) =>
              c.id === msg.id ? { ...c, containerLogs: msg.logs || '' } : c
            ),
          }));
          break;

        case 'file_embed':
          setNb(notebookId, (n) => {
            const idx = (n.embeddedFiles || []).findIndex(f => f.name === msg.name);
            const file = { name: msg.name, filename: msg.filename, mimeType: msg.mimeType,
                           content: msg.content, encoding: msg.encoding || 'base64', variables: msg.variables || {} };
            const files = idx >= 0
              ? n.embeddedFiles.map((f, i) => i === idx ? file : f)
              : [...(n.embeddedFiles || []), file];
            return { embeddedFiles: files };
          });
          break;

        case 'file_var_set':
          setNb(notebookId, (n) => ({
            embeddedFiles: (n.embeddedFiles || []).map(f =>
              f.name === msg.name ? { ...f, variables: { ...f.variables, [msg.key]: msg.value } } : f
            ),
          }));
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

        case 'api_editor_load':
          onApiEditorLoad?.(msg.apiIdOrTitle);
          break;

        // ── DB management ───────────────────────────────────────────────────────

        case 'db_add': {
          const duplicate = dbConnectionsRef.current.some(
            (c) => c.name.toLowerCase() === msg.name.toLowerCase()
          );
          if (duplicate) {
            if (msg.requestId) {
              window.electronAPI?.sendToKernel(notebookId, {
                type: 'db_add_result',
                requestId: msg.requestId,
                error: `A connection named "${msg.name}" already exists.`,
              });
            }
            break;
          }
          const newConn = { id: uuidv4(), name: msg.name, provider: msg.provider, connectionString: msg.connectionString };
          setDbConnections?.((cs) => [...cs, newConn]);
          // Also update the ref immediately: React's state updater is called lazily, so
          // dbConnectionsRef.current would still be stale if db_attach arrives in the
          // same IPC message batch (e.g. Db.Add and Db.Attach called in the same cell).
          dbConnectionsRef.current = [...dbConnectionsRef.current, newConn];
          if (msg.requestId) {
            window.electronAPI?.sendToKernel(notebookId, {
              type: 'db_add_result',
              requestId: msg.requestId,
            });
          }
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
            ...(msg.cellId ? { cellId: msg.cellId } : {}),
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
              : [...n.config, { key: msg.key, value: msg.value, type: 'string' }];
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

        case 'kernel_status':
          if (msg.status) setNb(notebookId, { kernelStatus: msg.status });
          break;

        case 'db_schema':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.map((d) =>
              d.connectionId === msg.connectionId
                ? { ...d, schema: { databaseName: msg.databaseName, tables: msg.tables, redisCursor: msg.redisCursor ?? 0 } }
                : d
            ),
          }));
          break;

        case 'db_redis_page':
          setNb(notebookId, (n) => ({
            attachedDbs: n.attachedDbs.map((d) => {
              if (d.connectionId !== msg.connectionId || !d.schema) return d;
              // Merge new tables into existing schema
              const merged = [...d.schema.tables];
              for (const t of msg.tables) {
                const idx = merged.findIndex((m) => m.name === t.name);
                if (idx >= 0) {
                  // Append new columns to existing table, dedup by name
                  const existing = new Set(merged[idx].columns.map((c) => c.name));
                  const newCols = t.columns.filter((c) => !existing.has(c.name));
                  merged[idx] = { ...merged[idx], columns: [...merged[idx].columns, ...newCols] };
                } else {
                  merged.push(t);
                }
              }
              return { ...d, schema: { ...d.schema, tables: merged, redisCursor: msg.redisCursor ?? 0 } };
            }),
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
          setNb(notebookId, (n) => {
            const attachedDbs = n.attachedDbs.map((d) =>
              d.connectionId === msg.connectionId
                ? { ...d, status: 'error', error: msg.message }
                : d
            );
            if (!msg.cellId) return { attachedDbs };
            const cellOutputs = n.outputs[msg.cellId] || [];
            return {
              attachedDbs,
              outputs: {
                ...n.outputs,
                [msg.cellId]: [...cellOutputs, { type: 'error', id: msg.cellId, message: msg.message }],
              },
            };
          });
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

  const runCell = useCallback(async (notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'code') return Promise.resolve();
    prevVarsSnapRef.current[cell.id] = [
      ...(notebooksRef.current.find((n) => n.id === notebookId)?.vars || []),
    ];
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    const resolvedConfig = await resolveConfig(nb);

    return new Promise((resolve) => {
      prepareCellRun(setNb, pendingResolversRef, notebookId, cell.id, resolve);
      setNb(notebookId, (n) => ({
        staleCellIds: (n.staleCellIds || []).filter((id) => id !== cell.id),
      }));
      const breakpoints = nb?.breakpoints?.[cell.id] || [];
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute',
        id: cell.id,
        code: cell.content,
        outputMode: cell.outputMode || 'auto',
        sources: nb ? nb.nugetSources.filter((s) => s.enabled).map((s) => s.url) : [],
        config: resolvedConfig,
        ...(breakpoints.length > 0 ? { breakpoints } : {}),
      });
    });
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  const runCellWithFormData = useCallback(async (notebookId, cell, formData) => {
    if (!window.electronAPI || cell.type !== 'code') return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    const resolvedConfig = await resolveConfig(nb);

    return new Promise((resolve) => {
      prepareCellRun(setNb, pendingResolversRef, notebookId, cell.id, resolve);
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute',
        id: cell.id,
        code: cell.content,
        outputMode: cell.outputMode || 'auto',
        sources: nb ? nb.nugetSources.filter((s) => s.enabled).map((s) => s.url) : [],
        config: resolvedConfig,
        formData,
      });
    });
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAll = useCallback(async (notebookId) => {
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    if (!nb) return;
    for (const cell of nb.cells.filter((c) => c.type === 'code')) await runCell(notebookId, cell);
  }, [runCell]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the ref in sync so the ready handler can call runAll
  runAllRef.current = runAll;

  const runSqlCell = useCallback(async (notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'sql') return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    const effectiveDb = cell.db || nb?.attachedDbs?.find((d) => d.status === 'ready')?.connectionId || '';
    const attached = nb?.attachedDbs?.find((d) => d.connectionId === effectiveDb && d.status === 'ready');
    if (!attached) return;

    const resolvedConfig = await resolveConfig(nb);

    return new Promise((resolve) => {
      prepareCellRun(setNb, pendingResolversRef, notebookId, cell.id, resolve);
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute_sql',
        id: cell.id,
        sql: cell.content,
        varName: attached.varName,
        config: resolvedConfig,
      });
    });
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  const runHttpCell = useCallback(async (notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'http') return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);

    const resolvedConfig = await resolveConfig(nb);

    return new Promise((resolve) => {
      prepareCellRun(setNb, pendingResolversRef, notebookId, cell.id, resolve);
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute_http',
        id: cell.id,
        content: cell.content,
        config: resolvedConfig,
      });
    });
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  const runShellCell = useCallback((notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'shell') return Promise.resolve();

    return new Promise((resolve) => {
      prepareCellRun(setNb, pendingResolversRef, notebookId, cell.id, resolve);
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute_shell',
        id: cell.id,
        content: cell.content,
        ...(cell.workingDir ? { cwd: cell.workingDir } : {}),
      });
    });
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  const runDockerCell = useCallback((notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'docker') return Promise.resolve();

    return new Promise((resolve) => {
      prepareCellRun(setNb, pendingResolversRef, notebookId, cell.id, resolve);
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute_docker',
        id: cell.id,
        image: cell.image || '',
        containerName: cell.containerName || '',
        ports: cell.ports || '',
        env: cell.env || '',
        volume: cell.volume || '',
        command: cell.command || '',
      });
    });
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopDockerCell = useCallback((notebookId, cellId, containerId) => {
    if (!window.electronAPI) return;
    window.electronAPI.sendToKernel(notebookId, {
      type: 'stop_docker',
      id: cellId,
      containerId,
    });
  }, []);

  const pollDockerStatus = useCallback((notebookId, cellId, containerId) => {
    if (!window.electronAPI) return;
    window.electronAPI.sendToKernel(notebookId, {
      type: 'docker_status',
      id: cellId,
      containerId,
    });
  }, []);

  const fetchDockerLogs = useCallback((notebookId, cellId, containerId) => {
    if (!window.electronAPI) return;
    window.electronAPI.sendToKernel(notebookId, {
      type: 'docker_logs',
      id: cellId,
      containerId,
      tail: 200,
    });
  }, []);

  const runCheckCell = useCallback(async (notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'check') return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    const resolvedConfig = await resolveConfig(nb);

    return new Promise((resolve) => {
      prepareCellRun(setNb, pendingResolversRef, notebookId, cell.id, resolve);
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute_check',
        id: cell.id,
        expression: cell.content,
        label: cell.label || '',
        config: resolvedConfig,
      });
    });
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

  const runDecisionCell = useCallback(async (notebookId, cell) => {
    if (!window.electronAPI || cell.type !== 'decision') return;
    const nb = notebooksRef.current.find((n) => n.id === notebookId);
    const resolvedConfig = await resolveConfig(nb);

    return new Promise((resolve) => {
      prepareCellRun(setNb, pendingResolversRef, notebookId, cell.id, resolve);
      window.electronAPI.sendToKernel(notebookId, {
        type: 'execute_decision',
        id: cell.id,
        expression: cell.content,
        label: cell.label || '',
        mode: cell.mode || 'bool',
        config: resolvedConfig,
      });
    });
  }, [setNb]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Debug actions ──────────────────────────────────────────────────────────

  const debugResume = useCallback((notebookId) => {
    window.electronAPI?.sendToKernel(notebookId, { type: 'debug_resume' });
    setNb(notebookId, { debugState: null });
  }, [setNb]);

  const debugStep = useCallback((notebookId) => {
    window.electronAPI?.sendToKernel(notebookId, { type: 'debug_step' });
    setNb(notebookId, { debugState: null }); // cleared; will be re-set on next 'paused' message
  }, [setNb]);

  const toggleBreakpoint = useCallback((notebookId, cellId, line) => {
    setNb(notebookId, (n) => {
      const current = n.breakpoints?.[cellId] || [];
      const updated = current.includes(line)
        ? current.filter((l) => l !== line)
        : [...current, line];
      return { breakpoints: { ...(n.breakpoints || {}), [cellId]: updated } };
    });
  }, [setNb]);

  return {
    runCell,
    runCellWithFormData,
    runSqlCell,
    runHttpCell,
    runShellCell,
    runDockerCell,
    stopDockerCell,
    pollDockerStatus,
    fetchDockerLogs,
    runCheckCell,
    runDecisionCell,
    runAll,
    runFrom,
    runTo,
    handleInterrupt,
    handleReset,
    cancelPendingCells,
    debugResume,
    debugStep,
    toggleBreakpoint,
  };
}
