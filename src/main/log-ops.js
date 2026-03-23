'use strict';

const path = require('path');
const fs   = require('fs');

let _logDir      = null;
let _mainWindow  = null;

function init({ logDir, mainWindow }) {
  _logDir     = logDir;
  _mainWindow = mainWindow;
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

function register(ipcMain, { logDir, mainWindow } = {}) {
  if (logDir)     _logDir     = logDir;
  if (mainWindow) _mainWindow = mainWindow;

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

module.exports = { writeLog, init, setMainWindow, register };
