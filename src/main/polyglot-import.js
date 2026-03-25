'use strict';

// ── Polyglot Notebook importer ────────────────────────────────────────────────
//
// Supports two formats:
//   .dib  — .NET Interactive text format  (#!csharp / #!markdown / #!meta blocks)
//   .ipynb — Jupyter JSON format with .NET Interactive metadata
//
// Only C# and markdown cells are imported. All other languages are counted as
// skipped and reported back to the caller.

const CSHARP_LANG_IDS = new Set(['csharp', 'c#', '.net-csharp', '.net (c#)']);

function isCSharpLang(lang) {
  return typeof lang === 'string' && CSHARP_LANG_IDS.has(lang.toLowerCase().trim());
}

// ── .dib parser ───────────────────────────────────────────────────────────────

/**
 * Parse a .dib file.
 * @param {string} content Raw file text.
 * @returns {{ cells: Array<{type,content}>, skippedCount: number }}
 */
function parseDib(content) {
  const cells = [];
  let skippedCount = 0;

  // Split at lines starting with a #! directive (lookahead keeps directive in chunk).
  const chunks = content.split(/^(?=#![a-zA-Z])/m).filter((s) => s.trim());

  for (const chunk of chunks) {
    const lineEnd = chunk.indexOf('\n');
    if (lineEnd === -1) continue;

    const directive = chunk.slice(0, lineEnd).trim(); // e.g. "#!csharp"
    const body      = chunk.slice(lineEnd + 1);

    if (!directive.startsWith('#!')) continue; // text before first directive
    if (directive === '#!meta')      continue; // kernel metadata JSON — skip
    if (directive === '#!import')    continue; // notebook imports — skip

    const trimmed = body.trim();
    if (!trimmed) continue; // empty cell body

    if (directive === '#!markdown') {
      cells.push({ type: 'markdown', content: trimmed });
    } else if (directive === '#!csharp') {
      cells.push({ type: 'code', content: trimmed });
    } else {
      // #!fsharp, #!pwsh, #!javascript, #!html, #!mermaid, #!python, #!sql, …
      skippedCount++;
    }
  }

  return { cells, skippedCount };
}

// ── .ipynb parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Jupyter .ipynb file.
 * @param {string} content Raw file text.
 * @returns {{ cells: Array<{type,content}>, skippedCount: number, title: string }}
 */
function parseIpynb(content) {
  let nb;
  try {
    nb = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON in .ipynb file');
  }

  if (!nb.cells || !Array.isArray(nb.cells)) {
    throw new Error('Missing cells array in .ipynb file');
  }

  const cells = [];
  let skippedCount = 0;
  let title = '';

  // Notebook-level default kernel language
  const nbKernelLang =
    nb.metadata?.kernelspec?.language ||
    nb.metadata?.kernelspec?.name     ||
    nb.metadata?.language_info?.name  || '';
  // "polyglot-notebook" means mixed — treat cells individually;
  // a pure C# notebook has every code cell as C# by default.
  const nbDefaultIsCSharp = isCSharpLang(nbKernelLang);

  for (const cell of nb.cells) {
    const sourceArr = cell.source ?? [];
    const source = (Array.isArray(sourceArr) ? sourceArr.join('') : String(sourceArr));

    // ── Markdown ──────────────────────────────────────────────────────────────
    if (cell.cell_type === 'markdown') {
      const trimmed = source.trim();
      if (!trimmed) continue;

      // Capture the first heading as the notebook title
      if (!title) {
        const m = trimmed.match(/^#+\s+(.+)/m);
        if (m) title = m[1].trim();
      }
      cells.push({ type: 'markdown', content: trimmed });
      continue;
    }

    // ── Code ──────────────────────────────────────────────────────────────────
    if (cell.cell_type === 'code') {
      const meta = cell.metadata ?? {};

      // Cell-level language (most authoritative)
      const cellLang =
        meta.dotnet_interactive?.language ||
        meta.polyglot_notebook?.kernelName ||
        null;

      // Detect inline #!<lang> shebang on first line (Polyglot Notebooks extension)
      const shebanMatch = source.match(/^#!([a-zA-Z]+)\s*\n/);
      const shebanLang  = shebanMatch ? shebanMatch[1] : null;

      // Resolution order: explicit cell meta → inline shebang → notebook default
      const resolvedLang = cellLang || shebanLang || (nbDefaultIsCSharp ? 'csharp' : null);

      // Strip the #!csharp shebang from the content if present
      let codeContent = source;
      if (shebanMatch && isCSharpLang(shebanLang)) {
        codeContent = source.slice(shebanMatch[0].length);
      }

      const trimmed = codeContent.trim();
      if (!trimmed) continue;

      if (resolvedLang && isCSharpLang(resolvedLang)) {
        cells.push({ type: 'code', content: trimmed });
      } else {
        skippedCount++;
      }
    }
    // Ignore raw / other cell types
  }

  return { cells, skippedCount, title };
}

module.exports = { parseDib, parseIpynb };
