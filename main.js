'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } =
  require(process.env.VITEST ? './__mocks__/electron.js' : 'electron');
const path = require('path');
const fs   = require('fs');

app.name = 'SharpNote';

// ── Sub-modules ───────────────────────────────────────────────────────────────
const recentFiles   = require('./src/main/recent-files');
const dbConnections = require('./src/main/db-connections');
const library       = require('./src/main/library');
const fileOps       = require('./src/main/file-ops');
const kernelManager = require('./src/main/kernel-manager');
const notebookIo    = require('./src/main/notebook-io');
const logOps        = require('./src/main/log-ops');
const settings      = require('./src/main/settings');
const apiSaved      = require('./src/main/api-saved');
const menuBuilder   = require('./src/main/menu');

// ── Process-level state ───────────────────────────────────────────────────────
let mainWindow = null;
let allowQuit  = false;

// ── Derived paths ─────────────────────────────────────────────────────────────
const logDir = app.isPackaged
  ? path.join(app.getPath('userData'), 'logs')
  : path.join(__dirname, 'logs');

const libraryDir = path.join(app.getPath('documents'), 'SharpNote Notebooks', 'Library');

// ── Init sub-modules with shared dependencies ─────────────────────────────────
library.init(libraryDir);

logOps.init({ logDir, mainWindow: null });

menuBuilder.init({
  app,
  Menu,
  mainWindow: null,
  getRecentFiles:  recentFiles.getRecentFiles,
  saveRecentFiles: () => {
    recentFiles.clearRecentFiles();
    recentFiles.saveRecentFiles();
  },
  applyFontSize: settings.applyFontSize,
  resetFontSize: settings.resetFontSize,
});

recentFiles.init({
  app,
  Menu,
  getBuildMenu: menuBuilder.buildMenu,
});

// ── Window creation ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e1e1e',
    icon: path.join(__dirname, 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('font-size-change', settings.getFontSize());
    mainWindow.webContents.send('panel-font-size-change', settings.getPanelFontSize());
  });

  mainWindow.on('close', (event) => {
    if (!allowQuit) {
      event.preventDefault();
      mainWindow.webContents.send('before-quit');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    kernelManager.killAllKernels();
  });

  // Propagate new window reference to all sub-modules.
  logOps.setMainWindow(mainWindow);
  menuBuilder.setMainWindow(mainWindow);
  kernelManager.setMainWindow(mainWindow);
  notebookIo.setMainWindow(mainWindow);
  settings.setMainWindow(mainWindow);
}

// ── Register all IPC handlers ─────────────────────────────────────────────────
function registerAllHandlers() {
  logOps.register(ipcMain, { logDir, mainWindow });

  kernelManager.register(ipcMain, {
    mainWindow,
    app,
    writeLog: logOps.writeLog,
  });

  fileOps.register(ipcMain, { app, shell });

  library.register(ipcMain, { shell });

  notebookIo.register(ipcMain, {
    mainWindow,
    dialog,
    addRecentFile: recentFiles.addRecentFile,
    writeLog: logOps.writeLog,
  });

  dbConnections.register(ipcMain, { app });

  settings.register(ipcMain, { app, shell, mainWindow });

  apiSaved.register(ipcMain, { app });

  // Settings export / import
  ipcMain.handle('settings-export', async (_event, data) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Settings',
      defaultPath: `sharpnote-settings-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { success: false };
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('settings-import', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import Settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { success: false };
    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      const data = JSON.parse(content);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // App info.
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-app-paths', () => ({
    userData: app.getPath('userData'),
    documents: app.getPath('documents'),
    library: libraryDir,
    logs: logDir,
  }));

  // URL fetch — used by the API browser panel; proxied through the main process
  // so that http:// URLs (e.g. local dev servers) bypass the renderer CSP.
  ipcMain.handle('fetch-url', async (_event, url) => {
    const res = await fetch(url, { headers: { Accept: 'application/json, application/yaml, text/yaml, text/plain, */*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  });

  // API request execution — proxied through the main process so http:// URLs
  // bypass renderer CSP and custom auth headers can be forwarded freely.
  ipcMain.handle('api-request', async (_event, { method, url, headers, body }) => {
    const start = Date.now();
    const opts = { method: (method || 'GET').toUpperCase(), headers: headers || {} };
    if (body !== undefined && body !== null && body !== '') opts.body = body;
    const res = await fetch(url, opts);
    const bodyText = await res.text();
    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: bodyText,
      duration: Date.now() - start,
    };
  });

  // Recent-files IPC (thin wrappers, not in a sub-module register fn).
  ipcMain.handle('get-recent-files', () => recentFiles.getRecentFiles());
  ipcMain.handle('clear-recent-files', () => {
    recentFiles.clearRecentFiles();
    recentFiles.saveRecentFiles();
    Menu.setApplicationMenu(menuBuilder.buildMenu());
    return { success: true };
  });

  // Window-tabs sync.
  ipcMain.on('update-window-tabs', (_event, tabs) => {
    menuBuilder.setWindowTabs(tabs);
    Menu.setApplicationMenu(menuBuilder.buildMenu());
  });

  // Quit confirmation.
  ipcMain.on('confirm-quit', () => {
    allowQuit = true;
    app.quit();
  });

  // Renderer log forwarding.
  // (Already registered by logOps.register above via 'renderer-log' handler.)
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  recentFiles.loadRecentFiles(app.getPath('userData'));
  fs.mkdirSync(libraryDir, { recursive: true });

  registerAllHandlers();
  Menu.setApplicationMenu(menuBuilder.buildMenu());

  if (process.platform === 'darwin' && !process.env.VITEST) {
    const { nativeImage } = require('electron');
    const dockIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.icns'));
    app.dock.setIcon(dockIcon);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  kernelManager.killAllKernels();
  app.quit();
});

app.on('before-quit', () => {
  kernelManager.killAllKernels();
});
