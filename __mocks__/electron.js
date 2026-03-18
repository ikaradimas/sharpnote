// Auto-mock for electron — used by Vitest when vi.mock('electron') is called
// and required directly by main.js when process.env.VITEST is set.
'use strict';

const _ipcHandlers = {};
const _ipcEvents   = {};

const app = {
  getPath: (name) => {
    const paths = {
      userData:  '/tmp/polyglot-test-userData',
      documents: '/tmp/polyglot-test-docs',
      home:      '/tmp/polyglot-test-home',
      logs:      '/tmp/polyglot-test-logs',
    };
    return paths[name] || '/tmp/polyglot-test';
  },
  getVersion: () => '1.0.0',
  getName: () => 'polyglot-notebook',
  isPackaged: false,
  addRecentDocument: () => {},
  whenReady: () => Promise.resolve(),
  on: () => {},
  quit: () => {},
};

const BrowserWindow = class {
  constructor() { this.webContents = { send: () => {}, on: () => {}, once: () => {} }; }
  loadFile() {} on() {} once() {}
  static getAllWindows() { return []; }
};

const ipcMain = {
  handle: (channel, fn) => { _ipcHandlers[channel] = fn; },
  on:     (channel, fn) => { _ipcEvents[channel]   = fn; },
};

const dialog = {
  showSaveDialog:   () => Promise.resolve({ canceled: true }),
  showOpenDialog:   () => Promise.resolve({ canceled: true }),
  showMessageBox:   () => Promise.resolve({ response: 1 }),
};

const Menu = {
  setApplicationMenu: () => {},
  buildFromTemplate:  () => ({}),
  getApplicationMenu: () => null,
};

const shell = {
  trashItem: () => Promise.resolve(),
  openPath:  () => Promise.resolve(''),
};

const nativeTheme = { on: () => {} };

module.exports = {
  app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme,
  _ipcHandlers, _ipcEvents,
};
