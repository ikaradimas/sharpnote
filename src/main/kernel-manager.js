'use strict';

const path        = require('path');
const { spawn }   = require('child_process');
const readline    = require('readline');
const net         = require('net');

// Multi-kernel map: notebookId -> { process, ready, pending[] }
const kernels = new Map();

// Captured IPC handlers/events for test access (populated when VITEST is set).
const _ipcHandlers = {};
const _ipcEvents   = {};

// Captured per-kernel handlers for test access (populated when VITEST is set).
const _stderrHandlers = {};  // notebookId -> stderr 'data' handler
const _lineHandlers   = {};  // notebookId -> readline 'line' handler

let _mainWindow  = null;
let _app         = null;
let _writeLog    = null;  // injected from log-ops to avoid circular deps

function init({ mainWindow, app, writeLog }) {
  _mainWindow = mainWindow;
  _app        = app;
  _writeLog   = writeLog || function () {};
}

function setMainWindow(win) {
  _mainWindow = win;
}

function _notifyWindow(notebookId, message) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send('kernel-message', { notebookId, message });
  }
}

function getKernelSpawnArgs() {
  if (_app && _app.isPackaged) {
    const rid = process.platform === 'win32' ? 'win-x64'
              : process.arch === 'arm64'     ? 'osx-arm64'
              :                                'osx-x64';
    const ext = process.platform === 'win32' ? '.exe' : '';
    const bin = path.join(process.resourcesPath, 'kernel', rid, `kernel${ext}`);
    return { cmd: bin, args: [], cwd: path.dirname(bin) };
  }
  // Locate kernel relative to the project root (two levels up from src/main/).
  const projectRoot = path.join(__dirname, '..', '..');
  const kernelDir   = path.join(projectRoot, 'kernel');
  return { cmd: 'dotnet', args: ['run', '--project', kernelDir], cwd: kernelDir };
}

function startKernelForId(notebookId) {
  _writeLog('KERNEL', 'Starting kernel');

  const entry = { process: null, ready: false, pending: [], lspSocket: null };
  kernels.set(notebookId, entry);

  const { cmd, args, cwd } = getKernelSpawnArgs();

  let kernelProcess;
  try {
    kernelProcess = spawn(cmd, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error('Failed to start kernel:', err);
    _writeLog('KERNEL', `Failed to start: ${err.message}`);
    _notifyWindow(notebookId, { type: 'error', id: null, message: 'Failed to start kernel: ' + err.message });
    kernels.delete(notebookId);
    return;
  }

  entry.process = kernelProcess;

  const rl = readline.createInterface({ input: kernelProcess.stdout });

  const lineHandler = (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);

      if (msg.type === 'ready') {
        entry.ready = true;
        const queued = entry.pending.length;
        _writeLog('KERNEL', `Ready${queued ? ` — flushing ${queued} queued message${queued > 1 ? 's' : ''}` : ''}`);
        for (const pending of entry.pending) {
          kernelProcess.stdin.write(pending + '\n');
        }
        entry.pending = [];

        if (msg.lspPipe) {
          const socket = net.connect({ path: msg.lspPipe });
          entry.lspSocket = socket;
          socket.on('data', (data) => {
            if (_mainWindow && !_mainWindow.isDestroyed()) {
              _mainWindow.webContents.send('lsp-receive', { notebookId, data: data.toString('utf8') });
            }
          });
          socket.on('error', () => {}); // transient — kernel may restart
        }
      }

      if (msg.type === 'log') {
        _writeLog(msg.tag || 'USER', msg.message || '');
        return;
      }

      if (msg.type === 'complete') {
        const status   = msg.success ? 'completed' : 'failed';
        const duration = msg.durationMs != null ? ` in ${msg.durationMs}ms` : '';
        _writeLog('CELL', `[${msg.id}] ${status}${duration}`);
      }
      if (msg.type === 'error' && !msg.id) {
        _writeLog('KERNEL', `Error: ${msg.message}`);
      }
      if (msg.type === 'error' && msg.id) {
        _writeLog('CELL', `[${msg.id}] error: ${msg.message}`);
      }
      if (msg.type === 'nuget_status') {
        const detail = msg.message ? ` — ${msg.message}` : '';
        _writeLog('NUGET', `${msg.id}: ${msg.status}${detail}`);
      }
      if (msg.type === 'db_ready') {
        _writeLog('DB', `Connected — variable: ${msg.varName}`);
      }
      if (msg.type === 'db_error') {
        _writeLog('DB', `Connection failed: ${msg.message}`);
      }

      _notifyWindow(notebookId, msg);
    } catch (e) {
      console.error('Failed to parse kernel message:', line, e);
    }
  };

  rl.on('line', lineHandler);

  const stderrHandler = (data) => {
    const text = data.toString();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) _writeLog('KERNEL', trimmed);
    }
  };

  kernelProcess.stderr.on('data', stderrHandler);

  if (process.env.VITEST) {
    _lineHandlers[notebookId]   = lineHandler;
    _stderrHandlers[notebookId] = stderrHandler;
  }

  kernelProcess.on('exit', (code) => {
    entry.ready = false;
    console.log(`Kernel exited (${notebookId}) with code:`, code);
    _writeLog('KERNEL', `Stopped (exit code ${code})`);
    _notifyWindow(notebookId, { type: 'error', id: null, message: `Kernel process exited with code ${code}` });
  });

  kernelProcess.on('error', (err) => {
    entry.ready = false;
    console.error(`Kernel process error (${notebookId}):`, err);
    _writeLog('KERNEL', `Process error: ${err.message}`);
    _notifyWindow(notebookId, { type: 'error', id: null, message: 'Kernel process error: ' + err.message });
  });

  // Suppress EPIPE: if the kernel exits while we are still writing to stdin
  // the stream emits 'error' rather than throwing, and without a listener it
  // would become an uncaught exception that crashes the main process.
  kernelProcess.stdin.on('error', () => {});
}

