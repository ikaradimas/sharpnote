'use strict';

let _app           = null;
let _mainWindow    = null;
let _Menu          = null;
let _windowTabs    = [];
let _getRecentFiles  = null;
let _saveRecentFiles = null;
let _applyFontSize   = null;
let _resetFontSize   = null;

function init({ app, mainWindow, Menu, getRecentFiles, saveRecentFiles, applyFontSize, resetFontSize }) {
  _app             = app;
  _mainWindow      = mainWindow;
  _Menu            = Menu;
  _getRecentFiles  = getRecentFiles;
  _saveRecentFiles = saveRecentFiles;
  _applyFontSize   = applyFontSize;
  _resetFontSize   = resetFontSize;
}

function setMainWindow(win) {
  _mainWindow = win;
}

function setWindowTabs(tabs) {
  _windowTabs = Array.isArray(tabs) ? tabs : [];
}

// Convert user-friendly key string (e.g. "Ctrl+Shift+R") to Electron accelerator.
// Replaces "Ctrl" with "CmdOrCtrl" so it works on both platforms.
function toAccelerator(keys) {
  return keys.replace(/\bCtrl\b/g, 'CmdOrCtrl');
}

function buildMenu(customShortcuts = {}) {
  const accel = (id, def) => toAccelerator(customShortcuts[id] || def);
  const recentFiles = _getRecentFiles ? _getRecentFiles() : [];

  const send = (action) => { if (_mainWindow) _mainWindow.webContents.send('menu-action', action); };

  const fontSizeItems = [
    { type: 'separator' },
    {
      label: 'Increase Font Size',
      accelerator: 'CmdOrCtrl+=',
      click: () => { if (_applyFontSize) _applyFontSize(1); },
    },
    {
      label: 'Increase Font Size',
      accelerator: 'CmdOrCtrl+Shift+=',
      visible: false,
      click: () => { if (_applyFontSize) _applyFontSize(1); },
    },
    {
      label: 'Decrease Font Size',
      accelerator: 'CmdOrCtrl+-',
      click: () => { if (_applyFontSize) _applyFontSize(-1); },
    },
    {
      label: 'Reset Font Size',
      accelerator: 'CmdOrCtrl+0',
      click: () => { if (_resetFontSize) _resetFontSize(); },
    },
  ];

  const template = [];

  if (process.platform === 'darwin') {
    template.push({
      label: _app ? _app.name : 'SharpNote',
      submenu: [
        { label: `About ${_app ? _app.name : 'SharpNote'}`, click: () => send('about') },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: accel('app-settings', 'Ctrl+,'), click: () => send('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const recentSubmenu = recentFiles.length === 0
    ? [{ label: 'No Recent Files', enabled: false }]
    : [
        ...recentFiles.map((r) => ({
          label: r.name,
          click: () => {
            if (_mainWindow) _mainWindow.webContents.send('menu-action', { type: 'open-recent', path: r.path });
          },
        })),
        { type: 'separator' },
        {
          label: 'Clear Recent Files',
          click: () => {
            if (_saveRecentFiles) _saveRecentFiles([]);
            if (_Menu) _Menu.setApplicationMenu(buildMenu());
          },
        },
      ];

  template.push({
    label: 'File',
    submenu: [
      { label: 'New Notebook',   accelerator: accel('nb-new',     'Ctrl+N'),       click: () => send('new') },
      { type: 'separator' },
      { label: 'Open…',          accelerator: accel('nb-open',    'Ctrl+O'),       click: () => send('open') },
      { label: 'Open Recent',    submenu: recentSubmenu },
      { label: 'Import Polyglot Notebook…',                                        click: () => send('import-polyglot') },
      { label: 'Import Data File…', accelerator: accel('import-data', 'Ctrl+Shift+I'), click: () => send('import-data') },
      { type: 'separator' },
      { label: 'Save',           accelerator: accel('nb-save',    'Ctrl+S'),       click: () => send('save') },
      { label: 'Save As…',       accelerator: accel('nb-save-as', 'Ctrl+Shift+S'), click: () => send('save-as') },
      { type: 'separator' },
      { label: 'Export as HTML…', click: () => send('export-html') },
      { label: 'Export as PDF…',        click: () => send('export-pdf') },
      { label: 'Export as Executable…', click: () => send('export-exe') },
      { label: 'Export as Docker Compose…', click: () => send('export-docker-compose') },
      { label: 'Export for Google Docs…', submenu: [
        { label: 'Code + Results', click: () => send('export-gdoc-all') },
        { label: 'Code Only',     click: () => send('export-gdoc-code') },
        { label: 'Results Only',  click: () => send('export-gdoc-results') },
      ]},
      ...(process.platform !== 'darwin' ? [
        { type: 'separator' },
        { role: 'quit' },
      ] : []),
    ],
  });

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      ...fontSizeItems,
      ...(process.platform !== 'darwin' ? [
        { type: 'separator' },
        { label: 'Preferences…', accelerator: accel('app-settings', 'Ctrl+,'), click: () => send('settings') },
      ] : []),
    ],
  });

  template.push({
    label: 'Run',
    submenu: [
      { label: 'Run All Cells',    accelerator: accel('nb-run-all', 'Ctrl+Shift+Return'), click: () => send('run-all') },
      { type: 'separator' },
      { label: 'Clear All Output', click: () => send('clear-output') },
      { type: 'separator' },
      { label: 'Reset Kernel',     click: () => send('reset') },
    ],
  });

  template.push({
    label: 'Tools',
    submenu: [
      { label: 'Config',            accelerator: accel('panel-config',   'Ctrl+Shift+,'), click: () => send('toggle-config') },
      { label: 'Packages',          accelerator: accel('panel-packages', 'Ctrl+Shift+P'), click: () => send('toggle-packages') },
      { label: 'Logs',              accelerator: accel('panel-logs',     'Ctrl+Shift+G'), click: () => send('toggle-logs') },
      { label: 'Database',          accelerator: accel('panel-db',       'Ctrl+Shift+D'), click: () => send('toggle-db') },
      { label: 'Variables',         accelerator: accel('panel-vars',     'Ctrl+Shift+V'), click: () => send('toggle-vars') },
      { label: 'Table of Contents', accelerator: accel('panel-toc',      'Ctrl+Shift+T'), click: () => send('toggle-toc') },
      { label: 'Library',           accelerator: accel('panel-library',  'Ctrl+Shift+L'), click: () => send('toggle-library') },
      { label: 'File Explorer',     accelerator: accel('panel-files',    'Ctrl+Shift+E'), click: () => send('toggle-files') },
      { label: 'API Browser',       accelerator: accel('panel-api',      'Ctrl+Shift+A'), click: () => send('toggle-api') },
      { label: 'API Editor',        accelerator: accel('panel-api-editor', 'Ctrl+Shift+Q'), click: () => send('toggle-api-editor') },
      { label: 'Git',               accelerator: accel('panel-git',        'Ctrl+Shift+J'), click: () => send('toggle-git') },
      { label: 'Graph',             accelerator: accel('panel-graph',    'Ctrl+Shift+R'), click: () => send('toggle-graph') },
      { label: 'To Do',             accelerator: accel('panel-todo',     'Ctrl+Shift+O'), click: () => send('toggle-todo') },
      { label: 'Regex',             accelerator: accel('panel-regex',    'Ctrl+Shift+X'), click: () => send('toggle-regex') },
      { label: 'Kafka',             accelerator: accel('panel-kafka',    'Ctrl+Shift+K'), click: () => send('toggle-kafka') },
      { label: 'History',            accelerator: accel('panel-history',  'Ctrl+Shift+H'), click: () => send('toggle-history') },
      { label: 'Dependencies',      accelerator: accel('panel-deps',     'Ctrl+Shift+Y'), click: () => send('toggle-deps') },
      { type: 'separator' },
      { label: 'Command Palette',   accelerator: accel('app-palette',  'Ctrl+K'), click: () => send('command-palette') },
      { type: 'separator' },
      { label: 'Settings…',         accelerator: accel('app-settings', 'Ctrl+,'), click: () => send('settings') },
    ],
  });

  const windowSubmenu = _windowTabs.length === 0
    ? [{ label: 'No open tabs', enabled: false }]
    : _windowTabs.map((tab) => ({
        label:   tab.isDirty ? `${tab.label} •` : tab.label,
        type:    'radio',
        checked: tab.isActive,
        click:   () => send({ type: 'activate-tab', id: tab.id }),
      }));

  template.push({
    label: 'View',
    submenu: [
      { label: 'Dashboard Mode', accelerator: accel('dashboard', 'Ctrl+Shift+B'), click: () => send('dashboard') },
    ],
  });

  template.push({ label: 'Window', submenu: windowSubmenu });

  template.push({
    label: 'Help',
    submenu: [
      { label: 'Documentation', accelerator: accel('app-docs', 'F1'), click: () => send('docs') },
      { type: 'separator' },
      { label: 'About SharpNote…', click: () => send('about') },
    ],
  });

  return _Menu ? _Menu.buildFromTemplate(template) : template;
}

module.exports = { buildMenu, init, setMainWindow, setWindowTabs };
