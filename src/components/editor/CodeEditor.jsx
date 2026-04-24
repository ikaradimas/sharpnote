import React, { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, RangeSet, Prec, Compartment } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, hoverTooltip, showTooltip, gutter, GutterMarker, Decoration } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { StreamLanguage, bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { standardSQL } from '@codemirror/legacy-modes/mode/sql';
import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { LanguageServerClient, languageServerPlugin, jumpToDefinitionKeymap, jumpToDefinitionPos } from 'codemirror-languageserver';
import { ElectronLspTransport } from './lspTransport.js';

// ── Cursor position broadcast ─────────────────────────────────────────────────
// Any focused CodeEditor writes here; StatusBar subscribes via register fn.
export let _setCursorPos = null;
export function registerCursorPosSetter(fn) { _setCursorPos = fn; }

// ── LSP helpers ───────────────────────────────────────────────────────────────

const CompletionTriggerKind = { Invoked: 1, TriggerCharacter: 2 };

function offsetToPos(doc, offset) {
  const line = doc.lineAt(offset);
  return { line: line.number - 1, character: offset - line.from };
}

// ── Signature help ────────────────────────────────────────────────────────────

const sigHelpEffect = StateEffect.define();

const sigHelpField = StateField.define({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(sigHelpEffect)) return e.value;
    }
    if (!value) return null;
    if (!tr.docChanged) {
      // Cursor moved (arrow keys, click) — dismiss if before the ( anchor.
      if (tr.selection && tr.newSelection.main.head < value.pos) return null;
      return value;
    }
    // Map the ( anchor through the document changes.
    const mapped = tr.changes.mapPos(value.pos, -1);
    // If mapped moved backwards, content at/before ( was deleted — dismiss.
    // If cursor is now before the anchor — dismiss.
    if (mapped < value.pos || tr.newSelection.main.head < mapped) return null;
    return { ...value, pos: mapped };
  },
  provide: f => showTooltip.from(f, info => {
    if (!info) return null;
    const sig = info.signatures?.[info.activeSignature ?? 0];
    if (!sig) return null;
    const activeParam = info.activeParameter ?? sig.activeParameter ?? 0;
    const param = sig.parameters?.[activeParam];
    return {
      pos: info.pos,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className = 'cm-signature-help';
        if (param?.label != null && Array.isArray(param.label)) {
          const [start, end] = param.label;
          dom.append(
            document.createTextNode(sig.label.slice(0, start)),
            Object.assign(document.createElement('span'), {
              className: 'cm-sig-active',
              textContent: sig.label.slice(start, end),
            }),
            document.createTextNode(sig.label.slice(end)),
          );
        } else {
          dom.textContent = sig.label;
        }
        return { dom };
      },
    };
  }),
});

function buildSigHelpListener(documentUri) {
  return EditorView.updateListener.of(async (update) => {
    if (!update.docChanged) return;
    const { view, state } = update;

    // Only act on single-character insertions (normal typing).
    let lastChar = null;
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      if (fromA === toA && inserted.length === 1) lastChar = inserted.sliceString(0, 1);
    });

    if (lastChar === ')') {
      view.dispatch({ effects: sigHelpEffect.of(null) });
      return;
    }
    if (lastChar !== '(' && lastChar !== ',') return;

    const plugin = view.plugin(languageServerPlugin);
    if (!plugin?.client?.ready) return;

    const pos = state.selection.main.head;
    try {
      const result = await plugin.client.request(
        'textDocument/signatureHelp',
        {
          textDocument: { uri: documentUri },
          position: offsetToPos(state.doc, pos),
          context: { triggerKind: 2, triggerCharacter: lastChar, isRetrigger: lastChar === ',' },
        },
        5000,
      );
      view.dispatch({
        effects: sigHelpEffect.of(result?.signatures?.length ? { pos, ...result } : null),
      });
    } catch {
      view.dispatch({ effects: sigHelpEffect.of(null) });
    }
  });
}

// ── LSP extension builder ─────────────────────────────────────────────────────
//
// Builds the full set of LSP extensions manually instead of using
// languageServerWithTransport, for two reasons:
//
//   1. Completions: the built-in autocompletion() returns `filter: false`, which
//      sets the default validFor to /^$/ and causes the popup to close on the
//      very next keystroke.  We wrap requestCompletion to return
//      `filter: true, validFor: /^\w*$/` so CodeMirror keeps the popup open
//      and filters the existing list as the user types.
//
//   2. Signature help: codemirror-languageserver declares the signatureHelp
//      capability but never requests it.  We add a document-update listener
//      that fires textDocument/signatureHelp on ( and , and shows the result
//      in a CodeMirror tooltip.

