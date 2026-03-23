import React, { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';
import { CSHARP_KEYWORDS } from '../../config/csharp-keywords.js';

// ── Cursor position broadcast ─────────────────────────────────────────────────
// Any focused CodeEditor writes here; StatusBar subscribes via register fn.
export let _setCursorPos = null;
export function registerCursorPosSetter(fn) { _setCursorPos = fn; }

export function CodeEditor({ value, onChange, language = 'csharp', onCtrlEnter,
                      onRequestCompletions, onRequestLint, readOnly = false,
                      cellIndex = null }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onCtrlEnterRef = useRef(onCtrlEnter);
  const completionsRef = useRef(onRequestCompletions);
  const lintRef = useRef(onRequestLint);
  const readOnlyCompartmentRef = useRef(null);
  const cellIndexRef = useRef(cellIndex);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCtrlEnterRef.current = onCtrlEnter; }, [onCtrlEnter]);
  useEffect(() => { completionsRef.current = onRequestCompletions; }, [onRequestCompletions]);
  useEffect(() => { lintRef.current = onRequestLint; }, [onRequestLint]);
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

    if (language === 'csharp') {
      const keywordSource = (ctx) => {
        const word = ctx.matchBefore(/\w*/);
        if (!word || (word.from === word.to && !ctx.explicit)) return null;
        return {
          from: word.from,
          options: CSHARP_KEYWORDS.map((kw) => ({ label: kw, type: 'keyword' })),
          validFor: /^\w*$/,
        };
      };

      const dynamicSource = async (ctx) => {
        const fn = completionsRef.current;
        if (!fn) return null;
        const code = ctx.state.doc.toString();
        const pos  = ctx.pos;
        const textBefore = code.slice(0, pos);
        const isMemberAccess = /\w\.$/.test(textBefore) || /\w\.\w+$/.test(textBefore);
        const word = ctx.matchBefore(/\w*/);
        if (!isMemberAccess && !ctx.explicit && (!word || word.text.length < 2)) return null;
        try {
          const items = await fn(code, pos);
          if (!items?.length) return null;
          return {
            from: word?.from ?? pos,
            options: items.map((i) => ({ label: i.label, type: i.type || 'text', detail: i.detail })),
            validFor: /^\w*$/,
          };
        } catch { return null; }
      };

      extensions.push(
        autocompletion({ override: [keywordSource, dynamicSource], defaultKeymap: true }),
        keymap.of(completionKeymap),
      );

      const lintSource = async (view) => {
        const fn = lintRef.current;
        if (!fn) return [];
        try {
          const diags = await fn(view.state.doc.toString());
          return (diags || []).map((d) => ({
            from: d.from, to: d.to,
            severity: d.severity,
            message: d.message,
          }));
        } catch { return []; }
      };

      extensions.push(linter(lintSource, { delay: 600 }));
    }

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

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
