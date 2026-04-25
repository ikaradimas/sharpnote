'use strict';

// Output-snapshot persistence and comparison. Lives next to the notebook
// at <notebook-dir>/.snapshots/<cell-id>.snap.json so files diff cleanly
// in git and individual cells can be deleted without touching the rest.

const path = require('path');
const fs   = require('fs');

const SNAPSHOT_DIR = '.snapshots';

// Strip per-run identifiers and timing so that re-running a cell that
// produces equivalent outputs compares as a match. Keep `format`,
// `content`, and the format-specific payload fields.
function normalize(outputs) {
  if (!Array.isArray(outputs)) return [];
  return outputs.map((o) => {
    const out = { type: o.type };
    if (o.format !== undefined)  out.format  = o.format;
    if (o.content !== undefined) out.content = o.content;
    if (o.title !== undefined)   out.title   = o.title;
    // Errors carry message + stackTrace; include both so a snapshot of a
    // deliberately-failing cell can pin the error string.
    if (o.message !== undefined)    out.message    = o.message;
    if (o.stackTrace !== undefined) out.stackTrace = o.stackTrace;
    return out;
  });
}

function pathFor(notebookPath, cellId) {
  if (!notebookPath || !cellId) return null;
  return path.join(path.dirname(notebookPath), SNAPSHOT_DIR, `${cellId}.snap.json`);
}

function loadSnapshot(notebookPath, cellId) {
  const p = pathFor(notebookPath, cellId);
  if (!p || !fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(data?.outputs) ? data.outputs : null;
  } catch {
    return null;
  }
}

function saveSnapshot(notebookPath, cellId, outputs) {
  const p = pathFor(notebookPath, cellId);
  if (!p) return false;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({
      cellId,
      capturedAt: new Date().toISOString(),
      outputs: normalize(outputs),
    }, null, 2));
    return true;
  } catch {
    return false;
  }
}

function deleteSnapshot(notebookPath, cellId) {
  const p = pathFor(notebookPath, cellId);
  if (!p || !fs.existsSync(p)) return false;
  try { fs.unlinkSync(p); return true; } catch { return false; }
}

// Stable JSON: object keys sorted recursively so that property-order
// differences don't masquerade as semantic differences.
function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function compare(saved, current) {
  const a = normalize(saved);
  const b = normalize(current);
  const match = stableStringify(a) === stableStringify(b);
  return { match, savedCount: a.length, currentCount: b.length };
}

// Capture-or-compare in one call: if no snapshot exists yet, save the
// current outputs and report `{ match:true, captured:true }`. Otherwise
// compare against the saved file.
function captureOrCompare(notebookPath, cellId, currentOutputs) {
  if (!notebookPath) return { match: false, error: 'no-notebook-path' };
  const saved = loadSnapshot(notebookPath, cellId);
  if (saved === null) {
    const ok = saveSnapshot(notebookPath, cellId, currentOutputs);
    return { match: true, captured: ok };
  }
  return { ...compare(saved, currentOutputs), captured: false };
}

function register(ipcMain) {
  ipcMain.handle('snapshot:capture-or-compare', (_e, { notebookPath, cellId, outputs }) =>
    captureOrCompare(notebookPath, cellId, outputs));
  ipcMain.handle('snapshot:save', (_e, { notebookPath, cellId, outputs }) =>
    saveSnapshot(notebookPath, cellId, outputs));
  ipcMain.handle('snapshot:delete', (_e, { notebookPath, cellId }) =>
    deleteSnapshot(notebookPath, cellId));
}

module.exports = {
  normalize,
  compare,
  pathFor,
  loadSnapshot,
  saveSnapshot,
  deleteSnapshot,
  captureOrCompare,
  register,
};
