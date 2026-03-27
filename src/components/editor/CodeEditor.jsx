import React, { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, showTooltip } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { autocompletion, completionKeymap, acceptCompletion } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';
import { CSHARP_KEYWORDS } from '../../config/csharp-keywords.js';

// ── Cursor position broadcast ─────────────────────────────────────────────────
// Any focused CodeEditor writes here; StatusBar subscribes via register fn.
export let _setCursorPos = null;
export function registerCursorPosSetter(fn) { _setCursorPos = fn; }

export function CodeEditor({ value, onChange, language = 'csharp', onCtrlEnter,
                      onRequestCompletions, onRequestLint, onRequestSignature, readOnly = false,
                      lintEnabled = true, cellIndex = null }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onCtrlEnterRef = useRef(onCtrlEnter);
  const completionsRef = useRef(onRequestCompletions);
  const lintRef = useRef(onRequestLint);
  const signatureRef = useRef(onRequestSignature);
  const readOnlyCompartmentRef = useRef(null);
  const lintCompartmentRef     = useRef(null);
  const lintEnabledRef         = useRef(lintEnabled);
  const cellIndexRef = useRef(cellIndex);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCtrlEnterRef.current = onCtrlEnter; }, [onCtrlEnter]);
  useEffect(() => { completionsRef.current = onRequestCompletions; }, [onRequestCompletions]);
  useEffect(() => { lintRef.current = onRequestLint; }, [onRequestLint]);
  useEffect(() => { signatureRef.current = onRequestSignature; }, [onRequestSignature]);
  useEffect(() => { cellIndexRef.current = cellIndex; }, [cellIndex]);
  useEffect(() => { lintEnabledRef.current = lintEnabled; }, [lintEnabled]);

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
    const lintCompartment = new Compartment();
    lintCompartmentRef.current = lintCompartment;

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
        // Suppress keyword list in member-access context — the async dynamicSource
        // will return the correct member list and we don't want keyword noise.
        const textBefore = ctx.state.doc.sliceString(0, ctx.pos);
        if (/\w\.\w*$/.test(textBefore)) return null;

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
          if (items?.length) {
            return {
              from: word?.from ?? pos,
              options: items.map((i) => ({ label: i.label, type: i.type || 'text', detail: i.detail })),
              validFor: /^\w*$/,
            };
          }
          // In member-access context, keep the dropdown open with a "no results" indicator
          // instead of hiding it. Use from:pos so the filter text is always empty and the
          // sentinel is never filtered out by CodeMirror's client-side matching.
          if (isMemberAccess) {
            return {
              from: pos,
              options: [{ label: '(no members found)', type: 'text', apply: () => {} }],
            };
          }
          return null;
        } catch { return null; }
      };

      // Accept completions on Tab or Enter when a popup is active.
      // - defaultKeymap: false prevents autocompletion from registering Enter at high priority.
      // - Prec.highest ensures Tab/Enter → acceptCompletion beats indentWithTab (normal priority).
      // - acceptCompletion returns false when no completion is active, so both keys fall through
      //   to their normal behaviour (indent for Tab, newline for Enter).
      const completionKeys = [
        { key: 'Tab', run: acceptCompletion },
        { key: 'Enter', run: acceptCompletion },
        ...completionKeymap.filter((b) => b.key !== 'Enter'),
      ];
      extensions.push(
        autocompletion({ override: [keywordSource, dynamicSource], defaultKeymap: false }),
        Prec.highest(keymap.of(completionKeys)),
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

      extensions.push(lintCompartment.of(lintEnabledRef.current ? linter(lintSource, { delay: 600 }) : []));

      // ── Signature help tooltip ──────────────────────────────────────────────
      const setSigTip = StateEffect.define();
      const sigField = StateField.define({
        create: () => null,
        update(val, tr) {
          for (const e of tr.effects) if (e.is(setSigTip)) return e.value;
          return val;
        },
        provide: f => showTooltip.from(f),
      });

      let sigTimer = null;
      const sigListener = EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        clearTimeout(sigTimer);
        sigTimer = setTimeout(() => {
          const fn = signatureRef.current;
          const view = update.view;
          const state = view.state;
          const pos = state.selection.main.head;
          const code = state.doc.toString();
          const textBefore = code.slice(0, pos);

          // Quick check: are we inside any '(' ?
          let depth = 0;
          let hasParen = false;
          for (let i = textBefore.length - 1; i >= 0; i--) {
            if (textBefore[i] === ')') depth++;
            else if (textBefore[i] === '(') {
              if (depth === 0) { hasParen = true; break; }
              depth--;
            }
          }
          if (!hasParen || !fn) {
            view.dispatch({ effects: setSigTip.of(null) });
            return;
          }

          fn(code, pos).then(result => {
            if (!result?.signatures?.length) {
              view.dispatch({ effects: setSigTip.of(null) });
              return;
            }
            // Find the opening paren position for tooltip anchor
            let d = 0, anchorPos = pos;
            for (let i = textBefore.length - 1; i >= 0; i--) {
              if (textBefore[i] === ')') d++;
              else if (textBefore[i] === '(') {
                if (d === 0) { anchorPos = i + 1; break; }
                d--;
              }
            }
            view.dispatch({
              effects: setSigTip.of({
                pos: anchorPos,
                above: true,
                strictSide: true,
                arrow: false,
                create() {
                  const dom = document.createElement('div');
                  dom.className = 'cm-signature-help';
                  result.signatures.forEach((sig) => {
                    const line = document.createElement('div');
                    line.className = 'cm-sig-line';
                    const parenOpen = sig.label.indexOf('(');
                    const parenClose = sig.label.lastIndexOf(')');
                    if (parenOpen < 0 || !sig.parameters?.length) {
                      line.textContent = sig.label;
                    } else {
                      line.appendChild(document.createTextNode(sig.label.slice(0, parenOpen + 1)));
                      sig.parameters.forEach((p, i) => {
                        if (i > 0) line.appendChild(document.createTextNode(', '));
                        if (i === result.activeParam) {
                          const em = document.createElement('strong');
                          em.className = 'cm-sig-active';
                          em.textContent = p.label;
                          line.appendChild(em);
                        } else {
                          line.appendChild(document.createTextNode(p.label));
                        }
                      });
                      line.appendChild(document.createTextNode(sig.label.slice(parenClose)));
                    }
                    dom.appendChild(line);
                  });
                  return { dom };
                },
              }),
            });
          }).catch(() => {
            view.dispatch({ effects: setSigTip.of(null) });
          });
        }, 120);
      });

      extensions.push(sigField, sigListener);
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

  // Hot-swap linter when lintEnabled changes
  useEffect(() => {
    const view = viewRef.current;
    const compartment = lintCompartmentRef.current;
    if (!view || !compartment) return;
    const lintSource = async (v) => {
      const fn = lintRef.current;
      if (!fn) return [];
      try {
        const diags = await fn(v.state.doc.toString());
        return (diags || []).map((d) => ({ from: d.from, to: d.to, severity: d.severity, message: d.message }));
      } catch { return []; }
    };
    view.dispatch({ effects: compartment.reconfigure(lintEnabled ? linter(lintSource, { delay: 600 }) : []) });
  }, [lintEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

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
