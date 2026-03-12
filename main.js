const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const readline = require('readline');

let mainWindow = null;
let kernelProcess = null;
let kernelReady = false;
let pendingMessages = [];

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

  mainWindow.on('closed', () => {
    mainWindow = null;
    killKernel();
  });
}

function startKernel() {
  const kernelDir = path.join(__dirname, 'kernel');

  try {
    kernelProcess = spawn('dotnet', ['run', '--project', kernelDir], {
      cwd: kernelDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error('Failed to start kernel:', err);
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
        // Flush any pending messages
        for (const pending of pendingMessages) {
          kernelProcess.stdin.write(pending + '\n');
        }
        pendingMessages = [];
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
  sendToKernel(message);
});

ipcMain.on('kernel-reset', (_event) => {
  sendToKernel({ type: 'reset' });
});

ipcMain.handle('save-notebook', async (_event, data) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Notebook',
    defaultPath: data.title ? `${data.title}.polyglot` : 'notebook.polyglot',
    filters: [{ name: 'Polyglot Notebook', extensions: ['polyglot'] }],
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

ipcMain.handle('load-notebook', async (_event) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Notebook',
    filters: [{ name: 'Polyglot Notebook', extensions: ['polyglot'] }],
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
