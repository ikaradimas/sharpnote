const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const readline = require('readline');

let mainWindow = null;

// Multi-kernel map: notebookId -> { process, ready, pending[] }
const kernels = new Map();

const logDir = app.isPackaged
  ? path.join(app.getPath('userData'), 'logs')
  : path.join(__dirname, 'logs');

// ── Recent files ──────────────────────────────────────────────────────────────

const recentFilesPath = path.join(app.getPath('userData'), 'recent-files.json');
const MAX_RECENTS = 12;
let recentFiles = []; // [{ path, name, date }]

function loadRecentFiles() {
  try {
    recentFiles = JSON.parse(fs.readFileSync(recentFilesPath, 'utf-8'));
  } catch { recentFiles = []; }
}

function saveRecentFiles() {
  try {
    fs.mkdirSync(path.dirname(recentFilesPath), { recursive: true });
    fs.writeFileSync(recentFilesPath, JSON.stringify(recentFiles, null, 2), 'utf-8');
  } catch {}
}

function addRecentFile(filePath) {
  recentFiles = recentFiles.filter((r) => r.path !== filePath);
  recentFiles.unshift({ path: filePath, name: path.basename(filePath), date: new Date().toISOString() });
  recentFiles = recentFiles.slice(0, MAX_RECENTS);
  saveRecentFiles();
  try { app.addRecentDocument(filePath); } catch {}
  Menu.setApplicationMenu(buildMenu());
}

// ── DB connections ────────────────────────────────────────────────────────────

const dbConnectionsPath = path.join(app.getPath('userData'), 'db-connections.json');

function loadDbConnections() {
  try {
    return JSON.parse(fs.readFileSync(dbConnectionsPath, 'utf-8'));
  } catch { return []; }
}

function saveDbConnections(list) {
  try {
    fs.mkdirSync(path.dirname(dbConnectionsPath), { recursive: true });
    fs.writeFileSync(dbConnectionsPath, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}

// ── Code Library ──────────────────────────────────────────────────────────────

const libraryDir = path.join(app.getPath('documents'), 'Polyglot Notebooks', 'Library');

// Resolves a library file path to an absolute path within libraryDir.
// Returns null if the resolved path would escape the library directory.
function resolveLibraryPath(filePath) {
  const full = path.isAbsolute(filePath) ? filePath : path.join(libraryDir, filePath);
  return full.startsWith(libraryDir) ? full : null;
}

let fontSize = 12.6;
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;

function applyFontSize(delta) {
  fontSize = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, fontSize + delta));
  if (mainWindow) mainWindow.webContents.send('font-size-change', fontSize);
}

function buildMenu() {
  const fontSizeItems = [
    { type: 'separator' },
    {
      label: 'Increase Font Size',
      accelerator: 'CmdOrCtrl+=',
      click: () => applyFontSize(1),
    },
    {
      label: 'Increase Font Size',
      accelerator: 'CmdOrCtrl+Shift+=',
      visible: false,
      click: () => applyFontSize(1),
    },
    {
      label: 'Decrease Font Size',
      accelerator: 'CmdOrCtrl+-',
      click: () => applyFontSize(-1),
    },
    {
      label: 'Reset Font Size',
      accelerator: 'CmdOrCtrl+0',
      click: () => { fontSize = 12.6; if (mainWindow) mainWindow.webContents.send('font-size-change', fontSize); },
    },
  ];

  const send = (action) => { if (mainWindow) mainWindow.webContents.send('menu-action', action); };

  const template = [];

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const recentSubmenu = recentFiles.length === 0
    ? [{ label: 'No Recent Files', enabled: false }]
    : [
        ...recentFiles.map((r) => ({
          label: r.name,
          click: () => { if (mainWindow) mainWindow.webContents.send('menu-action', { type: 'open-recent', path: r.path }); },
        })),
        { type: 'separator' },
        { label: 'Clear Recent Files', click: () => { recentFiles = []; saveRecentFiles(); Menu.setApplicationMenu(buildMenu()); } },
      ];

  template.push({
    label: 'File',
    submenu: [
      { label: 'New Notebook',   accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { type: 'separator' },
      { label: 'Open…',          accelerator: 'CmdOrCtrl+O', click: () => send('open') },
      { label: 'Open Recent',    submenu: recentSubmenu },
      { type: 'separator' },
      { label: 'Save',           accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { label: 'Save As…',       accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
      ...( process.platform !== 'darwin' ? [
        { type: 'separator' },
        { role: 'quit' },
      ] : []),
    ],
  });

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      ...fontSizeItems,
    ],
  });

  template.push({
    label: 'Run',
    submenu: [
      { label: 'Run All Cells',  accelerator: 'CmdOrCtrl+Shift+Return', click: () => send('run-all') },
      { type: 'separator' },
      { label: 'Clear All Output', click: () => send('clear-output') },
      { type: 'separator' },
      { label: 'Reset Kernel',   click: () => send('reset') },
    ],
  });

  template.push({
    label: 'Tools',
    submenu: [
      { label: 'Packages',  accelerator: 'CmdOrCtrl+Shift+P', click: () => send('toggle-packages') },
      { label: 'Config',    accelerator: 'CmdOrCtrl+Shift+,', click: () => send('toggle-config') },
      { label: 'Library',   accelerator: 'CmdOrCtrl+Shift+L', click: () => send('toggle-library') },
      { label: 'Logs',      accelerator: 'CmdOrCtrl+Shift+G', click: () => send('toggle-logs') },
      { label: 'DB',        accelerator: 'CmdOrCtrl+Shift+D', click: () => send('toggle-db') },
    ],
  });

  template.push({
    label: 'Help',
    submenu: [
      { label: 'Documentation', accelerator: 'F1', click: () => send('docs') },
    ],
  });

  return Menu.buildFromTemplate(template);
}

