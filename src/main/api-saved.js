'use strict';

const path = require('path');
const fs   = require('fs');

let _path = '';

function loadApiSaved(userDataPath) {
  if (userDataPath) _path = path.join(userDataPath, 'api-saved.json');
  try {
    return JSON.parse(fs.readFileSync(_path, 'utf-8'));
  } catch {
    return [];
  }
}

function saveApiSaved(list, userDataPath) {
  if (userDataPath) _path = path.join(userDataPath, 'api-saved.json');
  try {
    fs.mkdirSync(path.dirname(_path), { recursive: true });
    const tmp = _path + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tmp, _path);
  } catch (err) { console.error('[api-saved] save failed:', err.message); }
}

function register(ipcMain, { app }) {
  _path = path.join(app.getPath('userData'), 'api-saved.json');
  ipcMain.handle('api-saved-load', () => loadApiSaved());
  ipcMain.handle('api-saved-save', (_event, list) => saveApiSaved(list));
}

module.exports = { loadApiSaved, saveApiSaved, register };
