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

  handle('fs-read-preview', (_event, filePath) => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) return { success: false, error: 'Is a directory' };
      const ext = path.extname(filePath).toLowerCase();
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico'];
      if (imageExts.includes(ext)) {
        // Return a data URI for image preview
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
          '.webp': 'image/webp', '.ico': 'image/x-icon' };
        const mime = mimeMap[ext] || 'application/octet-stream';
        const buf = fs.readFileSync(filePath);
        if (buf.length > 2 * 1024 * 1024) return { success: true, isImage: true, tooLarge: true };
        return { success: true, isImage: true, dataUri: `data:${mime};base64,${buf.toString('base64')}` };
      }
      // Text preview: read first 2KB
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(2048);
      const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
      fs.closeSync(fd);
      const text = buf.slice(0, bytesRead).toString('utf-8');
      // Check for binary content
      if (text.includes('\0')) return { success: true, isBinary: true };
      const lines = text.split('\n').slice(0, 20);
      return { success: true, isText: true, lines };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

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