function writeLog(tag, message) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0];
    fs.appendFileSync(
      path.join(logDir, `${date}.log`),
      `${timestamp} [${tag}] ${message}\n`
    );
    if (mainWindow) {
      mainWindow.webContents.send('log-entry', { timestamp, tag, message });
    }
  } catch (e) {
    console.error('writeLog error:', e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('font-size-change', fontSize);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    killAllKernels();
  });
}

function getKernelSpawnArgs() {
  if (app.isPackaged) {
    const rid = process.platform === 'win32' ? 'win-x64'
              : process.arch === 'arm64'     ? 'osx-arm64'
              :                                'osx-x64';
    const ext = process.platform === 'win32' ? '.exe' : '';
    const bin = path.join(process.resourcesPath, 'kernel', rid, `kernel${ext}`);
    return { cmd: bin, args: [], cwd: path.dirname(bin) };
  }
  const kernelDir = path.join(__dirname, 'kernel');
  return { cmd: 'dotnet', args: ['run', '--project', kernelDir], cwd: kernelDir };
}

function startKernelForId(notebookId) {
  writeLog('KERNEL', `Starting kernel`);

  const entry = { process: null, ready: false, pending: [] };
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
    writeLog('KERNEL', `Failed to start: ${err.message}`);
    if (mainWindow) {
      mainWindow.webContents.send('kernel-message', {
        notebookId,
        message: { type: 'error', id: null, message: 'Failed to start kernel: ' + err.message },
      });
    }
    kernels.delete(notebookId);
    return;
  }

  entry.process = kernelProcess;

  const rl = readline.createInterface({ input: kernelProcess.stdout });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);

      if (msg.type === 'ready') {
        entry.ready = true;
        const queued = entry.pending.length;
        writeLog('KERNEL', `Ready${queued ? ` — flushing ${queued} queued message${queued > 1 ? 's' : ''}` : ''}`);
        for (const pending of entry.pending) {
          kernelProcess.stdin.write(pending + '\n');
        }
        entry.pending = [];
      }

      if (msg.type === 'log') {
        writeLog(msg.tag || 'USER', msg.message || '');
        return;
      }

      if (msg.type === 'complete') {
        const status = msg.success ? 'completed' : 'failed';
        const duration = msg.durationMs != null ? ` in ${msg.durationMs}ms` : '';
        writeLog('CELL', `[${msg.id}] ${status}${duration}`);
      }
      if (msg.type === 'error' && !msg.id) {
        writeLog('KERNEL', `Error: ${msg.message}`);
      }
      if (msg.type === 'nuget_status') {
        const detail = msg.message ? ` — ${msg.message}` : '';
        writeLog('NUGET', `${msg.id}: ${msg.status}${detail}`);
      }
      if (msg.type === 'db_ready') {
        writeLog('DB', `Connected — variable: ${msg.varName}`);
      }
      if (msg.type === 'db_error') {
        writeLog('DB', `Connection failed: ${msg.message}`);
      }

      if (mainWindow) {
        mainWindow.webContents.send('kernel-message', { notebookId, message: msg });
      }
    } catch (e) {
      console.error('Failed to parse kernel message:', line, e);
    }
  });

  kernelProcess.stderr.on('data', (data) => {
    console.error(`Kernel stderr (${notebookId}):`, data.toString());
  });

  kernelProcess.on('exit', (code) => {
    entry.ready = false;
    console.log(`Kernel exited (${notebookId}) with code:`, code);
    writeLog('KERNEL', `Stopped (exit code ${code})`);
    if (mainWindow) {
      mainWindow.webContents.send('kernel-message', {
        notebookId,
        message: { type: 'error', id: null, message: `Kernel process exited with code ${code}` },
      });
    }
  });

  kernelProcess.on('error', (err) => {
    entry.ready = false;
    console.error(`Kernel process error (${notebookId}):`, err);
    writeLog('KERNEL', `Process error: ${err.message}`);
    if (mainWindow) {
      mainWindow.webContents.send('kernel-message', {
        notebookId,
        message: { type: 'error', id: null, message: 'Kernel process error: ' + err.message },
      });
    }
  });
}

