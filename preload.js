const { contextBridge, ipcRenderer } = require('electron');

// WeakMaps to track wrapper functions so removeListener works correctly
const kernelMessageWrappers = new WeakMap();
const logEntryWrappers = new WeakMap();

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialogs
  showNewNotebookDialog: () => ipcRenderer.invoke('new-notebook-dialog'),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('rename-file', { oldPath, newPath }),

  // Kernel lifecycle
  startKernel: (notebookId) => ipcRenderer.invoke('start-kernel', notebookId),
  stopKernel: (notebookId) => ipcRenderer.invoke('stop-kernel', notebookId),

  // Kernel communication — payload is { notebookId, message }
  onKernelMessage: (callback) => {
    const wrapper = (_event, payload) => callback(payload);
    kernelMessageWrappers.set(callback, wrapper);
    ipcRenderer.on('kernel-message', wrapper);
  },
  offKernelMessage: (callback) => {
    const wrapper = kernelMessageWrappers.get(callback);
    if (wrapper) {
      ipcRenderer.removeListener('kernel-message', wrapper);
      kernelMessageWrappers.delete(callback);
    }
  },
  sendToKernel: (notebookId, message) => {
    ipcRenderer.send('kernel-send', { notebookId, message });
  },
  resetKernel: (notebookId) => {
    ipcRenderer.send('kernel-reset', notebookId);
  },
  interruptKernel: (notebookId) => ipcRenderer.send('kernel-interrupt', notebookId),

  // File operations
  saveNotebook: (data) => ipcRenderer.invoke('save-notebook', data),
  saveNotebookTo: (filePath, data) => ipcRenderer.invoke('save-notebook-to', { filePath, data }),
  loadNotebook: () => ipcRenderer.invoke('load-notebook'),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),

  // Font size
  onFontSizeChange: (callback) => {
    ipcRenderer.on('font-size-change', (_event, size) => callback(size));
  },
  setFontSize: (size) => ipcRenderer.invoke('font-size-set', size),

  // App paths
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),

  // Settings export / import
  exportSettings: (data) => ipcRenderer.invoke('settings-export', data),
  importSettings: () => ipcRenderer.invoke('settings-import'),

  // Menu actions
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action));
  },

  // Log operations
  onLogEntry: (callback) => {
    const wrapper = (_event, entry) => callback(entry);
    logEntryWrappers.set(callback, wrapper);
    ipcRenderer.on('log-entry', wrapper);
  },
  offLogEntry: (callback) => {
    const wrapper = logEntryWrappers.get(callback);
    if (wrapper) {
      ipcRenderer.removeListener('log-entry', wrapper);
      logEntryWrappers.delete(callback);
    }
  },
  getLogFiles: () => ipcRenderer.invoke('get-log-files'),
  readLogFile: (filename) => ipcRenderer.invoke('read-log-file', filename),
  deleteLogFile: (filename) => ipcRenderer.invoke('delete-log-file', filename),

  // Recent files
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  clearRecentFiles: () => ipcRenderer.invoke('clear-recent-files'),
  openRecentFile: (filePath) => ipcRenderer.invoke('open-recent-file', filePath),

  // DB connections
  loadDbConnections:  () => ipcRenderer.invoke('db-connections-load'),
  saveDbConnections: (list) => ipcRenderer.invoke('db-connections-save', list),

  // App settings
  loadAppSettings:  () => ipcRenderer.invoke('app-settings-load'),
  saveAppSettings: (s) => ipcRenderer.invoke('app-settings-save', s),

  // Window menu tab sync
  updateWindowTabs: (tabs) => ipcRenderer.send('update-window-tabs', tabs),

  // Quit guard
  onBeforeQuit: (callback) => ipcRenderer.on('before-quit', () => callback()),
  confirmQuit: () => ipcRenderer.send('confirm-quit'),

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // URL fetch (proxied through main to bypass renderer CSP for http:// URLs)
  fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url),

  // API Browser — saved configurations
  loadApiSaved: () => ipcRenderer.invoke('api-saved-load'),
  saveApiSaved: (list) => ipcRenderer.invoke('api-saved-save', list),

  // API Browser — request execution (proxied through main for CSP + auth header freedom)
  apiRequest: (opts) => ipcRenderer.invoke('api-request', opts),

  // Renderer-side logging (appears in Logs panel)
  rendererLog: (tag, message) => ipcRenderer.send('renderer-log', { tag, message }),

  // File explorer
  fsReaddir:  (dirPath)           => ipcRenderer.invoke('fs-readdir', dirPath),
  fsRename:   (oldPath, newPath)  => ipcRenderer.invoke('fs-rename', { oldPath, newPath }),
  fsDelete:   (filePath)          => ipcRenderer.invoke('fs-delete', filePath),
  fsMkdir:    (dirPath)           => ipcRenderer.invoke('fs-mkdir', dirPath),
  fsOpenPath: (filePath)          => ipcRenderer.invoke('fs-open-path', filePath),
  fsGetHome:  ()                  => ipcRenderer.invoke('fs-get-home'),

  // Code library
  getLibraryFiles: (subfolder) => ipcRenderer.invoke('get-library-files', subfolder || ''),
  readLibraryFile: (filePath) => ipcRenderer.invoke('read-library-file', filePath),
  saveLibraryFile: (filePath, content) => ipcRenderer.invoke('save-library-file', { filePath, content }),
  deleteLibraryFile: (filePath) => ipcRenderer.invoke('delete-library-file', filePath),
  openLibraryFolder: () => ipcRenderer.invoke('open-library-folder'),
});
