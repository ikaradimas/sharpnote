'use strict';

const fs = require('fs');

const MAX_SNAPSHOTS = 50;
// Self-heal cap: a well-formed history of 50 cell/config snapshots is well under a
// megabyte. Anything above this is a pathologically bloated file (e.g. the pre-fix
// bug that duplicated multi-MB embeddedFiles into every snapshot) — ignore it and let
// the next save replace it, rather than synchronously parsing hundreds of MB.
const MAX_HISTORY_BYTES = 25 * 1024 * 1024;
// Large, (near-)static blobs excluded from snapshots. They would otherwise be
// duplicated across all 50 snapshots (embeddedFiles alone can be megabytes → the
// history file ballooned to hundreds of MB and froze the app on every save). Restore
// only ever applies cells/config/title (see App onRestore), so these were never
// restored from history anyway — dropping them is behaviour-preserving.
const SNAPSHOT_OMIT = ['embeddedFiles', 'retainedResults'];

function historyPath(notebookPath) {
  return notebookPath + '.history';
}

function loadHistory(notebookPath) {
  try {
    const hp = historyPath(notebookPath);
    const { size } = fs.statSync(hp);
    if (size > MAX_HISTORY_BYTES) {
      console.warn(`[history] ignoring oversized history file (${(size / 1048576).toFixed(0)}MB): ${hp}`);
      return [];
    }
    return JSON.parse(fs.readFileSync(hp, 'utf-8'));
  } catch { return []; }
}

async function saveSnapshot(notebookPath, data) {
  const hp = historyPath(notebookPath);
  const history = loadHistory(notebookPath);

  const slim = { ...data };
  for (const k of SNAPSHOT_OMIT) delete slim[k];

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
    data: slim,
  };

  history.push(snapshot);

  // FIFO eviction
  while (history.length > MAX_SNAPSHOTS) history.shift();

  try {
    await fs.promises.writeFile(hp, JSON.stringify(history), 'utf-8');
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

  ipcMain.handle('notebook-history-snapshot', async (_event, { filePath, data }) => {
    try {
      await saveSnapshot(filePath, data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { loadHistory, saveSnapshot, restoreSnapshot, deleteHistory, register, MAX_SNAPSHOTS };
