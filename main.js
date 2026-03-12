const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const readline = require('readline');

let mainWindow = null;
let kernelProcess = null;
let kernelReady = false;
let pendingMessages = [];

const logDir = path.join(__dirname, 'logs');

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
      // catches Ctrl++ (shift+=) without showing a duplicate menu entry
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

  template.push({
    label: 'File',
    submenu: [
      { label: 'New Notebook',   accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { type: 'separator' },
      { label: 'Open…',          accelerator: 'CmdOrCtrl+O', click: () => send('open') },
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
    killKernel();
  });
}

function startKernel() {
  const kernelDir = path.join(__dirname, 'kernel');

  writeLog('NOTEBOOK', 'Kernel starting');

  try {
    kernelProcess = spawn('dotnet', ['run', '--project', kernelDir], {
      cwd: kernelDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error('Failed to start kernel:', err);
    writeLog('NOTEBOOK', `Failed to start kernel: ${err.message}`);
    if (mainWindow) {
      mainWindow.webContents.send('kernel-message', {
        type: 'error',
        id: null,
        message: 'Failed to start kernel: ' + err.message,
      });
    }
    return;
  }

  const rl = readline.createInterface({ input: kernelProcess.stdout });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);

      if (msg.type === 'ready') {
        kernelReady = true;
        writeLog('NOTEBOOK', 'Kernel ready');
        for (const pending of pendingMessages) {
          kernelProcess.stdin.write(pending + '\n');
        }
        pendingMessages = [];
      }

      // Intercept log messages — write to file and forward as log-entry, not kernel-message
      if (msg.type === 'log') {
        writeLog(msg.tag || 'USER', msg.message || '');
        return;
      }

      if (msg.type === 'complete') {
        writeLog('NOTEBOOK', `Cell complete: id=${msg.id} success=${msg.success}`);
      }
      if (msg.type === 'error' && !msg.id) {
        writeLog('NOTEBOOK', `Kernel error: ${msg.message}`);
      }

      if (mainWindow) {
        mainWindow.webContents.send('kernel-message', msg);
      }
    } catch (e) {
      console.error('Failed to parse kernel message:', line, e);
    }
  });

  kernelProcess.stderr.on('data', (data) => {
    console.error('Kernel stderr:', data.toString());
  });

  kernelProcess.on('exit', (code) => {
    kernelReady = false;
    console.log('Kernel exited with code:', code);
    writeLog('NOTEBOOK', `Kernel exited with code ${code}`);
    if (mainWindow) {
      mainWindow.webContents.send('kernel-message', {
        type: 'error',
        id: null,
        message: `Kernel process exited with code ${code}`,
      });
    }
  });

  kernelProcess.on('error', (err) => {
    kernelReady = false;
    console.error('Kernel process error:', err);
    writeLog('NOTEBOOK', `Kernel process error: ${err.message}`);
    if (mainWindow) {
      mainWindow.webContents.send('kernel-message', {
        type: 'error',
        id: null,
        message: 'Kernel process error: ' + err.message,
      });
    }
  });
}

function killKernel() {
  if (kernelProcess) {
    try {
      kernelProcess.stdin.write(JSON.stringify({ type: 'exit' }) + '\n');
    } catch (_) {}
    setTimeout(() => {
      if (kernelProcess) {
        kernelProcess.kill();
        kernelProcess = null;
      }
    }, 500);
  }
}

function sendToKernel(message) {
  const line = JSON.stringify(message);
  if (kernelReady && kernelProcess) {
    kernelProcess.stdin.write(line + '\n');
  } else {
    pendingMessages.push(line);
  }
}

// IPC handlers
ipcMain.on('kernel-send', (_event, message) => {
  if (message.type === 'execute') {
    writeLog('NOTEBOOK', `Executing cell: ${message.id}`);
  }
  sendToKernel(message);
});

ipcMain.on('kernel-reset', (_event) => {
  writeLog('NOTEBOOK', 'Kernel reset');
  sendToKernel({ type: 'reset' });
});

ipcMain.handle('save-notebook', async (_event, data) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Notebook',
    defaultPath: data.title ? `${data.title}.polyglot` : 'notebook.polyglot',
    filters: [{ name: 'Notebook', extensions: ['polyglot'] }],
  });

  if (canceled || !filePath) return { success: false };

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, filePath };
  } catch (err) {
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

ipcMain.handle('save-notebook-to', async (_event, { filePath, data }) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-notebook', async (_event) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Notebook',
    filters: [{ name: 'Notebook', extensions: ['polyglot'] }],
    properties: ['openFile'],
  });

  if (canceled || !filePaths.length) return { success: false };

  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    const data = JSON.parse(content);
    return { success: true, data, filePath: filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  startKernel();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  killKernel();
  app.quit();
});

app.on('before-quit', () => {
  killKernel();
});