function buildLspExtensions(notebookId, cellId) {
  const documentUri = `file:///cell-${notebookId}-${cellId}.csx`;
  const client = new LanguageServerClient({
    transport: new ElectronLspTransport(notebookId),
    rootUri: null,
    workspaceFolders: null,
    autoClose: true,
  });

  return [
    languageServerPlugin.of({ client, documentUri, languageId: 'csharp' }),

    // Hover documentation tooltip
    hoverTooltip((view, pos) => {
      const plugin = view.plugin(languageServerPlugin);
      return plugin?.requestHoverTooltip(view, offsetToPos(view.state.doc, pos)) ?? null;
    }),

    // Completions — wraps the plugin's requestCompletion so the popup stays open
    // as the user types (filter: true + validFor) instead of closing immediately.
    autocompletion({
      override: [
        async (context) => {
          const { state, pos, explicit, view } = context;
          const plugin = view.plugin(languageServerPlugin);
          if (!plugin) return null;

          const line = state.doc.lineAt(pos);
          let trigKind = CompletionTriggerKind.Invoked;
          let trigChar;
          const trigChars = plugin.client?.capabilities?.completionProvider?.triggerCharacters;
          if (!explicit && trigChars?.includes(line.text[pos - line.from - 1])) {
            trigKind = CompletionTriggerKind.TriggerCharacter;
            trigChar = line.text[pos - line.from - 1];
          }
          if (trigKind === CompletionTriggerKind.Invoked && !context.matchBefore(/\w+$/)) return null;

          const result = await plugin.requestCompletion(
            context,
            offsetToPos(state.doc, pos),
            { triggerCharacter: trigChar, triggerKind: trigKind },
          );
          if (!result) return null;
          return { ...result, filter: true, validFor: /^\w*$/ };
        },
      ],
    }),

    // Jump-to-definition (keyboard + Ctrl/Cmd+Click)
    keymap.of([
      ...jumpToDefinitionKeymap,
      {
        key: 'Escape',
        run(view) {
          if (!view.state.field(sigHelpField, false)) return false;
          view.dispatch({ effects: sigHelpEffect.of(null) });
          return true;
        },
      },
    ]),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!event.ctrlKey && !event.metaKey) return;
        const p = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (p == null) return;
        if (jumpToDefinitionPos(p)(view)) event.preventDefault();
      },
    }),

    // Signature help
    sigHelpField,
    buildSigHelpListener(documentUri),
  ];
}

// ── SQL completion source ─────────────────────────────────────────────────────

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'AS',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'CROSS', 'ON', 'USING',
  'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
  'ALTER', 'DROP', 'INDEX', 'VIEW', 'IF', 'EXISTS', 'PRIMARY', 'KEY',
  'FOREIGN', 'REFERENCES', 'UNIQUE', 'DEFAULT', 'CHECK', 'CONSTRAINT',
  'UNION', 'ALL', 'DISTINCT', 'BETWEEN', 'LIKE', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'CAST', 'COALESCE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'NULLIF', 'TRUE', 'FALSE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION',
];

function buildSqlCompletionSource(schema) {
  const tables = schema?.tables || [];
  const tableCompletions = tables.map((t) => ({
    label: t.name,
    type: 'class',
    detail: t.schema && t.schema !== 'dbo' && t.schema !== 'public' ? `${t.schema}` : 'table',
    boost: 2,
  }));
  const columnCompletions = [];
  for (const t of tables) {
    for (const c of t.columns || []) {
      columnCompletions.push({
        label: c.name,
        type: 'property',
        detail: `${t.name}.${c.dbType}${c.isPrimaryKey ? ' PK' : ''}`,
      });
    }
  }
  const tableColumnMap = {};
  for (const t of tables) {
    tableColumnMap[t.name.toLowerCase()] = (t.columns || []).map((c) => ({
      label: c.name,
      type: 'property',
      detail: `${c.dbType}${c.isPrimaryKey ? ' PK' : ''}`,
    }));
  }
  const kwCompletions = SQL_KEYWORDS.map((kw) => ({ label: kw, type: 'keyword', boost: -1 }));

  return (context) => {
    const dotMatch = context.matchBefore(/\w+\.\w*/);
    if (dotMatch) {
      const dotPos = dotMatch.text.indexOf('.');
      const tableName = dotMatch.text.slice(0, dotPos).toLowerCase();
      const cols = tableColumnMap[tableName];
      if (cols) {
        return { from: dotMatch.from + dotPos + 1, options: cols, filter: true };
      }
    }
    const word = context.matchBefore(/\w+/);
    if (!word && !context.explicit) return null;
    return {
      from: word ? word.from : context.pos,
      options: [...kwCompletions, ...tableCompletions, ...columnCompletions],
      filter: true,
    };
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

// ── Breakpoint gutter ────────────────────────────────────────────────────────

const toggleBreakpointEffect = StateEffect.define();
const setBreakpointsEffect = StateEffect.define();

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-breakpoint-marker';
    return el;
  }
}
const breakpointMarkerInstance = new BreakpointMarker();

