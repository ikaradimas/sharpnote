'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } =
  require(process.env.VITEST ? './__mocks__/electron.js' : 'electron');
const path = require('path');
const fs   = require('fs');

app.name = 'SharpNote';

// ── Crash handlers ───────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  try {
    const crashLog = require('path').join(app.getPath('userData'), 'crash.log');
    require('fs').appendFileSync(crashLog,
      `[${new Date().toISOString()}] uncaughtException: ${err.stack || err}\n`);
  } catch (_) {}
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  try {
    const crashLog = require('path').join(app.getPath('userData'), 'crash.log');
    require('fs').appendFileSync(crashLog,
      `[${new Date().toISOString()}] unhandledRejection: ${reason?.stack || reason}\n`);
  } catch (_) {}
});

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
const kafka           = require('./dist/kafka');
const notebookHistory = require('./src/main/notebook-history');
const menuBuilder     = require('./src/main/menu');

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
    kafka.stopAll().catch(() => {});
    try { require('./src/main/mock-server.js').stopAll(); } catch (_) {}
  });

  // Propagate new window reference to all sub-modules.
  logOps.setMainWindow(mainWindow);
  menuBuilder.setMainWindow(mainWindow);
  kernelManager.setMainWindow(mainWindow);
  notebookIo.setMainWindow(mainWindow);
  settings.setMainWindow(mainWindow);
  kafka.setMainWindow(mainWindow);
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

  kafka.register(ipcMain, { app });

  notebookHistory.register(ipcMain);

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

  // Config import / export (Feature 24)
  ipcMain.handle('import-env-file', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import .env File',
      filters: [{ name: 'Environment Files', extensions: ['env', 'txt', ''] }, { name: 'All Files', extensions: ['*'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { success: false };
    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      const entries = [];
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        entries.push({ key, value: val, type: 'string' });
      }
      return { success: true, entries };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-config', async (_event, { config, format }) => {
    const ext = format === 'json' ? 'json' : 'env';
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Config',
      defaultPath: `config.${ext}`,
      filters: [{ name: ext === 'json' ? 'JSON' : 'Env File', extensions: [ext] }],
    });
    if (canceled || !filePath) return { success: false };
    try {
      let content;
      if (format === 'json') {
        content = JSON.stringify(config.map(e => ({ key: e.key, value: e.value, type: e.type })), null, 2);
      } else {
        content = config.map(e => `${e.key}=${e.value}`).join('\n') + '\n';
      }
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db-connections-export', async (_event, connections) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Database Connections',
      defaultPath: `sharpnote-db-connections-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { success: false };
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(connections, null, 2), 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db-connections-import', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import Database Connections',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { success: false };
    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      const data = JSON.parse(content);
      if (!Array.isArray(data)) return { success: false, error: 'Expected a JSON array of connections' };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Standalone app export
  const exportApp = require('./src/main/export-app.js');
  exportApp.register(ipcMain, { app, dialog, mainWindow });

  // Load notebook from a specific file path (used by standalone mode)
  ipcMain.handle('load-notebook-from-path', async (_ev, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      return { success: true, data, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Export notebook as standalone .NET console project
  ipcMain.handle('export-executable', async (_ev, { cells, packages, config, title }) => {
    const { generateExecutableProject, slugify } = require('./src/main/export-exe.js');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Export as Executable — Choose Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false };
    try {
      const dirName = slugify(title);
      const dir = path.join(result.filePaths[0], dirName);
      const files = generateExecutableProject({ cells, packages, config, title });
      fs.mkdirSync(dir, { recursive: true });
      for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), content, 'utf-8');
      }
      return { success: true, filePath: dir };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Export OpenAPI spec from API Editor
  ipcMain.handle('export-openapi', async (_ev, { apiDef, format }) => {
    const { toOpenApiSpec } = require('./src/main/api-editor-export.js');
    const ext = format === 'yaml' ? 'yaml' : 'json';
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export OpenAPI Specification',
      defaultPath: `${(apiDef.title || 'api').replace(/[^a-zA-Z0-9_-]/g, '-')}.${ext}`,
      filters: [{ name: `OpenAPI ${ext.toUpperCase()}`, extensions: [ext] }],
    });
    if (canceled || !filePath) return { success: false };
    try {
      const spec = toOpenApiSpec(apiDef);
      const content = format === 'yaml'
        ? require('js-yaml').dump(spec, { indent: 2, lineWidth: 120 })
        : JSON.stringify(spec, null, 2);
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export-csharp-api', async (_ev, { apiDef }) => {
    const { generateCSharpProject } = require('./src/main/api-csharp-export.js');
    const name = (apiDef.title || 'Api').replace(/[^a-zA-Z0-9_-]/g, '-');
    const { filePath, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Output Folder for C# Project',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePath?.[0]) return { success: false };
    try {
      const files = generateCSharpProject(apiDef);
      const outDir = path.join(filePath[0], name);
      for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(outDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
      }
      return { success: true, filePath: outDir, fileCount: Object.keys(files).length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Mock server
  require('./src/main/mock-server.js').register(ipcMain);
  require('./src/main/git-ops.js').register(ipcMain);

  // Export active notebook as PDF
  ipcMain.handle('export-pdf', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Notebook as PDF',
      defaultPath: 'notebook.pdf',
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { success: false };
    try {
      const data = await mainWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      });
      fs.writeFileSync(filePath, data);
      return { success: true, filePath };
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json, application/yaml, text/yaml, text/plain, */*' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res.text();
    } finally { clearTimeout(timeout); }
  });

  // API request execution — proxied through the main process so http:// URLs
  // bypass renderer CSP and custom auth headers can be forwarded freely.
  ipcMain.handle('api-request', async (_event, { method, url, headers, body }) => {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const opts = { method: (method || 'GET').toUpperCase(), headers: headers || {}, signal: controller.signal };
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
    } finally { clearTimeout(timeout); }
  });

  // Import data file dialog
  ipcMain.handle('import-data-dialog', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import Data File',
      filters: [
        { name: 'All Data Files', extensions: ['csv', 'tsv', 'xlsx', 'parquet', 'pqt'] },
        { name: 'CSV',     extensions: ['csv', 'tsv'] },
        { name: 'Excel',   extensions: ['xlsx'] },
        { name: 'Parquet', extensions: ['parquet', 'pqt'] },
      ],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { success: false };
    const filePath = filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    return { success: true, filePath, ext };
  });

  // Auto-save backup
  ipcMain.handle('auto-save-backup', async (_event, { filePath, data }) => {
    if (!filePath) return { success: false };
    try {
      const bakPath = filePath + '.bak';
      fs.writeFileSync(bakPath, JSON.stringify(data, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('[auto-save] backup failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('check-backups', async (_event, paths) => {
    return paths.filter((p) => {
      try { return fs.existsSync(p + '.bak'); } catch { return false; }
    });
  });

  ipcMain.handle('delete-backup', async (_event, filePath) => {
    try { fs.unlinkSync(filePath + '.bak'); } catch {}
    return { success: true };
  });

  // Recent-files IPC (thin wrappers, not in a sub-module register fn).
  ipcMain.handle('get-recent-files', () => recentFiles.getRecentFiles());
  ipcMain.handle('clear-recent-files', () => {
    recentFiles.clearRecentFiles();
    recentFiles.saveRecentFiles();
    Menu.setApplicationMenu(menuBuilder.buildMenu());
    return { success: true };
  });

  // Rebuild menu with updated custom shortcuts.
  ipcMain.handle('rebuild-menu', (_event, customShortcuts) => {
    Menu.setApplicationMenu(menuBuilder.buildMenu(customShortcuts || {}));
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
  // ── Viewer mode detection ───────────────────────────────────────────────
  // Check two locations:
  // 1. Inside Resources (Windows, or if injected into bundle)
  // 2. Sibling .standalone directory next to the .app (macOS — keeps the
  //    signed bundle untouched to avoid code signature crashes on Sequoia)
  let viewerMode = null;
  let viewerDataDir = null;
  try {
    const internalPath = path.join(process.resourcesPath || __dirname, 'standalone.json');
    if (fs.existsSync(internalPath)) {
      viewerMode = JSON.parse(fs.readFileSync(internalPath, 'utf-8'));
      viewerDataDir = process.resourcesPath || __dirname;
    }
    if (!viewerMode && process.platform === 'darwin') {
      const appBundlePath = path.resolve(process.resourcesPath || __dirname, '..', '..');
      const siblingDir = appBundlePath + '.standalone';
      const siblingPath = path.join(siblingDir, 'standalone.json');
      if (fs.existsSync(siblingPath)) {
        viewerMode = JSON.parse(fs.readFileSync(siblingPath, 'utf-8'));
        viewerDataDir = siblingDir;
      }
    }
  } catch {}

  // ── Headless CLI execution ───────────────────────────────────────────────────
  const cliArgs = process.argv.slice(process.defaultApp ? 3 : 2);
  if (cliArgs[0] === 'run' && cliArgs.length > 1) {
    const headless = require('./src/main/headless');
    headless.run(app, cliArgs.slice(1)).then((code) => {
      process.exitCode = code;
      app.quit();
    });
    return;
  }

  // ── Normal GUI startup ─────────────────────────────────────────────────────
  recentFiles.loadRecentFiles(app.getPath('userData'));
  fs.mkdirSync(libraryDir, { recursive: true });

  registerAllHandlers();
  Menu.setApplicationMenu(menuBuilder.buildMenu({}, !!viewerMode));

  if (process.platform === 'darwin' && !process.env.VITEST) {
    const { nativeImage } = require('electron');
    const dockIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.icns'));
    app.dock.setIcon(dockIcon);
  }

  createWindow();

  if (viewerMode && viewerDataDir) {
    mainWindow.setTitle(viewerMode.title || 'SharpNote');

    // Decrypt embedded settings if present
    let embeddedSettings = null;
    let viewerNeedsPassphrase = false;
    let viewerEncBlob = null;
    if (viewerMode.hasSettings) {
      try {
        const encPath = path.join(viewerDataDir, 'settings.enc');
        const nbPath = path.join(viewerDataDir, viewerMode.notebook);
        if (fs.existsSync(encPath) && fs.existsSync(nbPath)) {
          const { decryptSettings } = require('./src/main/export-app.js');
          const blob = fs.readFileSync(encPath, 'utf-8');
          const nbJson = fs.readFileSync(nbPath, 'utf-8');
          const result = decryptSettings(blob, nbJson);
          if (result && result.needsPassphrase) {
            viewerNeedsPassphrase = true;
            viewerEncBlob = blob;
          } else {
            embeddedSettings = result;
          }
        }
      } catch {}
    }

    // Override app-settings-load to return embedded settings in viewer mode
    if (embeddedSettings) {
      ipcMain.handle('app-settings-load-viewer', () => embeddedSettings);
    }

    // IPC handler for passphrase-protected viewer decryption
    if (viewerNeedsPassphrase) {
      ipcMain.handle('decrypt-viewer-settings', async (_ev, { passphrase }) => {
        try {
          const { decryptSettingsWithPassphrase } = require('./src/main/export-app.js');
          const settings = decryptSettingsWithPassphrase(viewerEncBlob, passphrase);
          return { success: true, settings };
        } catch {
          return { success: false, error: 'Invalid passphrase' };
        }
      });
    }

    mainWindow.webContents.on('did-finish-load', () => {
      const notebookPath = path.join(viewerDataDir, viewerMode.notebook);
      mainWindow.webContents.send('viewer-mode', {
        ...viewerMode,
        notebookPath,
        embeddedSettings,
        needsPassphrase: viewerNeedsPassphrase || false,
      });
    });
  }

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
