'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const { decryptConfigSecrets } = require('./notebook-io');
const { getKernelSpawnArgs } = require('./kernel-manager');

/**
 * Parse CLI arguments after the `run` subcommand.
 *
 *   electron . run <notebook> [--config Key=Value]... [--output path] [--format text|json]
 */
function parseArgs(args) {
  const result = { notebook: null, config: {}, output: null, format: 'text' };
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--config' && i + 1 < args.length) {
      const [key, ...rest] = args[i + 1].split('=');
      result.config[key] = rest.join('=');
      i += 2;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      result.output = args[i + 1];
      i += 2;
    } else if (args[i] === '--format' && i + 1 < args.length) {
      result.format = args[i + 1];
      i += 2;
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

/**
 * Execute a single cell against a running kernel and collect outputs.
 * Returns { outputs, success } where success is from the `complete` message.
 */
function executeCell(kernelProcess, rl, cell) {
  return new Promise((resolve) => {
    const id = cell.id;
    const outputs = [];
    let resolved = false;

    const handler = (line) => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }

      if (msg.id !== id) return;

      if (msg.type === 'complete') {
        resolved = true;
        rl.off('line', handler);
        resolve({ outputs, success: msg.success !== false });
      } else if (msg.type === 'error') {
        outputs.push({ type: 'error', message: msg.message });
      } else if (msg.type === 'output' || msg.type === 'display') {
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
    } else if (out.type === 'output') {
      const text = out.text || out.data || out.message || '';
      if (text) lines.push(`[${label}] ${text}`);
    } else if (out.type === 'display') {
      const text = out.text || out.data || JSON.stringify(out);
      lines.push(`[${label}] ${text}`);
    } else if (out.text || out.data || out.message) {
      lines.push(`[${label}] ${out.text || out.data || out.message}`);
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

  // 1. Load notebook
  let notebook;
  try {
    notebook = loadNotebook(opts.notebook);
  } catch (err) {
    console.error(`Failed to load notebook: ${err.message}`);
    return 1;
  }

  // 2. Apply config overrides
  notebook.config = applyConfigOverrides(notebook.config, opts.config);

  // 3. Spawn kernel
  const { cmd, args: spawnArgs, cwd } = getKernelSpawnArgs();
  let kernelProcess;
  try {
    kernelProcess = spawn(cmd, spawnArgs, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
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

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const { outputs, success } = await executeCell(kernelProcess, rl, cell);
    const formatted = formatOutputs(i, cell, outputs, opts.format);
    allOutputs.push(...(Array.isArray(formatted) ? formatted : [formatted]));
    if (!success) allPassed = false;
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

  return allPassed ? 0 : 1;
}

module.exports = { parseArgs, loadNotebook, applyConfigOverrides, run };
