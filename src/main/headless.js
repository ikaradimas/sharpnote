'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const { decryptConfigSecrets } = require('./notebook-io');
const { getKernelSpawnArgs } = require('./kernel-manager');
const logOps = require('./log-ops');
const snapshots = require('./snapshots');

/**
 * Parse CLI arguments after the `run` subcommand.
 *
 *   electron . run <notebook> [--config Key=Value]... [--output path] [--format text|json]
 */
function parseArgs(args) {
  const result = { notebook: null, config: {}, params: {}, output: null, format: 'text', checkSnapshots: false };
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--config' && i + 1 < args.length) {
      const [key, ...rest] = args[i + 1].split('=');
      result.config[key] = rest.join('=');
      i += 2;
    } else if (args[i] === '--param' && i + 1 < args.length) {
      const [key, ...rest] = args[i + 1].split('=');
      result.params[key] = rest.join('=');
      i += 2;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      result.output = args[i + 1];
      i += 2;
    } else if (args[i] === '--format' && i + 1 < args.length) {
      result.format = args[i + 1];
      i += 2;
    } else if (args[i] === '--check-snapshots') {
      result.checkSnapshots = true;
      i++;
    } else if (!args[i].startsWith('--') && !result.notebook) {
      result.notebook = args[i];
      i++;
    } else {
      i++;
    }
  }
  return result;
}

/**
 * Apply --param overrides to the notebook params array. Names not declared
 * by the notebook are an error (return null). Values are coerced according
 * to the param's declared type.
 */
function applyParamOverrides(params, overrides) {
  const entries = Array.isArray(params) ? params.map((p) => ({ ...p })) : [];
  for (const [name, raw] of Object.entries(overrides)) {
    const p = entries.find((e) => e.name === name);
    if (!p) return { error: `Unknown --param "${name}". Notebook declares: ${entries.map((e) => e.name).join(', ') || '(none)'}` };
    p.value = coerceParam(raw, p.type);
  }
  return { entries };
}

function coerceParam(raw, type) {
  switch (type) {
    case 'int':    { const n = parseInt(raw, 10); return Number.isFinite(n) ? n : 0; }
    case 'double': { const n = parseFloat(raw);    return Number.isFinite(n) ? n : 0; }
    case 'bool':   return /^(true|1|yes)$/i.test(raw);
    default:       return raw;
  }
}

/**
 * Load a .cnb notebook file from disk, decrypting config secrets.
 */