const breakpointState = StateField.define({
  create() { return RangeSet.empty; },
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setBreakpointsEffect)) {
        // Replace all breakpoints from external source (lines array, 1-based)
        const builders = [];
        for (const lineNum of e.value) {
          if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
            builders.push(breakpointMarkerInstance.range(tr.state.doc.line(lineNum).from));
          }
        }
        return RangeSet.of(builders, true);
      }
      if (e.is(toggleBreakpointEffect)) {
        const line = tr.state.doc.lineAt(e.value);
        let found = false;
        const filtered = [];
        const iter = set.iter();
        while (iter.value) {
          if (iter.from === line.from) { found = true; }
          else { filtered.push(iter.value.range(iter.from)); }
          iter.next();
        }
        if (!found) filtered.push(breakpointMarkerInstance.range(line.from));
        return RangeSet.of(filtered, true);
      }
    }
    return set;
  },
});

const breakpointLineDeco = Decoration.line({ class: 'cm-breakpoint-line' });

const breakpointLineDecoField = StateField.define({
  create() { return Decoration.none; },
  update(_, tr) {
    const bpSet = tr.state.field(breakpointState);
    const decos = [];
    const iter = bpSet.iter();
    while (iter.value) {
      decos.push(breakpointLineDeco.range(iter.from));
      iter.next();
    }
    return Decoration.set(decos, true);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function breakpointGutter(onToggle) {
  return [
    breakpointState,
    breakpointLineDecoField,
    gutter({
      class: 'cm-breakpoint-gutter',
      markers: (v) => v.state.field(breakpointState),
      initialSpacer: () => breakpointMarkerInstance,
      domEventHandlers: {
        mousedown(view, line) {
          view.dispatch({ effects: toggleBreakpointEffect.of(line.from) });
          // Compute 1-based line number and notify parent
          const lineNum = view.state.doc.lineAt(line.from).number;
          onToggle?.(lineNum);
          return true;
        },
      },
    }),
  ];
}

// ── Paused-line highlight ────────────────────────────────────────────────────

const setPausedLineEffect = StateEffect.define();

const pausedLineDeco = Decoration.line({ class: 'cm-debug-paused-line' });

const pausedLineField = StateField.define({
  create() { return Decoration.none; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setPausedLineEffect)) {
        if (e.value == null) return Decoration.none;
        if (e.value >= 1 && e.value <= tr.state.doc.lines) {
          return Decoration.set([pausedLineDeco.range(tr.state.doc.line(e.value).from)]);
        }
        return Decoration.none;
      }
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── Rainbow brackets ─────────────────────────────────────────────────────────

const BRACKET_PAIRS = { '(': ')', '[': ']', '{': '}' };
const CLOSE_BRACKETS = new Set([')', ']', '}']);
const ALL_BRACKETS = new Set(['(', ')', '[', ']', '{', '}']);

const RAINBOW_COLORS = [
  '#c4964a', // gold
  '#c678dd', // purple
  '#61afef', // blue
  '#98c379', // green
  '#d19a66', // orange
  '#e5c07b', // amber
  '#56b6c2', // cyan
];

const rainbowDecos = RAINBOW_COLORS.map((color) =>
  Decoration.mark({ class: `cm-rb-${RAINBOW_COLORS.indexOf(color)}` })
);

function buildRainbowDecorations(view) {
  const doc = view.state.doc;
  const text = doc.toString();
  const decorations = [];
  const stack = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (BRACKET_PAIRS[ch]) {
      const depth = stack.length % RAINBOW_COLORS.length;
      stack.push({ pos: i, depth });
      decorations.push(rainbowDecos[depth].range(i, i + 1));
    } else if (CLOSE_BRACKETS.has(ch)) {
      const open = stack.pop();
      const depth = open ? open.depth : stack.length % RAINBOW_COLORS.length;
      decorations.push(rainbowDecos[depth].range(i, i + 1));
    }
  }

  return Decoration.set(decorations, true);
}

const rainbowBracketPlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = buildRainbowDecorations(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged)
      this.decorations = buildRainbowDecorations(update.view);
  }
}, { decorations: (v) => v.decorations });