function killKernelForId(notebookId) {
  const entry = kernels.get(notebookId);
  if (!entry || !entry.process) return;
  try {
    entry.process.stdin.write(JSON.stringify({ type: 'exit' }) + '\n');
  } catch (_) {}
  setTimeout(() => {
    if (entry.process) {
      entry.process.kill();
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

// IPC handlers
ipcMain.handle('start-kernel', (_event, notebookId) => {
  startKernelForId(notebookId);
  return { success: true };
});

ipcMain.handle('stop-kernel', (_event, notebookId) => {
  killKernelForId(notebookId);
  return { success: true };
});

ipcMain.on('kernel-send', (_event, { notebookId, message }) => {
  if (message.type === 'execute') {
    const preview = (message.code || '').trim().split('\n')[0].slice(0, 60);
    writeLog('CELL', `[${message.id}] run — ${preview}${preview.length < (message.code || '').trim().split('\n')[0].length ? '…' : ''}`);
  }
  sendToKernel(notebookId, message);
});

ipcMain.on('kernel-reset', (_event, notebookId) => {
  writeLog('KERNEL', `Reset — all state cleared`);
  sendToKernel(notebookId, { type: 'reset' });
});

ipcMain.handle('new-notebook-dialog', async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'New Notebook',
    message: 'Start with a template?',
    buttons: ['Examples', 'Blank', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  // 0 = Examples, 1 = Blank, 2 = Cancel
  return response;
});

function writeNotebookFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  addRecentFile(filePath);
  return { success: true, filePath };
}

ipcMain.handle('save-notebook', async (_event, data) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Notebook',
    defaultPath: data.title ? `${data.title}.cnb` : 'notebook.cnb',
    filters: [{ name: 'Notebook', extensions: ['cnb'] }],
  });

  if (canceled || !filePath) return { success: false };

  try {
    const result = writeNotebookFile(filePath, data);
    writeLog('SAVE', `Notebook saved: ${path.basename(filePath)}`);
    return result;
  } catch (err) {
    writeLog('SAVE', `Save failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-file', async (_event, { content, defaultName, filters }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Output',
    defaultPath: defaultName || 'output.txt',
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (canceled || !filePath) return { success: false };
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-log-files', async () => {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    return fs.readdirSync(logDir)
      .filter((f) => f.endsWith('.log'))
      .sort()
      .reverse();
  } catch { return []; }
});

ipcMain.handle('read-log-file', async (_event, filename) => {
  try {
    return fs.readFileSync(path.join(logDir, filename), 'utf-8');
  } catch { return ''; }
});

ipcMain.handle('delete-log-file', async (_event, filename) => {
  try {
    fs.unlinkSync(path.join(logDir, filename));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('rename-file', async (_event, { oldPath, newPath }) => {
  try {
    fs.renameSync(oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-notebook-to', async (_event, { filePath, data }) => {
  try {
    const result = writeNotebookFile(filePath, data);
    writeLog('SAVE', `Auto-saved: ${path.basename(filePath)}`);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-notebook', async (_event) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Notebook',
    filters: [{ name: 'Notebook', extensions: ['cnb'] }],
    properties: ['openFile'],
  });

  if (canceled || !filePaths.length) return { success: false };

  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    const data = JSON.parse(content);
    addRecentFile(filePaths[0]);
    writeLog('LOAD', `Notebook opened: ${path.basename(filePaths[0])}`);
    return { success: true, data, filePath: filePaths[0] };
  } catch (err) {
    writeLog('LOAD', `Open failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// ── Recent files + Library IPC ────────────────────────────────────────────────

ipcMain.handle('get-recent-files', () => recentFiles);

ipcMain.handle('clear-recent-files', () => {
  recentFiles = [];
  saveRecentFiles();
  Menu.setApplicationMenu(buildMenu());
  return { success: true };
});

ipcMain.handle('open-recent-file', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    addRecentFile(filePath);
    writeLog('LOAD', `Opened: ${path.basename(filePath)}`);
    return { success: true, data, filePath };
  } catch (err) {
    // File may have moved — remove from recents
    recentFiles = recentFiles.filter((r) => r.path !== filePath);
    saveRecentFiles();
    Menu.setApplicationMenu(buildMenu());
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-library-files', async (_event, subfolder = '') => {
  // Resolve dir; guard against path traversal
  const dir = subfolder
    ? path.resolve(libraryDir, subfolder)
    : libraryDir;
  if (!dir.startsWith(libraryDir)) return { folders: [], files: [] };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const folders = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const files = entries
      .filter((e) => e.isFile() && (e.name.endsWith('.cs') || e.name.endsWith('.csx')))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => {
        const fullPath = path.join(dir, e.name);
        const kb = (fs.statSync(fullPath).size / 1024).toFixed(1);
        return { name: e.name, size: `${kb} KB`, fullPath };
      });
    return { folders, files };
  } catch { return { folders: [], files: [] }; }
});

ipcMain.handle('read-library-file', async (_event, filePath) => {
  const full = resolveLibraryPath(filePath);
  if (!full) return '';
  try { return fs.readFileSync(full, 'utf-8'); }
  catch { return ''; }
});

ipcMain.handle('save-library-file', async (_event, { filePath, content }) => {
  const full = resolveLibraryPath(filePath);
  if (!full) return { success: false, error: 'Path outside library' };
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
    return { success: true, fullPath: full };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('delete-library-file', async (_event, filePath) => {
  const full = resolveLibraryPath(filePath);
  if (!full) return { success: false, error: 'Path outside library' };
  try {
    fs.unlinkSync(full);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db-connections-load', () => loadDbConnections());
ipcMain.handle('db-connections-save', (_event, list) => saveDbConnections(list));

// ── App settings ───────────────────────────────────────────────────────────────

const appSettingsPath = path.join(app.getPath('userData'), 'app-settings.json');

function loadAppSettings() {
  try { return JSON.parse(fs.readFileSync(appSettingsPath, 'utf-8')); }
  catch { return { theme: 'kl1nt' }; }
}

function saveAppSettings(s) {
  try {
    fs.mkdirSync(path.dirname(appSettingsPath), { recursive: true });
    fs.writeFileSync(appSettingsPath, JSON.stringify(s, null, 2), 'utf-8');
  } catch {}
}

ipcMain.handle('app-settings-load', () => loadAppSettings());
ipcMain.handle('app-settings-save', (_e, s) => saveAppSettings(s));

ipcMain.handle('open-library-folder', async () => {
  fs.mkdirSync(libraryDir, { recursive: true });
  await shell.openPath(libraryDir);
  return { success: true };
});

app.whenReady().then(() => {
  loadRecentFiles();
  fs.mkdirSync(libraryDir, { recursive: true });
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  // Renderer requests kernel start per-notebook via 'start-kernel' IPC

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  killAllKernels();
  app.quit();
});

app.on('before-quit', () => {
  killAllKernels();
});
