import React, { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, Prec, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, hoverTooltip, showTooltip } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { acceptCompletion, autocompletion } from '@codemirror/autocomplete';
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
    return value;
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

function buildLspExtensions(notebookId) {
  const documentUri = `file:///script-${notebookId}.csx`;
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

// ── Component ─────────────────────────────────────────────────────────────────

export function CodeEditor({ value, onChange, language = 'csharp', onCtrlEnter,
                      notebookId, readOnly = false, cellIndex = null }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onCtrlEnterRef = useRef(onCtrlEnter);
  const readOnlyCompartmentRef = useRef(null);
  const cellIndexRef = useRef(cellIndex);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCtrlEnterRef.current = onCtrlEnter; }, [onCtrlEnter]);
  useEffect(() => { cellIndexRef.current = cellIndex; }, [cellIndex]);

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
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      updateListener,
      blurHandler,
      EditorView.lineWrapping,
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
    ];

    if (language === 'csharp' && notebookId) {
      extensions.push(
        ...buildLspExtensions(notebookId),
        // Tab/Enter accept the active completion item; acceptCompletion returns
        // false when no popup is open so both keys fall through normally.
        Prec.highest(keymap.of([
          { key: 'Tab',   run: acceptCompletion },
          { key: 'Enter', run: acceptCompletion },
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

  // Sync external value changes (e.g., load notebook)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="code-editor-wrap" />;
}