// ── Inline diagnostics (error underlines + hover tooltips) ───────────────────

const setInlineDiagsEffect = StateEffect.define();

const errorUnderline = Decoration.mark({ class: 'cm-error-underline' });
const warningUnderline = Decoration.mark({ class: 'cm-warning-underline' });

const inlineDiagsField = StateField.define({
  create() { return { decorations: Decoration.none, diagnostics: [] }; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setInlineDiagsEffect)) {
        const diags = e.value || [];
        if (diags.length === 0) return { decorations: Decoration.none, diagnostics: [] };
        const doc = tr.state.doc;
        const decos = [];
        for (const d of diags) {
          if (d.line < 1 || d.line > doc.lines) continue;
          const line = doc.line(d.line);
          const from = Math.min(line.from + (d.col - 1), line.to);
          const to = d.endLine === d.line
            ? Math.min(line.from + (d.endCol - 1), line.to)
            : line.to;
          const actualTo = Math.min(Math.max(to, from + 1), doc.length);
          if (actualTo <= from) continue; // skip empty ranges (CodeMirror rejects them)
          decos.push((d.severity === 'error' ? errorUnderline : warningUnderline).range(from, actualTo));
        }
        return { decorations: Decoration.set(decos, true), diagnostics: diags };
      }
    }
    return { decorations: value.decorations.map(tr.changes), diagnostics: value.diagnostics };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

function inlineDiagsTooltip() {
  return hoverTooltip((view, pos) => {
    const { diagnostics } = view.state.field(inlineDiagsField);
    if (!diagnostics?.length) return null;
    const doc = view.state.doc;
    const line = doc.lineAt(pos);
    const lineNum = line.number;
    const col = pos - line.from + 1;
    const matching = diagnostics.filter((d) => {
      if (d.line !== lineNum) return false;
      const dFrom = d.col;
      const dTo = d.endLine === d.line ? d.endCol : line.to - line.from + 1;
      return col >= dFrom && col <= dTo;
    });
    if (matching.length === 0) return null;
    return {
      pos,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className = 'cm-diag-tooltip';
        matching.forEach((d) => {
          const row = document.createElement('div');
          row.className = 'cm-diag-tooltip-row';
          const icon = document.createElement('span');
          icon.className = `cm-diag-icon cm-diag-${d.severity}`;
          icon.textContent = d.severity === 'error' ? '✕' : '⚠';
          row.appendChild(icon);
          const msg = document.createElement('span');
          msg.className = 'cm-diag-msg';
          msg.textContent = `${d.code}: ${d.message}`;
          row.appendChild(msg);
          const copyBtn = document.createElement('button');
          copyBtn.className = 'cm-diag-copy';
          copyBtn.title = 'Copy error';
          copyBtn.textContent = '⎘';
          copyBtn.onclick = () => navigator.clipboard?.writeText(`${d.code}: ${d.message}`);
          row.appendChild(copyBtn);
          dom.appendChild(row);
        });
        return { dom };
      },
    };
  }, { hideOnChange: true });
}

const COLLECTION_RE = /^(List|IList|IEnumerable|ICollection|IReadOnlyList|HashSet|Queue|Stack|LinkedList|ObservableCollection|SortedSet)/i;
const DICT_RE = /^(Dictionary|IDictionary|IReadOnlyDictionary|SortedDictionary|ConcurrentDictionary)/i;
const ARRAY_SUFFIX_RE = /\[\]$/;

