'use strict';

const path = require('path');
const fs   = require('fs');
const { parseDib, parseIpynb } = require('./polyglot-import');

let _mainWindow   = null;
let _addRecentFile = null;
let _writeLog     = null;
let _dialog       = null;

function init({ mainWindow, addRecentFile, writeLog, dialog }) {
  _mainWindow    = mainWindow;
  _addRecentFile = addRecentFile;
  _writeLog      = writeLog || function () {};
  _dialog        = dialog;
}

function setMainWindow(win) {
  _mainWindow = win;
}

function writeNotebookFile(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
  if (_addRecentFile) _addRecentFile(filePath);
  return { success: true, filePath };
}

function register(ipcMain, { mainWindow, dialog, addRecentFile, writeLog } = {}) {
  if (mainWindow)    _mainWindow    = mainWindow;
  if (addRecentFile) _addRecentFile = addRecentFile;
  if (writeLog)      _writeLog      = writeLog;
  if (dialog)        _dialog        = dialog;

  ipcMain.handle('new-notebook-dialog', async () => {
    const { response } = await _dialog.showMessageBox(_mainWindow, {
      type: 'question',
      title: 'New Notebook',
      message: 'Start with a template?',
      buttons: ['Examples', 'Blank', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
    });
    return response;
  });

  ipcMain.handle('save-notebook', async (_event, data) => {
    const { filePath, canceled } = await _dialog.showSaveDialog(_mainWindow, {
      title: 'Save Notebook',
      defaultPath: data.title ? `${data.title}.cnb` : 'notebook.cnb',
      filters: [{ name: 'Notebook', extensions: ['cnb'] }],
    });
    if (canceled || !filePath) return { success: false };
    try {
      const result = writeNotebookFile(filePath, data);
      _writeLog('SAVE', `Notebook saved: ${path.basename(filePath)}`);
      return result;
    } catch (err) {
      _writeLog('SAVE', `Save failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-notebook-to', async (_event, { filePath, data }) => {
    try {
      const result = writeNotebookFile(filePath, data);
      _writeLog('SAVE', `Auto-saved: ${path.basename(filePath)}`);
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-file', async (_event, { content, defaultName, filters }) => {
    const { filePath, canceled } = await _dialog.showSaveDialog(_mainWindow, {
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
    const { filePaths, canceled } = await _dialog.showOpenDialog(_mainWindow, {
      title: 'Open Notebook',
      filters: [{ name: 'Notebook', extensions: ['cnb'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { success: false };
    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8');
      const data    = JSON.parse(content);
      if (_addRecentFile) _addRecentFile(filePaths[0]);
      _writeLog('LOAD', `Notebook opened: ${path.basename(filePaths[0])}`);
      return { success: true, data, filePath: filePaths[0] };
    } catch (err) {
      _writeLog('LOAD', `Open failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('import-polyglot-notebook', async () => {
    const { filePaths, canceled } = await _dialog.showOpenDialog(_mainWindow, {
      title: 'Import Polyglot Notebook',
      filters: [
        { name: 'Polyglot Notebooks', extensions: ['dib', 'ipynb'] },
        { name: '.NET Interactive (.dib)', extensions: ['dib'] },
        { name: 'Jupyter Notebook (.ipynb)', extensions: ['ipynb'] },
      ],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { success: false };

    const filePath = filePaths[0];
    const ext      = path.extname(filePath).toLowerCase();

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const baseName = path.basename(filePath, ext);

      let result;
      if (ext === '.dib') {
        const parsed = parseDib(content);
        result = { ...parsed, title: baseName, format: 'dib' };
      } else if (ext === '.ipynb') {
        const parsed = parseIpynb(content);
        result = { ...parsed, title: parsed.title || baseName, format: 'ipynb' };
      } else {
        return { success: false, error: 'Unrecognised file extension. Expected .dib or .ipynb.' };
      }

      if (result.cells.length === 0) {
        return {
          success: false,
          error: `No C# or Markdown cells found in this notebook.${
            result.skippedCount > 0
              ? ` (${result.skippedCount} non-C# cell${result.skippedCount !== 1 ? 's' : ''} were skipped)`
              : ''
          }`,
        };
      }

      _writeLog('IMPORT', `Polyglot import: ${path.basename(filePath)} → ${result.cells.length} cells, ${result.skippedCount} skipped`);
      return { success: true, ...result, filePath };
    } catch (err) {
      _writeLog('IMPORT', `Polyglot import failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rename-file', async (_event, { oldPath, newPath }) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-recent-file', async (_event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data    = JSON.parse(content);
      if (_addRecentFile) _addRecentFile(filePath);
      _writeLog('LOAD', `Opened: ${path.basename(filePath)}`);
      return { success: true, data, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { writeNotebookFile, init, setMainWindow, register };
