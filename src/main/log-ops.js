'use strict';

const path = require('path');
const fs   = require('fs');

let _logDir      = null;
let _mainWindow  = null;
let _shell       = null;

const DEFAULT_TAIL_LIMIT = 1000;

function init({ logDir, mainWindow }) {
  _logDir     = logDir;
  _mainWindow = mainWindow;
}

/**
 * Keep only the last `limit` non-empty lines of a log file's text.
 * Returns the trimmed text plus the true total and whether it was truncated, so the
 * panel can show "last N of TOTAL" and offer the full file. Line-based to match the
 * renderer's parser (one entry per line).
 */
function tailLogContent(text, limit = DEFAULT_TAIL_LIMIT) {
  const lines = (text || '').split('\n').filter(Boolean);
  const total = lines.length;
  const truncated = total > limit;
  return { text: (truncated ? lines.slice(-limit) : lines).join('\n'), total, truncated };
}

/** Read a log file and return only its last `limit` entries (never ships the whole
 *  file to the renderer for a large log). `filename` is reduced to a basename so it
 *  can only ever resolve inside the log directory. */
function readLogFileTail(filename, limit = DEFAULT_TAIL_LIMIT) {
  try {
    const safe = path.basename(filename || '');
    const text = fs.readFileSync(path.join(_logDir, safe), 'utf-8');
    return tailLogContent(text, limit);
  } catch {
    return { text: '', total: 0, truncated: false };
  }
}

function setMainWindow(win) {
  _mainWindow = win;
}

function writeLog(tag, message) {
  try {
    fs.mkdirSync(_logDir, { recursive: true });
    const timestamp = new Date().toISOString();
    const date      = timestamp.split('T')[0];
    fs.appendFileSync(
      path.join(_logDir, `${date}.log`),
      `${timestamp} [${tag}] ${message}\n`
    );
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('log-entry', { timestamp, tag, message });
    }
  } catch (e) {
    console.error('writeLog error:', e);
  }
}

function register(ipcMain, { logDir, mainWindow, shell } = {}) {
  if (logDir)     _logDir     = logDir;
  if (mainWindow) _mainWindow = mainWindow;
  if (shell)      _shell      = shell;

  ipcMain.handle('get-log-files', async () => {
    try {
      fs.mkdirSync(_logDir, { recursive: true });
      return fs.readdirSync(_logDir)
        .filter((f) => f.endsWith('.log'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  });

  ipcMain.handle('read-log-file', async (_event, filename) => {
    try {
      return fs.readFileSync(path.join(_logDir, filename), 'utf-8');
    } catch {
      return '';
    }
  });

  // Read only the last `limit` entries of a log file (default 1000) so a large file
  // never overwhelms the log panel. Returns { text, total, truncated }.
  ipcMain.handle('read-log-file-tail', async (_event, { filename, limit } = {}) => {
    return readLogFileTail(filename, limit || DEFAULT_TAIL_LIMIT);
  });

  // Open a log file in the OS default handler (the "see the rest" link in the panel).
  ipcMain.handle('open-log-file', async (_event, filename) => {
    try {
      if (!_shell) return { success: false, error: 'shell unavailable' };
      const err = await _shell.openPath(path.join(_logDir, path.basename(filename || '')));
      return { success: !err, error: err || undefined };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('delete-log-file', async (_event, filename) => {
    try {
      fs.unlinkSync(path.join(_logDir, filename));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.on('renderer-log', (_event, { tag, message }) => {
    writeLog(tag || 'UI', message);
  });
}

module.exports = { writeLog, tailLogContent, readLogFileTail, init, setMainWindow, register, DEFAULT_TAIL_LIMIT };