function formatPeekValue(escapedVal, escapedType) {
  // Try to detect collection-like values and show first items
  const raw = escapedVal;
  const type = escapedType;
  const isCollection = COLLECTION_RE.test(type) || ARRAY_SUFFIX_RE.test(type);
  const isDict = DICT_RE.test(type);

  // Try parse as JSON-like structure (the value string from the kernel)
  // Values often look like: "System.Collections.Generic.List`1[System.Int32]"
  // or for ToString() results: "[ 1, 2, 3, 4, 5 ]" or "{ key = val, ... }"
  if (isCollection || isDict) {
    // Try bracket-delimited list: [ item1, item2, ... ]
    const bracketMatch = raw.match(/^\[(.+)\]$/s) || raw.match(/^\{(.+)\}$/s);
    if (bracketMatch) {
      const inner = bracketMatch[1];
      const items = splitTopLevel(inner);
      const maxShow = 5;
      const shown = items.slice(0, maxShow);
      const more = items.length > maxShow ? items.length - maxShow : 0;
      let html = `<div class="cm-var-peek-collection-header">${items.length} item${items.length !== 1 ? 's' : ''}</div>`;
      html += '<div class="cm-var-peek-items">';
      for (const item of shown) {
        html += `<div class="cm-var-peek-item">${item.trim()}</div>`;
      }
      if (more > 0) html += `<div class="cm-var-peek-more">… ${more} more</div>`;
      html += '</div>';
      return html;
    }
    // Count hint: "Count = 5" pattern
    const countMatch = raw.match(/Count\s*=\s*(\d+)/);
    if (countMatch) {
      return `<div class="cm-var-peek-collection-header">${countMatch[1]} items</div><div class="cm-var-peek-scalar">${raw}</div>`;
    }
  }

  // For simple scalars or unrecognised formats, show truncated value
  const truncated = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
  return `<div class="cm-var-peek-scalar">${truncated}</div>`;
}

function splitTopLevel(s) {
  // Split by commas, but respect nested brackets/braces
  const items = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      items.push(s.slice(start, i));
      start = i + 1;
    }
  }
  if (start < s.length) items.push(s.slice(start));
  return items;
}

