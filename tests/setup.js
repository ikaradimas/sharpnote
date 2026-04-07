import { vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// ── Mock heavy external modules ───────────────────────────────────────────────

vi.mock('chart.js/auto', () => ({
  default: class Chart {
    constructor() {}
    destroy() {}
    update() {}
  },
}));

vi.mock('chart.js', () => ({
  Chart: class Chart {
    static register() {}
    constructor() {}
    destroy() {}
    update() {}
  },
  registerables: [],
}));

vi.mock('marked', () => ({
  marked: { parse: (s) => `<p>${String(s)}</p>` },
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

// ── CodeMirror mocks ──────────────────────────────────────────────────────────

const mockCompartment = class {
  of(v) { return { compartment: this, value: v }; }
  reconfigure(v) { return { effects: true, value: v }; }
};

const mockState = {
  doc: { toString: () => '', lineAt: () => ({ number: 1, from: 0 }), length: 0 },
  selection: { main: { head: 0, from: 0, to: 0 } },
};

const mockView = class EditorView {
  constructor() {
    this.dom = document.createElement('div');
    this.state = mockState;
    this.hasFocus = false;
  }
  dispatch() {}
  destroy() {}
  focus() {}
  static get lineWrapping() { return { lineWrapping: true }; }
  static updateListener = { of: (fn) => ({ updateListener: fn }) };
  static domEventHandlers = (h) => ({ domEventHandlers: h });
  static theme = (obj) => ({ theme: obj });
};

vi.mock('@codemirror/view', () => ({
  EditorView: mockView,
  keymap: { of: (keys) => ({ keymap: keys }) },
  lineNumbers: () => ({ lineNumbers: true }),
  highlightActiveLine: () => ({ highlightActiveLine: true }),
  highlightActiveLineGutter: () => ({ highlightActiveLineGutter: true }),
  showTooltip: { from: (f) => ({ showTooltip: f }) },
  tooltips: () => ({ tooltips: true }),
  hoverTooltip: () => ({ hoverTooltip: true }),
  GutterMarker: class GutterMarker { range(from) { return { from, value: this }; } },
  gutter: () => ({ gutter: true }),
  Decoration: { none: {}, line: () => ({ line: true }), set: (a) => a },
}));

const mockStateEffect = { define: () => { const e = (v) => ({ effect: v }); e.of = (v) => ({ effect: v }); e.is = () => false; return e; } };
const mockStateField = {
  define: ({ create, update, provide }) => ({
    stateField: true,
    create,
    update,
    provide,
  }),
};

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: (cfg) => ({ ...mockState, ...cfg }),
    readOnly: { of: (v) => ({ readOnly: v }) },
  },
  Compartment: mockCompartment,
  Prec: { highest: (ext) => ext },
  StateEffect: mockStateEffect,
  StateField: mockStateField,
  RangeSet: { empty: {}, of: (a) => a },
}));

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: () => ({ history: true }),
  historyKeymap: [],
  indentWithTab: {},
}));

vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: { oneDark: true },
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => ({ markdown: true }),
  markdownLanguage: {},
}));

vi.mock('@codemirror/language', () => ({
  StreamLanguage: { define: () => ({ streamLanguage: true }) },
}));

vi.mock('@codemirror/legacy-modes/mode/clike', () => ({
  csharp: {},
}));

vi.mock('@codemirror/autocomplete', () => ({
  autocompletion: () => ({ autocompletion: true }),
  completionKeymap: [],
  acceptCompletion: () => false,
}));

vi.mock('@codemirror/lint', () => ({
  linter: () => ({ linter: true }),
}));

vi.mock('codemirror', () => ({}));

// ── window.electronAPI stub ───────────────────────────────────────────────────

const makeElectronAPI = () => ({
  onKernelMessage:    vi.fn(),
  offKernelMessage:   vi.fn(),
  sendToKernel:       vi.fn(),
  startKernel:        vi.fn().mockResolvedValue({ success: true }),
  stopKernel:         vi.fn().mockResolvedValue({ success: true }),
  resetKernel:        vi.fn(),
  interruptKernel:    vi.fn(),
  openNotebook:       vi.fn().mockResolvedValue({ canceled: true }),
  saveNotebook:       vi.fn().mockResolvedValue({ canceled: true }),
  saveNotebookAs:     vi.fn().mockResolvedValue({ canceled: true }),
  saveNotebookToPath: vi.fn().mockResolvedValue({ success: true }),
  saveFile:           vi.fn().mockResolvedValue({ canceled: true }),
  newNotebookDialog:  vi.fn().mockResolvedValue(1),
  getRecentFiles:     vi.fn().mockResolvedValue([]),
  loadAppSettings:    vi.fn().mockResolvedValue({}),
  saveAppSettings:    vi.fn().mockResolvedValue({}),
  loadDbConnections:  vi.fn().mockResolvedValue([]),
  saveDbConnections:  vi.fn().mockResolvedValue({}),
  getLogFiles:        vi.fn().mockResolvedValue([]),
  readLogFile:        vi.fn().mockResolvedValue(''),
  deleteLogFile:      vi.fn().mockResolvedValue({}),
  onLogEntry:         vi.fn(),
  offLogEntry:        vi.fn(),
  fsReaddir:          vi.fn().mockResolvedValue({ success: true, entries: [], dirPath: '/tmp', parentDir: null }),
  fsRename:           vi.fn().mockResolvedValue({ success: true }),
  fsDelete:           vi.fn().mockResolvedValue({ success: true }),
  fsMkdir:            vi.fn().mockResolvedValue({ success: true }),
  fsOpenPath:         vi.fn().mockResolvedValue({ success: true }),
  fsGetHome:          vi.fn().mockResolvedValue('/home/user'),
  libraryList:        vi.fn().mockResolvedValue({ success: true, files: [] }),
  libraryRead:        vi.fn().mockResolvedValue({ success: true, content: '' }),
  libraryWrite:       vi.fn().mockResolvedValue({ success: true }),
  libraryRename:      vi.fn().mockResolvedValue({ success: true }),
  libraryDelete:      vi.fn().mockResolvedValue({ success: true }),
  libraryMkdir:       vi.fn().mockResolvedValue({ success: true }),
  on:                 vi.fn(),
  removeListener:     vi.fn(),
});

if (typeof window !== 'undefined') {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      value: makeElectronAPI(),
      writable: true,
      configurable: true,
    });
  });
}
