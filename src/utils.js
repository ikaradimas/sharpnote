import { DOCS_TAB_ID, LIB_EDITOR_ID_PREFIX, PANEL_TAB_PREFIX } from './constants.js';
import katex from 'katex';

// ── Tab ID helpers ─────────────────────────────────────────────────────────────
export const makeLibEditorId = (fullPath) => `${LIB_EDITOR_ID_PREFIX}${fullPath}`;
export const isLibEditorId  = (id) => id?.startsWith(LIB_EDITOR_ID_PREFIX) ?? false;
export const isPanelTabId    = (id) => id?.startsWith(PANEL_TAB_PREFIX) ?? false;
export const panelIdFromTabId = (id) => id?.slice(PANEL_TAB_PREFIX.length);
export const makePanelTabId  = (panelId) => `${PANEL_TAB_PREFIX}${panelId}`;
export const isNotebookId   = (id) => !!(id && id !== DOCS_TAB_ID && !isLibEditorId(id) && !isPanelTabId(id));

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

// ── Section collapse helpers ───────────────────────────────────────────────────
// Returns the heading level (1–3) if a markdown cell's first non-empty line is
// a heading, otherwise null.
export function getSectionHeadingLevel(cell) {
  if (cell.type !== 'markdown') return null;
  const firstLine = (cell.content || '').split('\n').find((l) => l.trim() !== '');
  const m = firstLine?.match(/^(#{1,3})\s+/);
  return m ? m[1].length : null;
}

// Returns:
//   hidden  — Set of cell IDs that belong to a currently-collapsed section
//   counts  — Map from a collapsed heading cell ID to the number of cells it hides
export function getCollapsedSections(cells) {
  const hidden = new Set();
  const counts = new Map();
  let collapsedHeaderId = null;
  let collapsedLevel = null;

  for (const cell of cells) {
    const level = getSectionHeadingLevel(cell);

    if (collapsedLevel !== null) {
      if (level !== null && level <= collapsedLevel) {
        // This heading closes the active collapsed section.
        collapsedHeaderId = null;
        collapsedLevel = null;
        if (cell.collapsed) {
          collapsedHeaderId = cell.id;
          collapsedLevel = level;
          counts.set(cell.id, 0);
        }
      } else {
        hidden.add(cell.id);
        counts.set(collapsedHeaderId, (counts.get(collapsedHeaderId) ?? 0) + 1);
      }
    } else if (cell.collapsed && level !== null) {
      collapsedHeaderId = cell.id;
      collapsedLevel = level;
      counts.set(cell.id, 0);
    }
  }

  return { hidden, counts };
}

// ── Table of Contents heading extraction ──────────────────────────────────────
export function extractHeadings(cells) {
  const headings = [];
  cells.forEach((cell) => {
    // Markdown headings
    if (cell.type === 'markdown') {
      (cell.content || '').split('\n').forEach((line) => {
        const m = line.match(/^(#{1,3})\s+(.+)$/);
        if (m) headings.push({ level: m[1].length, text: m[2].trim(), cellId: cell.id });
      });
      return;
    }
    // Named non-markdown cells appear as level-3 entries
    if (cell.name) {
      const typeLabel = (cell.type || 'code').charAt(0).toUpperCase() + (cell.type || 'code').slice(1);
      headings.push({ level: 3, text: `${cell.name}`, cellId: cell.id, cellType: typeLabel });
    }
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

// ── Table to TSV conversion ──────────────────────────────────────────────────
export function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function tableToTSV(rows) {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const escape = (v) => String(v ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ');
  return [cols.join('\t'), ...rows.map((r) => cols.map((c) => escape(r[c])).join('\t'))].join('\n');
}

// ── File size formatting ──────────────────────────────────────────────────────
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── KaTeX math pre-processing ─────────────────────────────────────────────────
// Replaces $...$ (inline) and $$...$$ (block) with rendered KaTeX HTML, skipping
// fenced code blocks and inline code spans so math inside code is never touched.
export function applyMath(content) {
  const parts = content.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part; // inside code — leave as-is

    // Block math first: $$...$$
    part = part.replace(/\$\$([^$]+?)\$\$/gs, (_, math) => {
      try {
        return `\n<div class="math-block">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>\n`;
      } catch (e) {
        return `<div class="math-block math-error">$$${math}$$</div>`;
      }
    });

    // Inline math: $...$
    part = part.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      } catch (e) {
        return `<span class="math-error">$${math}$</span>`;
      }
    });

    return part;
  }).join('');
}

/** Scroll an element into view and briefly flash it with the cell-flash animation. */
export function scrollAndFlash(el, block = 'nearest') {
  el.scrollIntoView({ behavior: 'smooth', block });
  el.classList.add('cell-flash');
  el.addEventListener('animationend', () => el.classList.remove('cell-flash'), { once: true });
}

// ── Docker Compose generation ─────────────────────────────────────────────────

function yamlQuote(s) {
  if (!s) return '""';
  if (/[:#{}[\],&*?|>!%@`'"\n]/.test(s) || s.trim() !== s) return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return s;
}

/** Generate a docker-compose.yml string from an array of docker cells. */
export function generateDockerCompose(dockerCells) {
  const lines = ['version: "3.8"', '', 'services:'];

  for (const cell of dockerCells) {
    const name = cell.containerName || cell.name || cell.image.replace(/[/:]/g, '-').replace(/^-|-$/g, '') || 'service';
    lines.push(`  ${name}:`);
    lines.push(`    image: ${yamlQuote(cell.image)}`);

    if (cell.containerName) {
      lines.push(`    container_name: ${yamlQuote(cell.containerName)}`);
    }

    // Ports: "8080:80, 3000:3000"
    if (cell.ports) {
      const mappings = cell.ports.split(',').map((s) => s.trim()).filter(Boolean);
      if (mappings.length > 0) {
        lines.push('    ports:');
        for (const m of mappings) lines.push(`      - ${yamlQuote(m)}`);
      }
    }

    // Environment: "KEY=val, FOO=bar"
    if (cell.env) {
      const entries = cell.env.split(',').map((s) => s.trim()).filter(Boolean);
      if (entries.length > 0) {
        lines.push('    environment:');
        for (const e of entries) lines.push(`      - ${yamlQuote(e)}`);
      }
    }

    // Volumes: single mapping
    if (cell.volume) {
      lines.push('    volumes:');
      lines.push(`      - ${yamlQuote(cell.volume)}`);
    }

    // Command override
    if (cell.command) {
      lines.push(`    command: ${yamlQuote(cell.command)}`);
    }

    // Restart policy for startup containers
    if (cell.runOnStartup) {
      lines.push('    restart: unless-stopped');
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function formatCSharpLiteral(value, typeName) {
  if (value === null || value === 'null') return 'null';
  const t = (typeName || '').toLowerCase();
  if (t === 'boolean' || t === 'bool') return value.toLowerCase() === 'true' ? 'true' : 'false';
  if (t === 'int32' || t === 'int') return value;
  if (t === 'int64' || t === 'long') return `${value}L`;
  if (t === 'single' || t === 'float') return `${value}f`;
  if (t === 'double') return value.includes('.') ? `${value}d` : `${value}.0d`;
  if (t === 'decimal') return `${value}m`;
  if (t === 'char') return `'${value.replace(/'/g, "\\'")}'`;
  // Default: treat as string
  return `"${(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
}
