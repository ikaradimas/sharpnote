'use strict';

const path = require('path');
const fs   = require('fs');

// Captured IPC handlers/events for test access (populated when VITEST is set).
const _ipcHandlers = {};
const _ipcEvents   = {};

let _shell = null;

function register(ipcMain, { app, shell }) {
  _shell = shell;

  function handle(channel, fn) {
    if (process.env.VITEST) _ipcHandlers[channel] = fn;
    ipcMain.handle(channel, fn);
  }

  handle('fs-readdir', (_event, dirPath) => {
    try {
      const names = fs.readdirSync(dirPath);
      const entries = names.map((name) => {
        const full = path.join(dirPath, name);
        try {
          const stat = fs.statSync(full);
          return { name, isDirectory: stat.isDirectory(), size: stat.size, mtime: stat.mtimeMs };
        } catch {
          return { name, isDirectory: false, size: 0, mtime: 0, unreadable: true };
        }
      });
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      const parent = path.dirname(dirPath);
      return { success: true, entries, dirPath, parentDir: parent !== dirPath ? parent : null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  handle('fs-rename', (_event, { oldPath, newPath }) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  handle('fs-delete', async (_event, filePath) => {
    try {
      await shell.trashItem(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  handle('fs-mkdir', (_event, dirPath) => {
    try {
      fs.mkdirSync(dirPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  handle('fs-open-path', async (_event, filePath) => {
    const err = await shell.openPath(filePath);
    return err ? { success: false, error: err } : { success: true };
  });

  handle('fs-get-home', () => app.getPath('home'));

  handle('pick-embed-file', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: 'Embed File',
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    const path = require('path');
    const fs = require('fs');
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap = { '.csv': 'text/csv', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'text/xml', '.html': 'text/html', '.md': 'text/markdown', '.yaml': 'text/yaml', '.yml': 'text/yaml' };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const isText = mimeType.startsWith('text/') || mimeType === 'application/json';
    const raw = fs.readFileSync(filePath);
    return {
      filename,
      mimeType,
      content: isText ? raw.toString('utf-8') : raw.toString('base64'),
      encoding: isText ? 'text' : 'base64',
    };
  });
  handle('get-env-var', (_event, name) => {
    if (typeof name !== 'string' || !name) return '';
    return process.env[name] ?? '';
  });
}

// Auto-register IPC handlers when running under Vitest so tests can
// import this module directly without going through main.js.
if (process.env.VITEST) {
  const electron = require('../../__mocks__/electron.js');
  register(electron.ipcMain, { app: electron.app, shell: electron.shell });
}

module.exports = { register, _ipcHandlers, _ipcEvents, get _shell() { return _shell; } };
