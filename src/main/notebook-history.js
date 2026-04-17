'use strict';

const fs = require('fs');

const MAX_SNAPSHOTS = 50;

function historyPath(notebookPath) {
  return notebookPath + '.history';
}

function loadHistory(notebookPath) {
  try {
    return JSON.parse(fs.readFileSync(historyPath(notebookPath), 'utf-8'));
  } catch { return []; }
}

function saveSnapshot(notebookPath, data) {
  const hp = historyPath(notebookPath);
  const history = loadHistory(notebookPath);

  const snapshot = {
    timestamp: new Date().toISOString(),
    title: data.title,
    cellCount: data.cells?.length ?? 0,
    configCount: data.config?.length ?? 0,
    cellSummary: (data.cells || []).map((c) => ({
      id: c.id,
      type: c.type,
      preview: (c.content || '').slice(0, 80),
    })),
    data: { ...data },
  };

  history.push(snapshot);

  // FIFO eviction
  while (history.length > MAX_SNAPSHOTS) history.shift();

  try {
    fs.writeFileSync(hp, JSON.stringify(history), 'utf-8');
  } catch (err) {
    console.error('[history] save failed:', err.message);
  }
}

function restoreSnapshot(notebookPath, index) {
  const history = loadHistory(notebookPath);
  if (index < 0 || index >= history.length) return null;
  return history[index].data;
}

function deleteHistory(notebookPath) {
  try { fs.unlinkSync(historyPath(notebookPath)); } catch {} // eslint-disable-line no-empty
}

function register(ipcMain) {
  ipcMain.handle('notebook-history-list', (_event, filePath) => {
    return loadHistory(filePath).map((s, i) => ({
      index: i,
      timestamp: s.timestamp,
      title: s.title,
      cellCount: s.cellCount,
      configCount: s.configCount,
      cellSummary: s.cellSummary,
    }));
  });

  ipcMain.handle('notebook-history-restore', (_event, { filePath, index }) => {
    return restoreSnapshot(filePath, index);
  });

  ipcMain.handle('notebook-history-delete', (_event, filePath) => {
    deleteHistory(filePath);
    return { success: true };
  });

  ipcMain.handle('notebook-history-snapshot', (_event, { filePath, data }) => {
    try {
      saveSnapshot(filePath, data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { loadHistory, saveSnapshot, restoreSnapshot, deleteHistory, register, MAX_SNAPSHOTS };