function loadNotebook(notebookPath) {
  const abs = path.resolve(notebookPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Notebook not found: ${abs}`);
  }
  const content = fs.readFileSync(abs, 'utf-8');
  const data = JSON.parse(content);
  data.config = decryptConfigSecrets(data.config);
  return data;
}

/**
 * Apply --config overrides to the notebook config array.
 * Existing keys are updated; new keys are added as type "text".
 */
function applyConfigOverrides(config, overrides) {
  const entries = Array.isArray(config) ? [...config] : [];
  for (const [key, value] of Object.entries(overrides)) {
    const idx = entries.findIndex((e) => e.key === key);
    if (idx >= 0) {
      entries[idx] = { ...entries[idx], value };
    } else {
      entries.push({ key, value, type: 'text' });
    }
  }
  return entries;
}

const EXECUTABLE_TYPES = new Set(['code', 'sql', 'http', 'shell', 'check']);

function log(tag, message) {
  logOps.writeLog(tag, message);
}

/** Summarise a kernel message for the log — keeps entries readable. */
function summariseMsg(msg) {
  switch (msg.type) {
    case 'stdout':   return msg.content ? msg.content.slice(0, 500) : '(empty)';
    case 'display':  return `format=${msg.format || 'html'} content=${(msg.text || msg.data || JSON.stringify(msg.content || '')).slice(0, 200)}`;
    case 'error':    return msg.message || '(no message)';
    case 'vars_update': return `${(msg.vars || []).length} variables`;
    case 'nuget_status': return `${msg.id} ${msg.status}${msg.message ? ` — ${msg.message}` : ''}`;
    case 'check_result': return `${msg.passed ? 'PASS' : 'FAIL'} ${msg.message || ''}`;
    case 'decision_result': return `result=${msg.result} ${msg.message || ''}`;
    case 'memory_mb': return `${msg.mb} MB`;
    case 'log':       return `[${msg.tag}] ${msg.message}`;
    case 'complete':  return `success=${msg.success}${msg.cancelled ? ' (cancelled)' : ''}`;
    default:          return JSON.stringify(msg).slice(0, 300);
  }
}

/**
 * Execute a single cell against a running kernel and collect outputs.
 * Returns { outputs, success } where success is from the `complete` message.
 */
function executeCell(kernelProcess, rl, cell, cellLabel) {
  return new Promise((resolve) => {
    const id = cell.id;
    const outputs = [];
    let resolved = false;

    const handler = (line) => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }

      // Log every kernel message for this cell
      if (msg.id === id || !msg.id) {
        log('KERNEL', `${cellLabel} ${msg.type}: ${summariseMsg(msg)}`);
      }

      if (msg.id !== id) return;

      if (msg.type === 'complete') {
        resolved = true;
        rl.off('line', handler);
        resolve({ outputs, success: msg.success !== false });
      } else if (msg.type === 'error') {
        outputs.push({ type: 'error', message: msg.message });
      } else if (msg.type === 'output' || msg.type === 'display') {
        outputs.push(msg);
      } else if (msg.type === 'stdout') {
        outputs.push(msg);
      } else {
        outputs.push(msg);
      }
    };

    rl.on('line', handler);

    const message = {
      type: 'execute',
      id,
      code: cell.content || cell.code || '',
      cellType: cell.cellType || cell.type || 'code',
      ...(cell._params ? { params: cell._params } : {}),
    };
    kernelProcess.stdin.write(JSON.stringify(message) + '\n');

    // Safety timeout — 5 minutes per cell
    setTimeout(() => {
      if (!resolved) {
        rl.off('line', handler);
        resolve({ outputs: [{ type: 'error', message: 'Cell execution timed out after 5 minutes' }], success: false });
      }
    }, 5 * 60 * 1000);
  });
}

/**
 * Format cell outputs for text display.
 */
function formatOutputs(cellIndex, cell, outputs, format) {
  const lines = [];
  const label = cell.title || cell.id || `Cell ${cellIndex + 1}`;

  if (format === 'json') return outputs;

  for (const out of outputs) {
    if (out.type === 'error') {
      lines.push(`[${label}] ERROR: ${out.message}`);
    } else if (out.type === 'stdout') {
      const text = out.content || out.text || '';
      if (text) lines.push(`[${label}] ${text}`);
    } else if (out.type === 'output') {
      const text = out.text || out.data || out.message || '';
      if (text) lines.push(`[${label}] ${text}`);
    } else if (out.type === 'display') {
      const text = out.text || out.data || JSON.stringify(out);
      lines.push(`[${label}] ${text}`);
    } else if (out.text || out.data || out.message || out.content) {
      lines.push(`[${label}] ${out.text || out.data || out.message || out.content}`);
    }
  }
  return lines;
}

/**
 * Main headless execution entry point.
 *
 * @param {Electron.App} app
 * @param {string[]} args — arguments after `run`
 * @returns {Promise<number>} exit code (0 = success, 1 = failure)
 */
async function run(app, args) {
  const opts = parseArgs(args);

  if (!opts.notebook) {
    console.error('Usage: sharpnote run <notebook.cnb> [--config Key=Value] [--output path] [--format text|json]');
    return 1;
  }

  // Initialise logging — write to the standard app log directory
  const logDir = path.join(app.getPath('userData'), 'logs');
  logOps.init({ logDir, mainWindow: null });
  log('HEADLESS', `Starting headless run: ${opts.notebook}`);

  // 1. Load notebook
  let notebook;
  try {
    notebook = loadNotebook(opts.notebook);
    log('HEADLESS', `Loaded notebook: ${notebook.cells?.length || 0} cells`);
  } catch (err) {
    log('HEADLESS', `Failed to load notebook: ${err.message}`);
    console.error(`Failed to load notebook: ${err.message}`);
    return 1;
  }

  // 2. Apply config overrides
  notebook.config = applyConfigOverrides(notebook.config, opts.config);

  // 2b. Apply param overrides — error out if --param names an unknown param.
  const paramResult = applyParamOverrides(notebook.params, opts.params);
  if (paramResult.error) {
    log('HEADLESS', `Param override failed: ${paramResult.error}`);
    console.error(paramResult.error);
    return 2;
  }
  notebook.params = paramResult.entries;
  const resolvedParams = (notebook.params || [])
    .filter((p) => p.name?.trim())
    .map((p) => ({ name: p.name, type: p.type || 'string', value: p.value !== undefined ? p.value : p.default }));

  // 3. Spawn kernel
  const { cmd, args: spawnArgs, cwd } = getKernelSpawnArgs();
  let kernelProcess;
  try {
    kernelProcess = spawn(cmd, spawnArgs, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    log('HEADLESS', `Failed to start kernel: ${err.message}`);
    console.error(`Failed to start kernel: ${err.message}`);
    return 1;
  }

  // Suppress EPIPE on stdin
  kernelProcess.stdin.on('error', () => {});

  const rl = readline.createInterface({ input: kernelProcess.stdout });

  // 4. Wait for kernel ready
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Kernel did not become ready within 60 seconds')), 60000);
      const handler = (line) => {
        if (!line.trim()) return;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'ready') {
            clearTimeout(timeout);
            rl.off('line', handler);
            log('HEADLESS', 'Kernel ready');
            resolve();
          }
        } catch { /* ignore non-JSON lines */ }
      };
      rl.on('line', handler);

      kernelProcess.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Kernel exited unexpectedly with code ${code}`));
      });
    });
  } catch (err) {
    log('HEADLESS', `Kernel startup failed: ${err.message}`);
    console.error(err.message);
    return 1;
  }

  // 5. Inject config into kernel
  if (Array.isArray(notebook.config) && notebook.config.length > 0) {
    const configMsg = { type: 'set_config', entries: notebook.config };
    kernelProcess.stdin.write(JSON.stringify(configMsg) + '\n');
  }

  // 6. Execute cells sequentially
  const cells = (notebook.cells || []).filter((c) => EXECUTABLE_TYPES.has(c.cellType || c.type));
  const allOutputs = [];
  let allPassed = true;
  let snapshotFailures = 0;
  let snapshotChecked  = 0;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const label = cell.name || cell.title || cell.id || `Cell ${i + 1}`;
    const cellType = cell.cellType || cell.type || 'code';
    log('HEADLESS', `Executing cell ${i + 1}/${cells.length}: ${label} (${cellType})`);
    const start = Date.now();
    const cellWithParams = resolvedParams.length > 0 ? { ...cell, _params: resolvedParams } : cell;
    const { outputs, success } = await executeCell(kernelProcess, rl, cellWithParams, label);
    const elapsed = Date.now() - start;
    log('HEADLESS', `Cell ${label} ${success ? 'succeeded' : 'FAILED'} in ${elapsed}ms — ${outputs.length} output(s)`);
    const formatted = formatOutputs(i, cell, outputs, opts.format);
    allOutputs.push(...(Array.isArray(formatted) ? formatted : [formatted]));
    if (!success) allPassed = false;

    if (opts.checkSnapshots && cell.snapshot) {
      snapshotChecked++;
      const visible = outputs.filter((o) => o.type === 'stdout' || o.type === 'display' || o.type === 'error');
      const res = snapshots.captureOrCompare(opts.notebook, cell.id, visible);
      if (!res.match) {
        snapshotFailures++;
        log('HEADLESS', `Snapshot FAIL: ${label} (${cell.id})`);
        console.error(`Snapshot mismatch in cell "${label}" (${cell.id})`);
      } else if (res.captured) {
        log('HEADLESS', `Snapshot captured: ${label}`);
      }
    }
  }

  // 7. Shut down kernel
  try {
    kernelProcess.stdin.write(JSON.stringify({ type: 'exit' }) + '\n');
  } catch { /* ignore */ }
  try { kernelProcess.stdout.destroy(); } catch { /* ignore */ }
  try { kernelProcess.stderr.destroy(); } catch { /* ignore */ }
  setTimeout(() => { try { kernelProcess.kill(); } catch { /* ignore */ } }, 500);

  // 8. Write output
  const output = opts.format === 'json'
    ? JSON.stringify(allOutputs, null, 2)
    : allOutputs.join('\n');

  if (opts.output) {
    fs.mkdirSync(path.dirname(path.resolve(opts.output)), { recursive: true });
    fs.writeFileSync(opts.output, output + '\n', 'utf-8');
    console.error(`Output written to ${opts.output}`);
  } else if (output) {
    process.stdout.write(output + '\n');
  }

  if (opts.checkSnapshots) {
    log('HEADLESS', `Snapshots: ${snapshotChecked - snapshotFailures}/${snapshotChecked} matched`);
    console.error(`Snapshots: ${snapshotChecked - snapshotFailures}/${snapshotChecked} matched`);
  }

  log('HEADLESS', `Run complete: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} — ${cells.length} cells, ${allOutputs.length} output lines`);
  if (!allPassed) return 1;
  if (snapshotFailures > 0) return 3;
  return 0;
}

module.exports = { parseArgs, loadNotebook, applyConfigOverrides, applyParamOverrides, run };