function killKernelForId(notebookId) {
  const entry = kernels.get(notebookId);
  if (!entry || !entry.process) return;
  if (entry.lspSocket) {
    try { entry.lspSocket.destroy(); } catch (_) {}
    entry.lspSocket = null;
  }
  if (entry.process.stdin.writable) {
    try {
      entry.process.stdin.write(JSON.stringify({ type: 'exit' }) + '\n');
    } catch (_) {}
  }
  // Destroy stdout/stderr immediately to release the readline event-loop reference.
  // With 'dotnet run' in development, killing the wrapper does not kill the actual
  // kernel child process; that child keeps the stdout pipe's write-end open so
  // readline never sees EOF and the Node event loop stays alive, preventing exit.
  try { entry.process.stdout.destroy(); } catch (_) {}
  try { entry.process.stderr.destroy(); } catch (_) {}
  setTimeout(() => {
    if (entry.process) {
      try { entry.process.kill(); } catch (_) {}
    }
    kernels.delete(notebookId);
  }, 500);
}

function killAllKernels() {
  for (const [id] of kernels) {
    killKernelForId(id);
  }
}

function sendToKernel(notebookId, message) {
  const entry = kernels.get(notebookId);
  if (!entry) return;
  const line = JSON.stringify(message);
  if (entry.ready && entry.process) {
    entry.process.stdin.write(line + '\n');
  } else {
    entry.pending.push(line);
  }
}

function register(ipcMain, { mainWindow, app, writeLog } = {}) {
  if (mainWindow) _mainWindow = mainWindow;
  if (app)        _app        = app;
  if (writeLog)   _writeLog   = writeLog;

  function handle(channel, fn) {
    if (process.env.VITEST) _ipcHandlers[channel] = fn;
    ipcMain.handle(channel, fn);
  }

  function on(channel, fn) {
    if (process.env.VITEST) _ipcEvents[channel] = fn;
    ipcMain.on(channel, fn);
  }

  handle('start-kernel', (_event, notebookId) => {
    startKernelForId(notebookId);
    return { success: true };
  });

  handle('stop-kernel', (_event, notebookId) => {
    killKernelForId(notebookId);
    return { success: true };
  });

  on('kernel-send', (_event, { notebookId, message }) => {
    if (message.type === 'execute') {
      const preview = (message.code || '').trim().split('\n')[0].slice(0, 60);
      _writeLog('CELL', `[${message.id}] run — ${preview}${preview.length < (message.code || '').trim().split('\n')[0].length ? '…' : ''}`);
    }
    sendToKernel(notebookId, message);
  });

  on('kernel-reset', (_event, notebookId) => {
    _writeLog('KERNEL', 'Hard reset — killing and restarting process');
    const entry = kernels.get(notebookId);
    if (entry?.process) {
      kernels.delete(notebookId); // remove first so exit handler sees no entry
      try { entry.process.kill(); } catch (_) {}
    }
    startKernelForId(notebookId);
  });

  on('lsp-send', (_event, { notebookId, data }) => {
    const entry = kernels.get(notebookId);
    if (entry?.lspSocket && !entry.lspSocket.destroyed) {
      try { entry.lspSocket.write(data); } catch (_) {}
    }
  });

  on('kernel-interrupt', (_event, notebookId) => {
    const entry = kernels.get(notebookId);
    if (!entry?.process) return;
    _writeLog('KERNEL', 'Interrupt signal sent');
    if (entry.process.stdin?.writable) {
      entry.process.stdin.write(JSON.stringify({ type: 'interrupt' }) + '\n');
    }
  });
}

// Auto-register IPC handlers when running under Vitest so tests can
// import this module directly without going through main.js.
if (process.env.VITEST) {
  const electron = require('../../__mocks__/electron.js');
  _writeLog = function () {};
  register(electron.ipcMain, {});
}

module.exports = {
  kernels,
  getKernelSpawnArgs,
  startKernelForId,
  killKernelForId,
  killAllKernels,
  sendToKernel,
  register,
  init,
  setMainWindow,
  _notifyWindow,
  _ipcHandlers,
  _ipcEvents,
  _stderrHandlers,
  _lineHandlers,
};
