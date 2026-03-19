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

function buildMenu() {
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
      label: _app ? _app.name : 'Polyglot Notebook',
      submenu: [
        { role: 'about' },
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
      { label: 'New Notebook',   accelerator: 'CmdOrCtrl+N',       click: () => send('new') },
      { type: 'separator' },
      { label: 'Open…',          accelerator: 'CmdOrCtrl+O',       click: () => send('open') },
      { label: 'Open Recent',    submenu: recentSubmenu },
      { type: 'separator' },
      { label: 'Save',           accelerator: 'CmdOrCtrl+S',       click: () => send('save') },
      { label: 'Save As…',       accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
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
    ],
  });

  template.push({
    label: 'Run',
    submenu: [
      { label: 'Run All Cells',    accelerator: 'CmdOrCtrl+Shift+Return', click: () => send('run-all') },
      { type: 'separator' },
      { label: 'Clear All Output', click: () => send('clear-output') },
      { type: 'separator' },
      { label: 'Reset Kernel',     click: () => send('reset') },
    ],
  });

  template.push({
    label: 'Tools',
    submenu: [
      { label: 'Packages',          accelerator: 'CmdOrCtrl+Shift+P', click: () => send('toggle-packages') },
      { label: 'Config',            accelerator: 'CmdOrCtrl+Shift+,', click: () => send('toggle-config') },
      { label: 'Library',           accelerator: 'CmdOrCtrl+Shift+L', click: () => send('toggle-library') },
      { label: 'Logs',              accelerator: 'CmdOrCtrl+Shift+G', click: () => send('toggle-logs') },
      { label: 'DB',                accelerator: 'CmdOrCtrl+Shift+D', click: () => send('toggle-db') },
      { label: 'Variables',         click: () => send('toggle-vars') },
      { label: 'Table of Contents', click: () => send('toggle-toc') },
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

  template.push({ label: 'Window', submenu: windowSubmenu });

  template.push({
    label: 'Help',
    submenu: [
      { label: 'Documentation', accelerator: 'F1', click: () => send('docs') },
    ],
  });

  return _Menu ? _Menu.buildFromTemplate(template) : template;
}

module.exports = { buildMenu, init, setMainWindow, setWindowTabs };
