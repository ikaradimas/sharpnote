'use strict';

const path = require('path');
const fs   = require('fs');

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;

const PANEL_FONT_SIZE_MIN     = 8;
const PANEL_FONT_SIZE_MAX     = 18;
const PANEL_FONT_SIZE_DEFAULT = 11.5;

let fontSize         = 12.6;
let panelFontSize    = PANEL_FONT_SIZE_DEFAULT;
let _mainWindow      = null;
let _appSettingsPath = null;

function init({ mainWindow, appSettingsPath }) {
  _mainWindow      = mainWindow;
  _appSettingsPath = appSettingsPath;
}

function setMainWindow(win) {
  _mainWindow = win;
}

// ── Editor font size ──────────────────────────────────────────────────────────

function applyFontSize(delta) {
  fontSize = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, fontSize + delta));
  if (_mainWindow) _mainWindow.webContents.send('font-size-change', fontSize);
}

function setFontSize(size) {
  fontSize = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size));
  if (_mainWindow) _mainWindow.webContents.send('font-size-change', fontSize);
}

function getFontSize() {
  return fontSize;
}

function resetFontSize() {
  fontSize = 12.6;
  if (_mainWindow) _mainWindow.webContents.send('font-size-change', fontSize);
}

// ── Panel font size ───────────────────────────────────────────────────────────

function setPanelFontSize(size) {
  panelFontSize = Math.min(PANEL_FONT_SIZE_MAX, Math.max(PANEL_FONT_SIZE_MIN, size));
  if (_mainWindow) _mainWindow.webContents.send('panel-font-size-change', panelFontSize);
}

function getPanelFontSize() {
  return panelFontSize;
}

function resetPanelFontSize() {
  panelFontSize = PANEL_FONT_SIZE_DEFAULT;
  if (_mainWindow) _mainWindow.webContents.send('panel-font-size-change', panelFontSize);
}

// ── App settings ──────────────────────────────────────────────────────────────

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
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf-8');
    fs.renameSync(tmp, p);
  } catch (err) { console.error('[settings] save failed:', err.message); }
}

function register(ipcMain, { app, shell, mainWindow } = {}) {
  if (mainWindow)  _mainWindow      = mainWindow;
  if (app)         _appSettingsPath = path.join(app.getPath('userData'), 'app-settings.json');

  ipcMain.handle('app-settings-load', () => loadAppSettings());
  ipcMain.handle('app-settings-save', (_e, s) => saveAppSettings(s));
  ipcMain.handle('font-size-set', (_e, size) => setFontSize(size));
  ipcMain.handle('panel-font-size-set', (_e, size) => setPanelFontSize(size));
}

module.exports = {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  PANEL_FONT_SIZE_MIN,
  PANEL_FONT_SIZE_MAX,
  PANEL_FONT_SIZE_DEFAULT,
  applyFontSize,
  setFontSize,
  getFontSize,
  resetFontSize,
  setPanelFontSize,
  getPanelFontSize,
  resetPanelFontSize,
  loadAppSettings,
  saveAppSettings,
  init,
  setMainWindow,
  register,
};
