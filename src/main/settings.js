'use strict';

const path = require('path');
const fs   = require('fs');

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;

let fontSize         = 12.6;
let _mainWindow      = null;
let _appSettingsPath = null;

function init({ mainWindow, appSettingsPath }) {
  _mainWindow      = mainWindow;
  _appSettingsPath = appSettingsPath;
}

function setMainWindow(win) {
  _mainWindow = win;
}

function applyFontSize(delta) {
  fontSize = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, fontSize + delta));
  if (_mainWindow) _mainWindow.webContents.send('font-size-change', fontSize);
}

function getFontSize() {
  return fontSize;
}

function resetFontSize() {
  fontSize = 12.6;
  if (_mainWindow) _mainWindow.webContents.send('font-size-change', fontSize);
}

function loadAppSettings(appSettingsPath) {
  const p = appSettingsPath || _appSettingsPath;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return { theme: 'kl1nt' };
  }
}

function saveAppSettings(s, appSettingsPath) {
  const p = appSettingsPath || _appSettingsPath;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(s, null, 2), 'utf-8');
  } catch {}
}

function register(ipcMain, { app, shell, mainWindow } = {}) {
  if (mainWindow)  _mainWindow      = mainWindow;
  if (app)         _appSettingsPath = path.join(app.getPath('userData'), 'app-settings.json');

  ipcMain.handle('app-settings-load', () => loadAppSettings());
  ipcMain.handle('app-settings-save', (_e, s) => saveAppSettings(s));
}

module.exports = {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  applyFontSize,
  getFontSize,
  resetFontSize,
  loadAppSettings,
  saveAppSettings,
  init,
  setMainWindow,
  register,
};
