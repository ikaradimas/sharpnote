import { DOCS_TAB_ID, LIB_EDITOR_ID_PREFIX } from './constants.js';

// ── Tab ID helpers ─────────────────────────────────────────────────────────────
export const makeLibEditorId = (fullPath) => `${LIB_EDITOR_ID_PREFIX}${fullPath}`;
export const isLibEditorId  = (id) => id?.startsWith(LIB_EDITOR_ID_PREFIX) ?? false;
export const isNotebookId   = (id) => !!(id && id !== DOCS_TAB_ID && !isLibEditorId(id));

// ── Notebook display name ──────────────────────────────────────────────────────
// Returns the human-readable name for a notebook given its saved path and/or title.
export function getNotebookDisplayName(notebookPath, title, fallback = 'Untitled') {
  if (notebookPath) return notebookPath.split(/[\\/]/).pop().replace(/\.cnb$/, '');
  return title || fallback;
}

// ── Log timestamp formatting ───────────────────────────────────────────────────
export function formatLogTime(timestamp) {
  if (!timestamp) return '';
  // ISO string: "2026-03-18T12:34:56.789Z" — slice HH:MM:SS.mmm from the time part
  const t = new Date(timestamp);
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  const ms = String(t.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

// ── Table of Contents heading extraction ──────────────────────────────────────
export function extractHeadings(cells) {
  const headings = [];
  cells.forEach((cell) => {
    if (cell.type !== 'markdown') return;
    (cell.content || '').split('\n').forEach((line) => {
      const m = line.match(/^(#{1,3})\s+(.+)$/);
      if (m) headings.push({ level: m[1].length, text: m[2].trim(), cellId: cell.id });
    });
  });
  return headings;
}

// ── CSV parsing ───────────────────────────────────────────────────────────────
export function parseCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 1) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ''; });
    return obj;
  });
}

// ── Table to CSV conversion ───────────────────────────────────────────────────
export function tableToCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))].join('\n');
}

// ── File size formatting ──────────────────────────────────────────────────────
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
