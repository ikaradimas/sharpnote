'use strict';

const path = require('path');
const fs   = require('fs');

// libraryDir is computed at module load time from the electron app mock or real app.
// We defer initialisation so tests can set VITEST before requiring this module.
let _libraryDir = null;

function getLibraryDir() {
  if (!_libraryDir) {
    // Lazy-init: require electron at call time so the VITEST mock is in place.
    const { app } = require(process.env.VITEST ? '../../__mocks__/electron.js' : 'electron');
    _libraryDir = path.join(app.getPath('documents'), 'SharpNote Notebooks', 'Library');
  }
  return _libraryDir;
}

// For direct init from main.js (non-lazy path).
function init(libraryDir) {
  _libraryDir = libraryDir;
}

// Resolves a library file path to an absolute path within libraryDir.
// Returns null if the resolved path would escape the library directory.
function resolveLibraryPath(filePath) {
  const libraryDir = getLibraryDir();
  const full = path.isAbsolute(filePath) ? filePath : path.join(libraryDir, filePath);
  return full.startsWith(libraryDir) ? full : null;
}

function register(ipcMain, { shell }) {
  const libraryDir = getLibraryDir();

  ipcMain.handle('get-library-files', async (_event, subfolder = '') => {
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
    } catch {
      return { folders: [], files: [] };
    }
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
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-library-file', async (_event, filePath) => {
    const full = resolveLibraryPath(filePath);
    if (!full) return { success: false, error: 'Path outside library' };
    try {
      fs.unlinkSync(full);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-library-folder', async () => {
    fs.mkdirSync(libraryDir, { recursive: true });
    await shell.openPath(libraryDir);
    return { success: true };
  });
}

module.exports = { resolveLibraryPath, getLibraryDir, init, register };