export function CodeEditor({ value, onChange, language = 'csharp', onCtrlEnter,
                      notebookId, cellId = null, readOnly = false, cellIndex = null, sqlSchema = null,
                      breakpoints = null, onToggleBreakpoint = null, pausedLine = null,
                      inlineDiagnostics = null, peekVars = null }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onCtrlEnterRef = useRef(onCtrlEnter);
  const readOnlyCompartmentRef = useRef(null);
  const sqlCompletionCompartmentRef = useRef(null);
  const cellIndexRef = useRef(cellIndex);
  const onToggleBreakpointRef = useRef(onToggleBreakpoint);
  useEffect(() => { onToggleBreakpointRef.current = onToggleBreakpoint; }, [onToggleBreakpoint]);
  const peekVarsRef = useRef(peekVars);
  const peekVarsCompartmentRef = useRef(null);
  useEffect(() => { peekVarsRef.current = peekVars; }, [peekVars]);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCtrlEnterRef.current = onCtrlEnter; }, [onCtrlEnter]);
  useEffect(() => { cellIndexRef.current = cellIndex; }, [cellIndex]);

  // Reconfigure SQL completions without recreating the editor
  useEffect(() => {
    const view = viewRef.current;
    const compartment = sqlCompletionCompartmentRef.current;
    if (!view || !compartment || language !== 'sql') return;
    view.dispatch({ effects: compartment.reconfigure(autocompletion({
      override: [buildSqlCompletionSource(sqlSchema)],
      defaultKeymap: true,
    })) });
  }, [sqlSchema, language]);

  // Reconfigure variable peek tooltip when vars change
  useEffect(() => {
    const view = viewRef.current;
    const compartment = peekVarsCompartmentRef.current;
    if (!view || !compartment) return;
    const ext = peekVarsRef.current?.length
      ? [hoverTooltip((view, pos) => {
          const word = view.state.wordAt(pos);
          if (!word) return null;
          const name = view.state.sliceDoc(word.from, word.to);
          const v = peekVarsRef.current?.find(v => v.name === name);
          if (!v) return null;
          return {
            pos: word.from,
            end: word.to,
            above: true,
            create() {
              const dom = document.createElement('div');
              dom.className = 'cm-var-peek-tooltip';
              const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              let bodyHtml;
              if (v.isNull) {
                bodyHtml = '<div class="cm-var-peek-null">null</div>';
              } else {
                bodyHtml = formatPeekValue(esc(v.value || ''), esc(v.typeName));
              }
              dom.innerHTML =
                `<div class="cm-var-peek-header">` +
                  `<span class="cm-var-peek-type">${esc(v.typeName)}</span>` +
                `</div>` +
                `<div class="cm-var-peek-name">${esc(v.name)}</div>` +
                `<div class="cm-var-peek-body">${bodyHtml}</div>`;
              return { dom };
            },
          };
        })]
      : [];
    view.dispatch({ effects: compartment.reconfigure(ext) });
  }, [peekVars]);

  // Toggle read-only without recreating the editor
  useEffect(() => {
    const view = viewRef.current;
    const compartment = readOnlyCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({ effects: compartment.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly]);

  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = language === 'markdown'
      ? markdown({ base: markdownLanguage })
      : language === 'sql'
        ? StreamLanguage.define(standardSQL)
        : language === 'http' || language === 'shell'
          ? [] // plain text — no syntax mode needed
          : StreamLanguage.define(csharp);

    const ctrlEnterKey = keymap.of([{
      key: 'Ctrl-Enter',
      run: () => { onCtrlEnterRef.current?.(); return true; },
    }]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
      if ((update.selectionSet || update.focusChanged) && update.view.hasFocus) {
        const pos  = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        _setCursorPos?.({ line: line.number, col: pos - line.from + 1, cellIndex: cellIndexRef.current });
      }
    });

    const blurHandler = EditorView.domEventHandlers({
      blur: () => { _setCursorPos?.(null); },
    });

    const readOnlyCompartment = new Compartment();
    readOnlyCompartmentRef.current = readOnlyCompartment;

    const extensions = [
      history(),
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      oneDark,
      langExt,
      ctrlEnterKey,
      indentUnit.of('    '),
      EditorState.tabSize.of(4),
      closeBrackets(),
      indentOnInput(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      updateListener,
      blurHandler,
      EditorView.lineWrapping,
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
      breakpointGutter((lineNum) => onToggleBreakpointRef.current?.(lineNum)),
      pausedLineField,
      bracketMatching({ brackets: '()[]{}' }),
      rainbowBracketPlugin,
      inlineDiagsField,
      inlineDiagsTooltip(),
    ];

    // Variable peek tooltip (reconfigurable via compartment)
    const peekVarsCompartment = new Compartment();
    peekVarsCompartmentRef.current = peekVarsCompartment;
    extensions.push(peekVarsCompartment.of([]));

    if (language === 'csharp' && notebookId) {
      extensions.push(
        ...buildLspExtensions(notebookId, cellId),
        Prec.highest(keymap.of([
          { key: 'Tab',   run: acceptCompletion },
          { key: 'Enter', run: acceptCompletion },
        ])),
      );
    }

    if (language === 'sql') {
      const sqlCompletionCompartment = new Compartment();
      sqlCompletionCompartmentRef.current = sqlCompletionCompartment;
      extensions.push(
        sqlCompletionCompartment.of(autocompletion({
          override: [buildSqlCompletionSource(sqlSchema)],
          defaultKeymap: true,
        })),
        Prec.highest(keymap.of([
          { key: 'Tab', run: acceptCompletion },
        ])),
      );
    }

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, notebookId]);

  // Sync external value changes (e.g., load notebook, format-on-save)
  // Preserves cursor at the nearest viable position in the new content.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      const oldPos = view.state.selection.main.head;
      const newLen = value.length;
      const clampedPos = Math.min(oldPos, newLen);
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor: clampedPos },
      });
    }
  }, [value]);

  // Sync breakpoints from external state
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !breakpoints) return;
    view.dispatch({ effects: setBreakpointsEffect.of(breakpoints) });
  }, [breakpoints]);

  // Sync paused line from external state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setPausedLineEffect.of(pausedLine) });
    // Scroll paused line into view
    if (pausedLine != null && pausedLine >= 1 && pausedLine <= view.state.doc.lines) {
      const linePos = view.state.doc.line(pausedLine).from;
      view.dispatch({ effects: EditorView.scrollIntoView(linePos, { y: 'center' }) });
    }
  }, [pausedLine]);

  // Sync inline diagnostics from execution errors
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setInlineDiagsEffect.of(inlineDiagnostics || []) });
  }, [inlineDiagnostics]);

  return <div ref={containerRef} className="code-editor-wrap" />;
}
